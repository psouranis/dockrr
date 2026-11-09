// The now-playing tile's decisions (nowplaying.js), kept apart from GNOME
// Shell so the tests can run them (test/track.test.js).

// Which player the tile shows: the one playing, else the one paused most
// recently. `players`: [{status, title, changed}] (MPRIS PlaybackStatus,
// the track's title, when it last changed); one without a title is skipped.
export function pickPlayer(players) {
    const recent = (a, b) => b.changed - a.changed;
    const withTrack = players.filter(p => p.title);
    return withTrack.filter(p => p.status === 'Playing').sort(recent)[0] ??
        withTrack.filter(p => p.status === 'Paused').sort(recent)[0] ?? null;
}

// The hover label: "Title — Artist, Artist", or just the title.
export function describe(title, artists) {
    const who = (artists ?? []).filter(Boolean).join(', ');
    return who ? `${title} — ${who}` : title;
}

// A cover only from a local file: a web address would have the dock fetch it
// over the network (a music server's, say), so the player's icon stands in.
export function coverUri(url) {
    return /^file:\/\//i.test(url ?? '') ? url : '';
}

// The app a player belongs to, when it doesn't say (GNOME links them by the
// DesktopEntry the player publishes, and Supersonic publishes none): the one
// among `apps` with the player's name (its MPRIS Identity), ignoring case.
// `nameOf(app)` reads an app's name.
export function matchApp(name, apps, nameOf) {
    const want = name?.trim().toLowerCase();
    if (!want)
        return null;
    return apps.find(app => nameOf(app)?.trim().toLowerCase() === want) ?? null;
}

// How far through the track, 0 to 1; null when the player doesn't say.
// MPRIS gives both in microseconds.
export function progressFraction(position, length) {
    if (!(length > 0) || !(position >= 0))
        return null;
    return Math.min(1, position / length);
}

// A cover's main colour, [r, g, b]: the average of its vivid, bright pixels
// (each weighted by saturation times brightness), or of all of them for a
// cover that is mostly grey. null for no visible pixels. `pixels` is a
// GdkPixbuf's (RGB or RGBA, `rowstride` bytes a row).
export function dominantColour(pixels, width, height, channels, rowstride) {
    let r = 0, g = 0, b = 0, weight = 0;
    let allR = 0, allG = 0, allB = 0, count = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * rowstride + x * channels;
            if (channels === 4 && pixels[i + 3] < 128)
                continue;
            const [R, G, B] = [pixels[i], pixels[i + 1], pixels[i + 2]];
            const max = Math.max(R, G, B), min = Math.min(R, G, B);
            const w = max === 0 ? 0 : ((max - min) / max) * (max / 255);
            r += R * w;
            g += G * w;
            b += B * w;
            weight += w;
            allR += R;
            allG += G;
            allB += B;
            count++;
        }
    }
    if (count === 0)
        return null;
    if (weight < count * 0.05)
        return [allR, allG, allB].map(v => Math.round(v / count));
    return [r, g, b].map(v => Math.round(v / weight));
}

// The section's colours from a cover's main colour: a soft background, a
// slightly stronger edge, and a light accent for the progress line.
export function tint([r, g, b]) {
    const light = v => Math.round(v + (255 - v) * 0.45);
    return {
        background: `rgba(${r}, ${g}, ${b}, 0.32)`,
        border: `rgba(${r}, ${g}, ${b}, 0.55)`,
        accent: `rgb(${light(r)}, ${light(g)}, ${light(b)})`,
    };
}
