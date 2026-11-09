// make test (gjs -m test/icons.test.js): exits 1 on a failure. Runs in a
// scratch folder with a fake dock-favourites list: nothing of yours is used.

import GLib from 'gi://GLib';
import System from 'system';

import {paths, reconcile, resetAppIcon, setAppIcon} from '../icons.js';

let failed = 0;
function check(name, got, want) {
    if (JSON.stringify(got) === JSON.stringify(want))
        return;
    failed++;
    print(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const root = GLib.dir_make_tmp('dock-folders-test-XXXXXX');
const dir = (...p) => GLib.build_filenamev([root, ...p]);
const sys = dir('system', 'applications');
const user = dir('user', 'applications');
const pics = dir('user', 'dock-folders', 'icons');
for (const d of [sys, user, pics])
    GLib.mkdir_with_parents(d, 0o755);
let favorites = [];
paths.userApps = () => user;
paths.iconDir = () => pics;
paths.launchers = () => dir('launchers.json');
paths.systemApps = () => [sys];
paths.favorites = () => ({
    get_strv: () => [...favorites],
    set_strv: (_k, v) => {
        favorites = v;
    },
});

const write = (path, data) => GLib.file_set_contents(path, data);
const read = path => GLib.file_test(path, GLib.FileTest.EXISTS)
    ? new TextDecoder().decode(GLib.file_get_contents(path)[1]) : null;
const key = (data, k) => data?.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? null;
const launchers = list => write(paths.launchers(), JSON.stringify({launchers: list}));
const entry = (name, more = '') =>
    `[Desktop Entry]\nType=Application\nName=${name}\nExec=${name.toLowerCase()}\nIcon=${name.toLowerCase()}\n${more}`;
const app = id => ({
    id: `${id}.desktop`,
    get_app_info: () => ({
        get_filename: () => [`${user}/${id}.desktop`, `${sys}/${id}.desktop`]
            .find(p => GLib.file_test(p, GLib.FileTest.EXISTS)),
    }),
});

// A declared icon and window class, on a system launcher.
write(`${sys}/editor.desktop`, entry('Editor', '\n[Desktop Action new]\nName=New\nExec=editor -n\nIcon=editor\n'));
launchers([{ids: ['editor'], icon: '/icons/editor.png', wmclass: 'Editor'}]);
check('a copy is made', reconcile(), true);
let copy = read(`${user}/editor.desktop`);
check('its icon', key(copy, 'Icon'), '/icons/editor.png');
check('its window class', key(copy, 'StartupWMClass'), 'Editor');
check('the action\'s icon too', copy.split('[Desktop Action new]')[1].includes('Icon=/icons/editor.png'), true);
check('nothing to do the second time', reconcile(), false);

// An apt-style update: new contents, but the file's date is older than ours.
write(`${sys}/editor.desktop`, entry('Editor').replace('Exec=editor', 'Exec=editor --v2'));
GLib.spawn_command_line_sync(`touch -d 2000-01-01 ${sys}/editor.desktop`);
check('an older-dated update is still picked up', reconcile(), true);
copy = read(`${user}/editor.desktop`);
check('the update came through', key(copy, 'Exec'), 'editor --v2');
check('the icon kept', key(copy, 'Icon'), '/icons/editor.png');

// A renamed launcher: the newest id is used, the favourite moves, the old copy goes.
write(`${sys}/code.desktop`, entry('Code'));
launchers([{ids: ['com.example.Code', 'code'], icon: '/icons/code.png'}]);
reconcile();
check('the old name gets the copy while it is the one installed', key(read(`${user}/code.desktop`), 'Icon'), '/icons/code.png');
favorites = ['code.desktop', 'other.desktop'];
GLib.unlink(`${sys}/code.desktop`);
write(`${sys}/com.example.Code.desktop`, entry('Code'));
reconcile();
check('the new name gets it', key(read(`${user}/com.example.Code.desktop`), 'Icon'), '/icons/code.png');
check('the old copy is gone', read(`${user}/code.desktop`), null);
check('the favourite moved', favorites, ['com.example.Code.desktop', 'other.desktop']);

// No longer declared: its copy goes, the app's own launcher shows again
// (also launcher-overrides' copies, which are taken over).
write(`${sys}/files.desktop`, entry('Files'));
write(`${user}/files.desktop`, `${entry('Files').replace('[Desktop Entry]', `[Desktop Entry]\nX-Launcher-Override-Source=${sys}/files.desktop`)}`.replace('Icon=files', 'Icon=/icons/old.png'));
reconcile();
check('an undeclared copy is deleted', read(`${user}/files.desktop`), null);

// A launcher of the user's own is never touched.
write(`${user}/mine.desktop`, entry('Mine'));
reconcile();
check('a launcher of your own stays', read(`${user}/mine.desktop`), entry('Mine'));

// A web app's own launcher: edited in place, again after its browser rewrites it.
write(`${user}/webapp.desktop`, entry('WebApp'));
launchers([{ids: ['webapp'], icon: '/icons/web.png', user_only: true}]);
reconcile();
check('the web app gets its icon', key(read(`${user}/webapp.desktop`), 'Icon'), '/icons/web.png');
write(`${user}/webapp.desktop`, entry('WebApp'));   // the browser writes it again
reconcile();
check('and again after the browser rewrote it', key(read(`${user}/webapp.desktop`), 'Icon'), '/icons/web.png');
launchers([]);
reconcile();
check('undeclared: its own icon is back', key(read(`${user}/webapp.desktop`), 'Icon'), 'webapp');
check('and our key is gone', key(read(`${user}/webapp.desktop`), 'X-DockFolders-OriginalIcon'), null);

// Change Icon… wins over the declared icon; Reset Icon goes back to it.
write(`${sys}/term.desktop`, entry('Term'));
launchers([{ids: ['term'], icon: '/icons/term.png'}]);
reconcile();
const picture = dir('picked.png');
write(picture, 'png');
setAppIcon(app('term'), picture);
copy = read(`${user}/term.desktop`);
check('the chosen picture is used', key(copy, 'Icon')?.startsWith(`${pics}/term-`), true);
check('and is a copy of the picture', read(key(copy, 'Icon')), 'png');
reconcile();
check('it survives a reconcile', key(read(`${user}/term.desktop`), 'Icon')?.startsWith(`${pics}/`), true);
const chosen = key(read(`${user}/term.desktop`), 'Icon');
resetAppIcon(app('term'));
check('reset: back to the declared icon', key(read(`${user}/term.desktop`), 'Icon'), '/icons/term.png');
check('reset: the copied picture is deleted', read(chosen), null);

// Change Icon… on an app nothing declares; Reset Icon removes the copy.
write(`${sys}/viewer.desktop`, entry('Viewer'));
setAppIcon(app('viewer'), picture);
check('a copy with the chosen picture', key(read(`${user}/viewer.desktop`), 'Icon')?.startsWith(`${pics}/`), true);
resetAppIcon(app('viewer'));
check('reset: the copy is gone', read(`${user}/viewer.desktop`), null);

// An uninstalled app: its copy is deleted.
setAppIcon(app('viewer'), picture);
GLib.unlink(`${sys}/viewer.desktop`);
reconcile();
check('uninstalled: its copy is gone', read(`${user}/viewer.desktop`), null);

GLib.spawn_command_line_sync(`rm -rf ${root}`);
if (failed) {
    print(`${failed} failed`);
    System.exit(1);
}
print('icons: all passed');
