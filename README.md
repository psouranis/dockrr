# Dock Folders

GNOME's app folders in [Dash to Dock](https://github.com/micheleg/dash-to-dock).

<table>
  <tr>
    <td align="center"><img src="screenshots/dock-left.png" alt="A Messaging folder in a dock on the left, its pop-up open with Signal, Discord, Slack, Viber and Thunderbird and their unread badges" width="260"></td>
    <td align="center"><img src="screenshots/dock-bottom.png" alt="The same folder in a dock at the bottom, its pop-up open above it" width="560"></td>
  </tr>
  <tr>
    <td align="center">Dock on the left</td>
    <td align="center">Dock at the bottom</td>
  </tr>
</table>

- **A folder in the dock**: a rounded square showing its first four apps.
  Click it and its apps open in a pop-up grid, each with its name; click one
  to open it, or bring its window forward. Right-click one for its own app
  menu, as on the dock (its windows, New Window, its actions, Pin to Dock,
  App Details, Quit), over the pop-up: Esc or a click elsewhere goes back
  to the folder. New Window is left out for apps that only ever have one
  window (Signal, Discord, Slack, and any app for which it opened nothing).
- **Dash to Dock's own running indicators**: on the folder while one of its
  apps is open, and on each open app in the pop-up, in whatever style Dash
  to Dock is set to (dots, dashes, segments...), changing with it.
- **Unread badges**: red counts at the icon's top right, as on the dock's
  other icons: on each app in the pop-up, and their total on the folder.
  They're Dash to Dock's own counts: the app's launcher count (Signal,
  Slack, Discord and others set one) plus its GNOME notifications, except
  that an app that sets its own count is counted by it alone. A leftover
  notification (one an app posted before an update restarted it) can't
  leave a stuck "1".
- **Fewer dock icons**: an app in a dock folder gets no dock icon of its own
  while it runs. The folder stands for it.
- **Drop apps in, drag them out**: drag an app icon from the dock (or Show
  Apps) onto the folder; it lights up, and on release the app goes in:
  added to the app folder (and out of any other), unpinned from the dock.
  Drag an app out of the pop-up and let go anywhere but the folder: it
  leaves the folder (and isn't pinned), so it's back to a plain app.
- **Make folders from the dock**: right-click an app in the dock → **Add to
  Folder** → one of the dock's folders, or **New Folder…**: name it, and a
  folder with that app takes the app's place in the dock.
- **Your own app icons**: right-click an app (in the dock or a folder's
  pop-up) → **Change Icon…**, and pick a picture (PNG, SVG, JPEG...). It
  becomes the app's icon everywhere: dock, folders, Show Apps, Alt+Tab.
  **Reset Icon** takes it back. It's a copy of the app's `.desktop` file in
  `~/.local/share/applications`, made again from the app's own file whenever
  apps change (so an update's other changes come through, with your icon)
  and removed if the app is uninstalled. Contents are compared, not dates:
  dpkg keeps a package's own file dates, so an updated launcher can look
  older than the copy.
- **The song playing now**, in a card of its own at the dock's end (in a
  dock spanning the screen, its far end; never among the apps and folders):
  the album cover, the title and artist, and **previous / play-pause /
  next**. The card is tinted with the cover's main colour, changing with
  each song, and a hairline along its bottom fills as the song plays. A long
  title scrolls slowly back and forth, and a new song fades in. Click the cover to bring the
  player to the front, again to minimize it (as the dock's own icons do).
  It's there only while something plays or is paused. Any app with MPRIS
  works (Supersonic, Spotify, a browser playing a video): the same players
  GNOME's clock menu shows. A cover is shown only from a local file, so the
  dock never fetches one over the network. In a dock on the left or right,
  the buttons stack and the text is left out.
- **Icons and window classes from a file**, for a setup kept in a repo:
  `~/.config/dock-folders/launchers.json`, read live:

  ```json
  {"launchers": [
    {"ids": ["com.microsoft.VSCode", "code"], "icon": "/home/you/.local/share/icons/code.png"},
    {"ids": ["org.signal.Signal"], "wmclass": "org.signal.Signal"},
    {"ids": ["chrome-<app id>-Default"], "icon": "/path/to/web-app.png", "user_only": true}
  ]}
  ```

  `ids` lists every name the app's launcher has had, newest first: when an
  update renames it (VS Code 1.143 went from `code` to
  `com.microsoft.VSCode`) the new one gets the icon and a dock favourite on
  the old one moves to it. `wmclass` sets `StartupWMClass`, for an app whose
  launcher names the wrong window class (the dock then shows a second,
  generic icon for its windows). `user_only` is for a launcher that exists
  only in `~/.local/share/applications`, like a Chromium web app's: it's
  edited in place, and again whenever Chromium rewrites it. A picture picked
  with Change Icon… wins over the file's, until Reset Icon. Take an app off
  the list and its copy goes, so its own icon is back.
- **Move it, rename it**: drag the folder along the dock; a gap opens where
  it will go, between any two icons (apps or folders), as when you drag an
  app, and it goes there when you let go (Esc, or letting go off the dock,
  leaves it where it was). Or right-click it: Rename…, Move Left, Move Right, Remove from
  Dock, Dock Folders Settings.
- **Any folder**: the settings window (Extensions app, or right-click a dock
  folder) has a switch per app folder.

Dash to Dock can't hold folders itself, and the extension that pinned
folders to GNOME's dash supports GNOME 43 only.

## Requirements

Works on:

- **OS**: Debian 13 (trixie)
- **GNOME Shell**: 48 (tested on 48.7), X11 session
- **Dash to Dock**: version 100 (Debian's `gnome-shell-extension-dashtodock`)

## Install

```sh
make install
```

Then log in again (on X11, Alt+F2, `r`, Enter is enough) and turn it on in
the Extensions app, or `gnome-extensions enable dock-folders@psouranis.github.io`.

## Use

1. Make a folder: right-click an app in the dock → Add to Folder → New
   Folder…. (Or in Show Apps: drop one app on another.)
2. Put it in the dock: right-click a dock folder → Dock Folders Settings, or
   the Extensions app → Dock Folders → settings, and switch it on.
3. Drag it to where you want it.

A folder's name and apps are always the app folder's own, read live: change
the folder in Show Apps and the dock follows.
