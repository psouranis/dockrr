// The file chooser for Change Icon… (icons.js): GNOME Shell can't show GTK
// windows, so it runs this as its own process. Prints the chosen picture's
// path, or nothing if cancelled.
//
//   gjs -m pick-icon.js [title]

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import System from 'system';

const filter = new Gtk.FileFilter({name: 'Images'});
for (const type of ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp', 'image/x-icon'])
    filter.add_mime_type(type);
const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
filters.append(filter);

const app = new Gtk.Application({application_id: 'io.github.psouranis.DockFolders.PickIcon',
    flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    app.hold();
    const dialog = new Gtk.FileDialog({
        title: ARGV[0] ?? 'Choose an Icon',
        filters,
        default_filter: filter,
        initial_folder: Gio.File.new_for_path(
            GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) ?? GLib.get_home_dir()),
    });
    dialog.open(null, null, (_d, result) => {
        try {
            const path = dialog.open_finish(result)?.get_path();
            if (path)
                print(path);
        } catch {
            // Cancelled.
        }
        app.release();
    });
});
System.exit(app.run([System.programInvocationName]));
