// The song playing now, in a section of its own at the dock's end: a card
// with the cover, the title and artist, and previous / play-pause / next.
//   - The card is tinted with the cover's main colour (track.js,
//     dominantColour), and a hairline along its bottom fills as the song
//     plays (polled once a second, only while playing and shown).
//   - A title too long for the space scrolls slowly back and forth.
//   - On a new song the card's contents fade out and back in.
//   - The cover is the player's dock icon: a click brings it to the front,
//     or minimizes it when it's there already (as the dock's own icons do).
// Shown only while a player has a track.
//
// The players are GNOME Shell's own (ui/mpris.js: any app with MPRIS, such
// as Supersonic or a browser playing a video), the ones its clock menu shows.
// A cover is shown (and tints the card) only when it's a local file
// (track.js, coverUri).
//
// The card goes in Dash to Dock's container after its row of icons (the
// scrolled _box), not in the row: no app or folder placement, here or in
// Dash to Dock, ever sees it. In a dock spanning the screen that's its far
// end; with Show Apps at the end instead, it comes right before Show Apps.

import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {MprisSource} from 'resource:///org/gnome/shell/ui/mpris.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    coverUri, describe, dominantColour, matchApp, pickPlayer, progressFraction, tint,
} from './track.js';

const TITLE_WIDTH = 220;        // px; longer titles scroll
const SCROLL_SPEED = 30;        // px a second
const SCROLL_PAUSE = 1800;      // ms at each end
const FADE = 140;               // ms each way between songs

function quietly(fn) {
    try {
        fn();
    } catch {
        // Already gone (a dock Dash to Dock destroyed).
    }
}

// The player's app: GNOME's link when the player gives one, else the running
// app with the player's name (Supersonic gives none; GNOME then keeps its
// MPRIS Identity as the source's title).
function playerApp(player) {
    return player.app ?? matchApp(player.source?.title,
        Shell.AppSystem.get_default().get_running(), app => app.get_name());
}

// The player in front: minimized. Open but behind or minimized: brought to
// the front. Not open (or no window we can find): opened, by the player.
function toggleWindow(player) {
    const app = playerApp(player);
    const windows = app?.get_windows().filter(w => !w.skip_taskbar) ?? [];
    if (windows.length === 0) {
        player.raise();
        return;
    }
    const focused = Shell.WindowTracker.get_default().focus_app === app;
    if (focused && windows.some(w => !w.minimized)) {
        windows.forEach(w => w.minimize());
        return;
    }
    Main.activateWindow(windows[0]);   // the most recently used
}

// The cover's main colour, read from a small copy of the picture. Cached:
// every dock asks, and a track's cover doesn't change.
const colours = new Map();
function coverColour(uri) {
    if (!uri)
        return null;
    if (!colours.has(uri)) {
        let colour = null;
        try {
            const path = Gio.File.new_for_uri(uri).get_path();
            const p = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, 32, 32, true);
            colour = dominantColour(p.get_pixels(), p.get_width(), p.get_height(),
                p.get_n_channels(), p.get_rowstride());
        } catch {
            // Not a picture we can read: no tint.
        }
        if (colours.size > 64)
            colours.clear();
        colours.set(uri, colour);
    }
    return colours.get(uri);
}

