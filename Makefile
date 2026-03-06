all: build install lint

.PHONY: build install

build:
	glib-compile-schemas --strict --targetdir=schemas/ schemas

install:
	mkdir -p ~/.local/share/gnome-shell/extensions/dash-cupertinisator@rinzler69-wastaken.github.com/
	cp -R ./* ~/.local/share/gnome-shell/extensions/dash-cupertinisator@rinzler69-wastaken.github.com/

publish:
	rm -rf build
	mkdir build
	cp LICENSE *.js metadata.json stylesheet.css README.md build/
	cp -R schemas assets themes build/
	rm -rf build/schemas/*.xml # Optional: only keep compiled schemas in build if desired, but xml is fine too
	rm -rf ./*.zip
	cd build ; \
	zip -qr ../dash-cupertinisator@rinzler69-wastaken.github.com.zip .

lint:
	eslint ./

pretty:
	prettier --single-quote --write "**/*.js"
