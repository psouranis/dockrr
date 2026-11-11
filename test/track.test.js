// make test (gjs -m test/track.test.js): exits 1 on a failure.

import System from 'system';

import {
    coverUri, describe, dominantColour, matchApp, pickPlayer, progressFraction, tint,
} from '../track.js';

let failed = 0;
function check(name, got, want) {
    if (JSON.stringify(got) === JSON.stringify(want))
        return;
    failed++;
    print(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const p = (id, status, title, changed) => ({id, status, title, changed});
const pick = players => pickPlayer(players)?.id ?? null;

check('nothing playing: no tile', pick([]), null);
check('the playing one wins over a paused one changed later',
    pick([p('music', 'Playing', 'Song', 1), p('browser', 'Paused', 'Video', 9)]), 'music');
check('two playing: the one that changed last',
    pick([p('a', 'Playing', 'A', 1), p('b', 'Playing', 'B', 5)]), 'b');
check('none playing: the one paused last',
    pick([p('a', 'Paused', 'A', 3), p('b', 'Paused', 'B', 2)]), 'a');
check('a stopped player is not shown',
    pick([p('a', 'Stopped', 'A', 9)]), null);
check('a player with no track is skipped',
    pick([p('a', 'Playing', '', 9), p('b', 'Paused', 'B', 1)]), 'b');

check('title and artists', describe('Bad Habit', ['Steve Lacy']), 'Bad Habit — Steve Lacy');
check('several artists', describe('Song', ['A', 'B']), 'Song — A, B');
check('no artist', describe('Song', []), 'Song');
check('empty artist names dropped', describe('Song', ['', null]), 'Song');

check('a local cover is used', coverUri('file:///tmp/cover.png'), 'file:///tmp/cover.png');
check('a web cover is not fetched', coverUri('https://music.example/cover.jpg'), '');
check('no cover', coverUri(undefined), '');

const apps = [{n: 'Waterfox'}, {n: 'Supersonic'}];
const nameOf = a => a.n;
check('the app of the same name', matchApp('Supersonic', apps, nameOf), {n: 'Supersonic'});
check('case and spaces ignored', matchApp(' supersonic ', apps, nameOf), {n: 'Supersonic'});
check('no app of that name', matchApp('Spotify', apps, nameOf), null);
check('no name', matchApp('', apps, nameOf), null);

check('halfway', progressFraction(150, 300), 0.5);
check('past the end is clamped', progressFraction(400, 300), 1);
check('no length: no line', progressFraction(10, 0), null);
check('no position: no line', progressFraction(undefined, 300), null);

// 2x2 RGBA: two vivid red pixels, a white one, a transparent one.
const px = [255, 20, 20, 255, 250, 30, 30, 255, 255, 255, 255, 255, 0, 0, 255, 0];
check('the vivid colour wins over white', dominantColour(px, 2, 2, 4, 8), [253, 25, 25]);
check('transparent pixels are left out',
    dominantColour([0, 0, 255, 0, 200, 200, 200, 255], 2, 1, 4, 8), [200, 200, 200]);
check('a grey cover: its average grey',
    dominantColour([100, 100, 100, 200, 200, 200], 2, 1, 3, 6), [150, 150, 150]);
check('nothing visible: none', dominantColour([0, 0, 0, 0], 1, 1, 4, 4), null);
check('the tint', tint([100, 50, 0]), {
    background: 'rgba(100, 50, 0, 0.22)',
    accent: 'rgb(170, 142, 115)',
});

if (failed) {
    print(`${failed} failed`);
    System.exit(1);
}
print('track: all passed');
