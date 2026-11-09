// Apps' launchers, kept the way you want them through their updates: an icon
// of your own, and the right window class.
//
// Two sources, one engine (reconcile):
//   - Change Icon… / Reset Icon, from an app's right-click menu: a picture of
//     your own, copied to ~/.local/share/dockrr/icons (so moving or
//     deleting the original doesn't break it).
//   - ~/.config/dockrr/launchers.json, for a setup kept in a repo:
//       {"launchers": [
//         {"ids": ["com.microsoft.VSCode", "code"], "icon": "/path/to.png"},
//         {"ids": ["org.signal.Signal"], "wmclass": "org.signal.Signal"},
//         {"ids": ["chrome-…-Default"], "icon": "/path/to.png", "user_only": true}
//       ]}
//     "ids": every name the app's launcher has had, newest first (an update
//     can rename it: VS Code 1.143 went from code to com.microsoft.VSCode);
//     the newest that exists is used, and a dock favourite on an old one is
//     moved to it. "wmclass": StartupWMClass, for an app whose launcher names
//     the wrong window class (the dock then shows a second, generic icon for
//     its windows). "user_only": a launcher that exists only in
//     ~/.local/share/applications (a Chromium web app, which Chromium
//     writes there itself): edited in place, and again after Chromium
//     rewrites it.
// A picture chosen from the menu wins over launchers.json's, until Reset.
//
// It's done the freedesktop way: a copy of the app's .desktop file in
// ~/.local/share/applications, which comes before the system's, with just
// Icon= and StartupWMClass= changed. Each time the apps change (an update,
// an install, an uninstall; GNOME Shell's installed-changed) every copy is
// made again from the app's current file and saved only if it came out
// different. So an update's other changes come through (new Exec=, actions),
// a copy whose app is gone is deleted, and saving can't loop. Contents are
// compared, not dates: dpkg keeps a package's own file dates, so an updated
// launcher can look older than our copy.
//
// The picture is chosen in pick-icon.js, a GTK file chooser run as its own
// process: GNOME Shell can't show GTK windows itself.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const GROUP = 'Desktop Entry';
const OURS = 'X-Dockrr-Override';          // true: the file is our copy
const SOURCE = 'X-Dockrr-Source';          // the .desktop file it copies
const CHOSEN = 'X-Dockrr-Icon';            // the picture chosen in the menu
const ORIGINAL = 'X-Dockrr-OriginalIcon';  // a user file's own Icon=, edited in place
// Dockrr was Dock Folders until 2026-11: its keys are read as these.
const RENAMED = {
    'X-DockFolders-Override': OURS,
    'X-DockFolders-Source': SOURCE,
    'X-DockFolders-Icon': CHOSEN,
    'X-DockFolders-OriginalIcon': ORIGINAL,
};
// The earlier launcher-overrides script's mark: its copies are taken over.
const LEGACY = 'X-Launcher-Override-Source';

// Overridable by the tests.
export const paths = {
    userApps: () => GLib.build_filenamev([GLib.get_user_data_dir(), 'applications']),
    iconDir: () => GLib.build_filenamev([GLib.get_user_data_dir(), 'dockrr', 'icons']),
    // Where pictures were kept as Dock Folders (moved by config.js, moveOldData).
    oldIconDir: () => GLib.build_filenamev([GLib.get_user_data_dir(), 'dock-folders', 'icons']),
    launchers: () => GLib.build_filenamev([GLib.get_user_config_dir(), 'dockrr', 'launchers.json']),
    systemApps: () => [
        GLib.build_filenamev([GLib.get_user_data_dir(), 'flatpak', 'exports', 'share']),
        ...GLib.get_system_data_dirs(),
    ].map(dir => GLib.build_filenamev([dir, 'applications'])),
    favorites: () => new Gio.Settings({schema_id: 'org.gnome.shell'}),
};

