# Dockrr: package and install with GNOME's own gnome-extensions tool.
#   make install   pack, then install for your user (log in again, or on X11
#                  Alt+F2 then r, to load it; then enable it in Extensions)
#   make pack      just the .shell-extension.zip
#   make log       its messages from GNOME Shell's log, this boot
#   make test      the tests (gjs)

UUID := dockrr@psouranis.github.io
ZIP  := $(UUID).shell-extension.zip

.PHONY: pack install log test

pack:
	gnome-extensions pack --force --extra-source=config.js --extra-source=order.js --extra-source=icons.js --extra-source=pick-icon.js --extra-source=nowplaying.js --extra-source=track.js .

install: pack
	gnome-extensions install --force $(ZIP)

log:
	journalctl --user -b | grep -i 'dockrr'

test:
	gjs -m test/order.test.js
	gjs -m test/icons.test.js
	gjs -m test/track.test.js