// The card in one dock.
class Tile {
    constructor(owner, dash) {
        this._owner = owner;
        this._dash = dash;
        this._horizontal = dash._isHorizontal ?? true;
        this._trackKey = null;
        this._fraction = null;

        // The card: the row, with the progress line laid over its bottom edge
        // (so the dock gets no taller).
        this.section = new St.Widget({
            style_class: 'dock-folders-now-playing',
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
        });
        this._row = new St.BoxLayout({
            style_class: 'dock-folders-now-playing-row',
            vertical: !this._horizontal,
            x_expand: true,
            y_expand: true,
        });
        this.section.add_child(this._row);
        this._progress = new St.Widget({
            style_class: 'dock-folders-now-playing-progress',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.END,
            width: 0,
            visible: false,
        });
        this.section.add_child(this._progress);
        this.section.connect('notify::width', () => this._drawProgress(false));

        this._cover = new St.Button({
            style_class: 'dock-folders-now-playing-cover',
            can_focus: true,
            track_hover: true,
        });
        this._cover.connect('clicked', () => {
            const player = this._owner.player;
            if (player)
                toggleWindow(player);
        });
        this._row.add_child(this._cover);

        // Title (scrolls when long) over artist (cut with "…"): only in a dock
        // along the top or bottom; a side dock is too narrow.
        this._text = new St.BoxLayout({
            style_class: 'dock-folders-now-playing-text',
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            visible: this._horizontal,
        });
        this._titleClip = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: true,
        });
        this._title = new St.Label({style_class: 'dock-folders-now-playing-title'});
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._titleClip.add_child(this._title);
        this._title.connect('notify::width', () => this._fitTitle());
        this._artist = new St.Label({style_class: 'dock-folders-now-playing-artist'});
        this._artist.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._text.add_child(this._titleClip);
        this._text.add_child(this._artist);
        this._row.add_child(this._text);

        const buttons = new St.BoxLayout({
            style_class: 'dock-folders-now-playing-buttons',
            vertical: !this._horizontal,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._previous = this._button('media-skip-backward-symbolic', _('Previous'),
            player => player.previous());
        this._play = this._button('media-playback-start-symbolic', _('Play'),
            player => player.playPause());
        this._next = this._button('media-skip-forward-symbolic', _('Next'),
            player => player.next());
        [this._previous, this._play, this._next].forEach(b => buttons.add_child(b));
        this._row.add_child(buttons);

        dash._dashContainer.add_child(this.section);
        this._sizeId = dash.connect('icon-size-changed', () => this._apply(this._owner.player));
    }

    _button(iconName, accessibleName, action) {
        const button = new St.Button({
            style_class: 'dock-folders-now-playing-button',
            accessible_name: accessibleName,
            can_focus: true,
            track_hover: true,
            child: new St.Icon({icon_name: iconName}),
        });
        button.connect('clicked', () => {
            const player = this._owner.player;
            if (player)
                action(player);
        });
        return button;
    }

    _coverIcon(player, size) {
        const cover = coverUri(player.trackCoverUrl);
        const gicon = cover ? new Gio.FileIcon({file: Gio.File.new_for_uri(cover)})
            : playerApp(player)?.get_icon() ?? new Gio.ThemedIcon({name: 'audio-x-generic'});
        return new St.Icon({gicon, icon_size: size});
    }

    // Shown with the player's track, hidden without one. A new song fades
    // the contents out and back in; the same song just updates.
    update(player) {
        const visible = Boolean(player?.trackTitle);
        this.section.visible = visible;
        if (!visible) {
            this._trackKey = null;
            this._stopScroll();
            return;
        }
        const key = `${player.trackTitle}\n${player.trackArtists}\n${player.trackCoverUrl}`;
        if (this._trackKey === null || key === this._trackKey) {
            this._trackKey = key;
            this._apply(player);
            return;
        }
        this._trackKey = key;
        this._row.remove_all_transitions();
        this._row.ease({
            opacity: 0,
            duration: FADE,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._apply(this._owner.player ?? player);
                this._row.ease({
                    opacity: 255,
                    duration: FADE,
                    mode: Clutter.AnimationMode.EASE_IN_QUAD,
                });
            },
        });
    }

    _apply(player) {
        if (!player?.trackTitle)
            return;
        const size = Math.max(16, this._dash.iconSize - 4);
        this._cover.set_child(this._coverIcon(player, size));
        const small = Math.max(12, Math.round(this._dash.iconSize * 0.42));
        [this._previous, this._play, this._next].forEach(b => (b.child.icon_size = small));

        const playing = player.status === 'Playing';
        this._play.child.icon_name = playing
            ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._play.accessible_name = playing ? _('Pause') : _('Play');
        this._previous.reactive = Boolean(player.canGoPrevious);
        this._next.reactive = Boolean(player.canGoNext);
        this._previous.opacity = this._previous.reactive ? 255 : 90;
        this._next.opacity = this._next.reactive ? 255 : 90;

        if (this._title.text !== player.trackTitle)
            this._title.text = player.trackTitle;
        this._artist.text = (player.trackArtists ?? []).filter(Boolean).join(', ');
        this._artist.visible = this._artist.text !== '';
        this._cover.accessible_name = describe(player.trackTitle, player.trackArtists);

        const colour = coverColour(coverUri(player.trackCoverUrl));
        const colours = colour ? tint(colour) : null;
        this.section.set_style(colours
            ? `background-color: ${colours.background}; border-color: ${colours.border};`
            : null);
        this._progress.set_style(colours ? `background-color: ${colours.accent};` : null);
    }

    // The progress line: `fraction` (0 to 1) of the card's width, or none.
    setProgress(fraction) {
        this._fraction = fraction;
        this._drawProgress(true);
    }

    _drawProgress(animate) {
        const fraction = this._fraction;
        this._progress.visible = fraction !== null && fraction !== undefined;
        if (!this._progress.visible)
            return;
        // Inside the line's side margins (stylesheet.css: 12px each).
        const width = Math.round(Math.max(0, this.section.width - 24) * fraction);
        this._progress.remove_transition('width');
        if (animate && width > this._progress.width) {
            this._progress.ease({width, duration: 900, mode: Clutter.AnimationMode.LINEAR});
        } else {
            this._progress.width = width;   // a new song, a seek back, a resize
        }
    }

    // The title's box is its own width, up to TITLE_WIDTH; a longer title
    // scrolls through it and back, pausing at each end.
    _fitTitle() {
        const [, natural] = this._title.get_preferred_width(-1);
        const [, height] = this._title.get_preferred_height(-1);
        const width = Math.min(natural, TITLE_WIDTH);
        if (this._titleClip.width !== width || this._titleClip.height !== height)
            this._titleClip.set_size(width, height);
        const overflow = Math.ceil(natural - width);
        if (overflow === this._overflow)
            return;
        this._overflow = overflow;
        this._stopScroll();
        if (overflow > 0)
            this._scroll(overflow);
    }

    _scroll(overflow) {
        const duration = Math.round((overflow / SCROLL_SPEED) * 1000);
        const go = target => this._title.ease({
            translation_x: target,
            delay: SCROLL_PAUSE,
            duration,
            mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
            onComplete: () => {
                if (this._overflow === overflow)
                    go(target === 0 ? -overflow : 0);
            },
        });
        go(-overflow);
    }

    _stopScroll() {
        quietly(() => this._title.remove_transition('translation-x'));
        quietly(() => (this._title.translation_x = 0));
    }

    destroy() {
        this._overflow = null;
        this._stopScroll();
        quietly(() => this._dash.disconnect(this._sizeId));
        quietly(() => this.section.destroy());
    }
}