const bare = id => id.replace(/\.desktop$/, '');
const userFile = id => GLib.build_filenamev([paths.userApps(), `${bare(id)}.desktop`]);
const exists = path => GLib.file_test(path, GLib.FileTest.EXISTS);

function load(path) {
    const keyfile = new GLib.KeyFile();
    keyfile.load_from_file(path,
        GLib.KeyFileFlags.KEEP_COMMENTS | GLib.KeyFileFlags.KEEP_TRANSLATIONS);
    renameOld(keyfile);
    return keyfile;
}

// A copy made as Dock Folders: its keys under their new names, and a picture
// path into the old folder pointed at the new one (the next save keeps it).
function renameOld(keyfile) {
    const keys = (() => {
        try {
            return keyfile.get_keys(GROUP)[0];
        } catch {
            return [];
        }
    })();
    for (const [old, now] of Object.entries(RENAMED)) {
        if (!keys.includes(old))
            continue;
        if (!keys.includes(now))
            keyfile.set_string(GROUP, now, keyfile.get_string(GROUP, old));
        keyfile.remove_key(GROUP, old);
    }
    const oldDir = `${paths.oldIconDir()}/`;
    for (const group of keyfile.get_groups()[0]) {
        for (const key of ['Icon', CHOSEN, ORIGINAL]) {
            const value = get(keyfile, key, group);
            if (value.startsWith(oldDir))
                keyfile.set_string(group, key, `${paths.iconDir()}/${value.slice(oldDir.length)}`);
        }
    }
}

function get(keyfile, key, group = GROUP) {
    try {
        return keyfile.get_string(group, key);
    } catch {
        return '';
    }
}

function has(keyfile, key, group = GROUP) {
    try {
        return keyfile.get_keys(group)[0].includes(key);  // has_key is not introspectable
    } catch {
        return false;
    }
}

function drop(keyfile, key) {
    if (has(keyfile, key))
        keyfile.remove_key(GROUP, key);
}

function text(path) {
    try {
        return new TextDecoder().decode(GLib.file_get_contents(path)[1]);
    } catch {
        return null;
    }
}

// Saves `keyfile` at `path` unless the file already says exactly that.
function save(keyfile, path) {
    const data = keyfile.to_data()[0];
    if (text(path) === data)
        return false;
    GLib.mkdir_with_parents(paths.userApps(), 0o755);
    GLib.file_set_contents(path, data);
    return true;
}

function remove(path) {
    try {
        Gio.File.new_for_path(path).delete(null);
        return true;
    } catch {
        return false;
    }
}

// Deletes the picture we copied, if `icon` is one.
function forgetPicture(icon) {
    if (icon?.startsWith(`${paths.iconDir()}/`))
        remove(icon);
}

// The app's own launcher, outside ~/.local/share/applications: a Flatpak's
// or the system's. Empty if there is none.
function systemSource(id) {
    for (const dir of paths.systemApps()) {
        const path = GLib.build_filenamev([dir, `${bare(id)}.desktop`]);
        if (exists(path))
            return path;
    }
    return '';
}

function readLaunchers() {
    const data = text(paths.launchers());
    if (data === null)
        return [];
    try {
        const launchers = JSON.parse(data).launchers ?? [];
        return launchers.filter(l => Array.isArray(l?.ids) && l.ids.length > 0)
            .map(l => ({...l, ids: l.ids.map(bare)}));
    } catch (e) {
        console.warn(`Dockrr: ${paths.launchers()}: ${e.message}`);
        return [];
    }
}

// Icon= in the entry and in each of its actions that has one.
function setIcon(keyfile, icon) {
    for (const group of keyfile.get_groups()[0]) {
        if (group === GROUP || (group.startsWith('Desktop Action ') && has(keyfile, 'Icon', group)))
            keyfile.set_string(group, 'Icon', icon);
    }
}

// The copy of `id` made again from its app's file `source`: `icon` (a
// chosen picture, else the declared one) and `wmclass`, if given.
function writeCopy(id, source, {icon, wmclass, chosen}) {
    const fresh = load(source);
    fresh.set_boolean(GROUP, OURS, true);
    fresh.set_string(GROUP, SOURCE, source);
    if (chosen)
        fresh.set_string(GROUP, CHOSEN, chosen);
    if (chosen || icon)
        setIcon(fresh, chosen || icon);
    if (wmclass)
        fresh.set_string(GROUP, 'StartupWMClass', wmclass);
    return save(fresh, userFile(id));
}

// A launcher of the user's own (a web app's), edited in place: its own Icon=
// is remembered, to be put back when nothing overrides it any more.
function writeInPlace(path, icon) {
    const keyfile = load(path);
    drop(keyfile, LEGACY);
    if (icon) {
        if (!has(keyfile, ORIGINAL))
            keyfile.set_string(GROUP, ORIGINAL, get(keyfile, 'Icon'));
        setIcon(keyfile, icon);
    } else if (has(keyfile, ORIGINAL)) {
        setIcon(keyfile, get(keyfile, ORIGINAL));
        keyfile.remove_key(GROUP, ORIGINAL);
    }
    return save(keyfile, path);
}

// A copy made by this file (or by launcher-overrides before it), and the
// file it copies.
function copySource(keyfile) {
    if (has(keyfile, OURS))
        return get(keyfile, SOURCE);
    const legacy = get(keyfile, LEGACY);
    return legacy && legacy !== 'self' ? legacy : '';
}

// The picture chosen in the menu for a launcher file, if any. (A copy made
// before X-Dockrr-Icon existed: its Icon= if that's one of ours.)
function chosenIcon(keyfile) {
    const chosen = get(keyfile, CHOSEN);
    if (chosen)
        return chosen;
    const icon = get(keyfile, 'Icon');
    return icon.startsWith(`${paths.iconDir()}/`) ? icon : '';
}

function chosenFor(path) {
    try {
        return chosenIcon(load(path));
    } catch {
        return '';
    }
}

// A dock favourite on a launcher that's gone moves to its new name.
function moveFavorite(from, to) {
    const settings = paths.favorites();
    const favorites = settings.get_strv('favorite-apps');
    const i = favorites.indexOf(`${from}.desktop`);
    if (i < 0)
        return;
    favorites[i] = `${to}.desktop`;
    settings.set_strv('favorite-apps', [...new Set(favorites)]);
    console.log(`Dockrr: favourite ${from} is now ${to}`);
}

// Brings every launcher we manage up to date. Returns whether a file changed.
export function reconcile() {
    let changed = false;
    const handled = new Set();
    for (const launcher of readLaunchers()) {
        try {
            if (launcher.user_only) {
                const path = userFile(launcher.ids[0]);
                if (exists(path)) {
                    changed = writeInPlace(path, chosenFor(path) || launcher.icon) || changed;
                    handled.add(launcher.ids[0]);
                }
                continue;
            }
            const current = launcher.ids.find(id => systemSource(id));
            if (!current)
                continue;   // not installed: any copy of it goes below
            changed = writeCopy(current, systemSource(current), {
                icon: launcher.icon,
                wmclass: launcher.wmclass,
                chosen: chosenFor(userFile(current)),
            }) || changed;
            handled.add(current);
            for (const old of launcher.ids.filter(id => id !== current && !systemSource(id)))
                moveFavorite(old, current);
        } catch (e) {
            console.warn(`Dockrr: launcher ${launcher.ids[0]}: ${e.message}`);
        }
    }

    // Everything else of ours: a picture chosen in the menu, kept up to date;
    // a copy that nothing asks for any more, deleted, so the app's own shows.
    let children;
    try {
        children = Gio.File.new_for_path(paths.userApps()).enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
    } catch {
        return changed;   // no ~/.local/share/applications
    }
    for (const info of children) {
        const name = info.get_name();
        const id = bare(name);
        if (!name.endsWith('.desktop') || handled.has(id))
            continue;
        const path = userFile(id);
        try {
            const keyfile = load(path);
            const source = copySource(keyfile);
            const chosen = chosenIcon(keyfile);
            if (source) {
                if (exists(source) && chosen) {
                    changed = writeCopy(id, source, {chosen}) || changed;
                } else if (remove(path)) {
                    forgetPicture(chosen);
                    changed = true;
                    console.log(`Dockrr: ${name} removed (${exists(source) ? 'nothing overrides it' : 'its app is gone'})`);
                }
            } else if (has(keyfile, ORIGINAL) || has(keyfile, LEGACY)) {
                changed = writeInPlace(path, chosen) || changed;
            }
        } catch (e) {
            console.warn(`Dockrr: ${path}: ${e.message}`);
        }
    }
    children.close(null);
    return changed;
}