// The players, a card in each dock, and the progress clock.
export class NowPlaying {
    constructor() {
        this._tiles = new Map();     // dash -> Tile
        this._changed = new Map();   // player -> when it last changed
        this._length = new Map();    // player -> its track's length (µs)
        this._tick = 0;
        this._source = new MprisSource();
        this._source.connectObject(
            'player-added', (_source, player) => this._watch(player),
            'player-removed', (_source, player) => this._unwatch(player), this);
    }

    get player() {
        return pickPlayer([...this._changed].map(([player, changed]) => ({
            player, changed, status: player.status, title: player.trackTitle,
        })))?.player ?? null;
    }

    _watch(player) {
        if (this._changed.has(player))
            return;
        this._changed.set(player, GLib.get_monotonic_time());
        player.connectObject('changed', () => {
            this._changed.set(player, GLib.get_monotonic_time());
            this._length.delete(player);   // read again: the track may be new
            this._update();
        }, this);
        this._update();
    }

    _unwatch(player) {
        player.disconnectObject(this);
        this._changed.delete(player);
        this._length.delete(player);
        this._update();
    }

    _update() {
        const player = this.player;
        this._tiles.forEach(tile => tile.update(player));
        this._updateClock(player);
    }

    // Once a second while something plays and a card is shown.
    _updateClock(player) {
        const run = player?.status === 'Playing' && this._tiles.size > 0;
        if (run && !this._tick) {
            this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this._readProgress().catch(() => {});
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!run && this._tick) {
            GLib.source_remove(this._tick);
            this._tick = 0;
        }
        if (this._tiles.size > 0)
            this._readProgress().catch(() => {});   // a paused song still shows how far it got
    }

    // MPRIS doesn't announce the position as it moves: it's asked for. The
    // bus name is GNOME's MprisPlayer's own (it has no public getter).
    async _readProgress() {
        const player = this.player;
        const bus = player?._busName;
        if (!bus) {
            this._tiles.forEach(tile => tile.setProgress(null));
            return;
        }
        try {
            if (!this._length.has(player)) {
                const metadata = await this._get(bus, 'Metadata');
                this._length.set(player, Number(metadata?.['mpris:length'] ?? 0));
            }
            const position = Number(await this._get(bus, 'Position'));
            if (player !== this.player)
                return;
            const fraction = progressFraction(position, this._length.get(player));
            this._tiles.forEach(tile => tile.setProgress(fraction));
        } catch {
            this._tiles.forEach(tile => tile.setProgress(null));
        }
    }

    _get(bus, property) {
        return new Promise((resolve, reject) => {
            Gio.DBus.session.call(bus, '/org/mpris/MediaPlayer2',
                'org.freedesktop.DBus.Properties', 'Get',
                new GLib.Variant('(ss)', ['org.mpris.MediaPlayer2.Player', property]),
                new GLib.VariantType('(v)'), Gio.DBusCallFlags.NONE, 2000, null,
                (connection, result) => {
                    try {
                        resolve(connection.call_finish(result).recursiveUnpack()[0]);
                    } catch (e) {
                        reject(e);
                    }
                });
        });
    }

    attach(dash) {
        if (this._tiles.has(dash) || !dash._dashContainer)
            return;
        const tile = new Tile(this, dash);
        this._tiles.set(dash, tile);
        tile.update(this.player);
        this._updateClock(this.player);
    }

    detachAll() {
        this._tiles.forEach(tile => tile.destroy());
        this._tiles.clear();
        this._updateClock(null);
    }

    destroy() {
        this.detachAll();
        this._source.disconnectObject(this);
        this._changed.forEach((_t, player) => player.disconnectObject(this));
        this._changed.clear();
        this._length.clear();
    }
}