// Whether the app can get an icon of its own: it has a .desktop file.
export function canChangeIcon(app) {
    return Boolean(app.get_app_info()?.get_filename());
}

// Whether it has a picture chosen in the menu (Reset Icon takes it back).
export function hasCustomIcon(app) {
    const path = app.get_app_info()?.get_filename();
    return Boolean(path?.startsWith(`${paths.userApps()}/`) && chosenFor(path));
}

// Gives `app` the picture at `picture` (a path) as its icon.
export function setAppIcon(app, picture) {
    const filename = app.get_app_info().get_filename();
    const target = userFile(app.id);

    // A new name each time: GNOME Shell caches icons by file.
    GLib.mkdir_with_parents(paths.iconDir(), 0o755);
    const ext = picture.match(/\.[A-Za-z0-9]+$/)?.[0].toLowerCase() ?? '';
    const copy = GLib.build_filenamev([paths.iconDir(), `${bare(app.id)}-${Date.now()}${ext}`]);
    Gio.File.new_for_path(picture).copy(Gio.File.new_for_path(copy),
        Gio.FileCopyFlags.OVERWRITE, null, null);

    const previous = exists(target) ? chosenFor(target) : '';
    if (filename === target) {
        const keyfile = load(target);
        if (!copySource(keyfile) && !has(keyfile, ORIGINAL))
            keyfile.set_string(GROUP, ORIGINAL, get(keyfile, 'Icon'));
        keyfile.set_string(GROUP, CHOSEN, copy);
        setIcon(keyfile, copy);
        save(keyfile, target);
    } else {
        writeCopy(app.id, filename, {chosen: copy});
    }
    if (previous !== copy)
        forgetPicture(previous);
    reconcile();   // the declared window class, if any, back on top
}

// Back to the declared icon, or the app's own.
export function resetAppIcon(app) {
    const path = app.get_app_info()?.get_filename();
    if (!path?.startsWith(`${paths.userApps()}/`))
        return;
    const keyfile = load(path);
    const chosen = chosenIcon(keyfile);
    if (!chosen)
        return;
    drop(keyfile, CHOSEN);
    if (!copySource(keyfile) && has(keyfile, ORIGINAL))
        setIcon(keyfile, get(keyfile, ORIGINAL));
    else
        setIcon(keyfile, '');   // made again from the app's file below
    save(keyfile, path);
    forgetPicture(chosen);
    reconcile();
}

// Opens the file chooser (pick-icon.js); calls onPicked(path) with the
// picture chosen, or nothing if it was cancelled.
export function pickPicture(dir, title, onPicked) {
    const script = dir.get_child('pick-icon.js').get_path();
    let proc;
    try {
        proc = Gio.Subprocess.new(['gjs', '-m', script, title],
            Gio.SubprocessFlags.STDOUT_PIPE);
    } catch (e) {
        console.warn(`Dockrr: file chooser: ${e.message}`);
        return;
    }
    proc.communicate_utf8_async(null, null, (_p, result) => {
        try {
            const [, out] = proc.communicate_utf8_finish(result);
            const path = out?.trim();
            if (path)
                onPicked(path);
        } catch (e) {
            console.warn(`Dockrr: file chooser: ${e.message}`);
        }
    });
}
