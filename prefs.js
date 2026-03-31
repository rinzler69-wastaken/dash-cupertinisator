import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { getCamleStatus, patchCamle, restoreCamle } from './patcher.js';

export default class DashAnimatorPreferences extends ExtensionPreferences {
    _d2dExtension() {
        try {
            return this._extensionManager?.lookup?.('dash-to-dock@micxgx.gmail.com')
                ?? globalThis.Main?.extensionManager?.lookup('dash-to-dock@micxgx.gmail.com')
                ?? null;
        } catch (e) { return null; }
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.dash-cupertinisator');

        // ── Animation page ────────────────────────────────────────────────────
        const animPage = new Adw.PreferencesPage({
            title: 'Animation',
            icon_name: 'media-playback-start-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: 'Animation Appearance',
            description: 'Configure how the dock icons magnify and animate on hover.',
        });
        animPage.add(group);

        const magToggleRow = new Adw.SwitchRow({
            title: 'Enable Magnification',
            subtitle: 'Toggle icon zooming on hover',
        });
        settings.bind('enable-magnification', magToggleRow, 'active', 0);

        const resetMagBtn = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            tooltip_text: 'Reset to defaults',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        resetMagBtn.connect('clicked', () => {
            settings.set_double('animation-magnify', 0.5);
            settings.set_double('animation-spread', 0.6);
            settings.set_double('animation-rise', 0.2);
        });
        magToggleRow.add_suffix(resetMagBtn);
        group.add(magToggleRow);

        const buildScaleRow = (key, title, subtitle, lower, upper, step) => {
            const row = new Adw.ActionRow({ title, subtitle });
            const scale = new Gtk.Scale({
                orientation: Gtk.Orientation.HORIZONTAL,
                adjustment: new Gtk.Adjustment({ lower, upper, step_increment: step }),
                digits: 2,
                draw_value: true,
                value_pos: Gtk.PositionType.RIGHT,
                valign: Gtk.Align.CENTER,
            });
            scale.set_size_request(200, -1);

            settings.bind(key, scale.adjustment, 'value', 0);
            row.add_suffix(scale);
            row.activatable_widget = scale;
            return row;
        };

        const magnifyRow = buildScaleRow('animation-magnify', 'Magnification Scale', 'Multiplier for how large the icon zooms', 0.1, 1.5, 0.1);
        group.add(magnifyRow);

        const spreadRow = buildScaleRow('animation-spread', 'Distribution Spread', 'How much adjacent icons spread outward', 0.1, 1.5, 0.1);
        group.add(spreadRow);

        const riseRow = buildScaleRow('animation-rise', 'Vertical Rise', 'How high the icon rises above the dock', 0.0, 1.0, 0.1);
        group.add(riseRow);

        const updateMagSensitivity = () => {
            const active = settings.get_boolean('enable-magnification');
            magnifyRow.sensitive = active;
            spreadRow.sensitive = active;
            riseRow.sensitive = active;
            resetMagBtn.sensitive = active;
        };
        updateMagSensitivity();
        settings.connect('changed::enable-magnification', updateMagSensitivity);

        const jumpGroup = new Adw.PreferencesGroup({
            title: 'Icon Bounce Animation',
            description: 'Tweak the bounce effect when apps load or are clicked.',
        });

        const resetJumpBtnRow = new Adw.ActionRow({ title: 'Icon Bounce Animation - Reset' });
        const resetJumpBtn = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            tooltip_text: 'Reset bounce settings to defaults',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        resetJumpBtn.connect('clicked', () => {
            settings.set_double('jump-height', 0.6);
            settings.set_double('jump-speed', 0.7);
        });
        resetJumpBtnRow.add_suffix(resetJumpBtn);
        jumpGroup.add(resetJumpBtnRow);

        animPage.add(jumpGroup);

        const jumpHeightRow = buildScaleRow('jump-height', 'Bounce Height', 'How high the icon bounces', 0.1, 0.8, 0.1);
        jumpGroup.add(jumpHeightRow);

        const jumpSpeedRow = buildScaleRow('jump-speed', 'Bounce Speed', 'Speed multiplier for the bounce animation', 0.5, 0.8, 0.1);
        jumpGroup.add(jumpSpeedRow);

        window.add(animPage);

        // ── Theme page ────────────────────────────────────────────────────────
        const themePage = new Adw.PreferencesPage({
            title: 'Theme',
            icon_name: 'preferences-desktop-appearance-symbolic',
        });

        const themeGroup = new Adw.PreferencesGroup({
            title: 'Dock Theme',
            description: 'Override Dash to Dock styling with macOS-inspired themes. Forces "Shrink the Dock" to always be enabled when this is active.',
        });
        themePage.add(themeGroup);

        const overrideRow = new Adw.SwitchRow({
            title: 'Override Theming',
            subtitle: 'Apply macOS-inspired dock styling on top of Dash to Dock',
        });
        settings.bind('override-theming', overrideRow, 'active', 0);
        themeGroup.add(overrideRow);

        const themeStyleGroup = new Adw.PreferencesGroup({ title: 'Style' });
        themePage.add(themeStyleGroup);

        const themeRow = new Adw.ActionRow({
            title: 'Dock Style',
            subtitle: 'Mojave sits flush at the screen edge · Big Sur floats above it',
        });
        const themeBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            valign: Gtk.Align.CENTER,
            css_classes: ['linked'],
        });
        const themeSpinner = new Adw.Spinner({
            valign: Gtk.Align.CENTER,
            margin_start: 12,
        });
        themeSpinner.visible = false;
        const mojaveBtn = new Gtk.ToggleButton({ label: 'Mojave' });
        const bigsurBtn = new Gtk.ToggleButton({ label: 'Big Sur', group: mojaveBtn });
        themeBox.append(mojaveBtn);
        themeBox.append(bigsurBtn);
        const syncThemeButtons = () => {
            const val = settings.get_string('dock-theme');
            mojaveBtn.active = val === 'mojave';
            bigsurBtn.active = val === 'bigsur';
        };
        syncThemeButtons();
        mojaveBtn.connect('toggled', () => { 
            if (mojaveBtn.active) settings.set_string('dock-theme', 'mojave'); 
        });
        bigsurBtn.connect('toggled', () => { 
            if (bigsurBtn.active) settings.set_string('dock-theme', 'bigsur'); 
        });
        
        // Dynamic binding for the throbber
        settings.bind('is-refreshing', themeSpinner, 'active', 0);
        settings.bind('is-refreshing', themeSpinner, 'visible', 0);

        settings.connect('changed::dock-theme', syncThemeButtons);
        themeRow.add_suffix(themeBox);
        themeRow.add_suffix(themeSpinner);
        themeStyleGroup.add(themeRow);

        const colorGroup = new Adw.PreferencesGroup({ title: 'Color Scheme' });
        themePage.add(colorGroup);

        const themeAwareRow = new Adw.SwitchRow({
            title: 'Follow System Theme',
            subtitle: 'Automatically match the system light/dark setting',
        });
        settings.bind('theme-aware', themeAwareRow, 'active', 0);
        colorGroup.add(themeAwareRow);

        const colorRow = new Adw.ActionRow({
            title: 'Color Scheme',
            subtitle: 'Manual override when Follow System Theme is off',
        });
        const colorBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            valign: Gtk.Align.CENTER,
            css_classes: ['linked'],
        });
        const colorSpinner = new Adw.Spinner({
            valign: Gtk.Align.CENTER,
            margin_start: 12,
        });
        colorSpinner.visible = false;
        const lightBtn = new Gtk.ToggleButton({ label: 'Light' });
        const darkBtn = new Gtk.ToggleButton({ label: 'Dark', group: lightBtn });
        colorBox.append(lightBtn);
        colorBox.append(darkBtn);
        const syncColorButtons = () => {
            const val = settings.get_string('dock-color-scheme');
            lightBtn.active = val === 'light';
            darkBtn.active = val === 'dark';
        };
        syncColorButtons();
        lightBtn.connect('toggled', () => { 
            if (lightBtn.active) settings.set_string('dock-color-scheme', 'light'); 
        });
        darkBtn.connect('toggled', () => { 
            if (darkBtn.active) settings.set_string('dock-color-scheme', 'dark'); 
        });

        // Dynamic binding for the throbber
        settings.bind('is-refreshing', colorSpinner, 'active', 0);
        settings.bind('is-refreshing', colorSpinner, 'visible', 0);

        settings.connect('changed::dock-color-scheme', syncColorButtons);
        colorRow.add_suffix(colorBox);
        colorRow.add_suffix(colorSpinner);
        colorGroup.add(colorRow);

        const updateColorSensitivity = () => { colorRow.sensitive = !settings.get_boolean('theme-aware'); };
        updateColorSensitivity();
        settings.connect('changed::theme-aware', updateColorSensitivity);

        const updateThemeSensitivity = () => {
            const on = settings.get_boolean('override-theming');
            themeStyleGroup.sensitive = on;
            colorGroup.sensitive = on;
        };
        updateThemeSensitivity();
        settings.connect('changed::override-theming', updateThemeSensitivity);

        window.add(themePage);

        // ── Extras page ────────────────────────────────────────────────
        const miscPage = new Adw.PreferencesPage({
            title: 'Extras',
            icon_name: 'emblem-system-symbolic',
        });

        // Notification Badges group
        const badgeGroup = new Adw.PreferencesGroup({
            title: 'Notification Badges',
            description: 'When enabled, this extension takes over badge functionality and suppresses Dash to Dock native badges.',
        });
        miscPage.add(badgeGroup);

        const badgeRow = new Adw.SwitchRow({
            title: 'Show Notification Badges',
            subtitle: 'Red dot on icons with unread notifications',
        });
        settings.bind('show-badges', badgeRow, 'active', 0);
        badgeGroup.add(badgeRow);

        const countRow = new Adw.SwitchRow({
            title: 'Show Unread Count Number',
            subtitle: 'Show the number of unread notifications inside the badge',
        });
        settings.bind('show-count', countRow, 'active', 0);
        badgeGroup.add(countRow);

        const updateBadgeSensitivity = () => {
            try {
                const d2dExt = this._d2dExtension();
                const d2dOn = d2dExt?.stateObj?.dockManager?.settings
                    ?.get_boolean('show-icons-emblems') ?? true;
                badgeRow.sensitive = d2dOn;
                countRow.sensitive = d2dOn;
                if (!d2dOn) {
                    badgeRow.subtitle = 'Disabled by Dash to Dock — enable Show icons emblems there first';
                    countRow.subtitle = 'Disabled';
                } else {
                    badgeRow.subtitle = 'Red dot on icons with unread notifications';
                    countRow.subtitle = 'Show the number of unread notifications inside the badge';
                }
            } catch (e) { }
        };
        updateBadgeSensitivity();

        // CAMLE Patcher group
        const camleGroup = new Adw.PreferencesGroup({
            title: 'Compiz Alike Magic Lamp Effect',
            description:
                'Patches the CAMLE extension to stop windows minimizing under the dock and enable bilinear texture filtering. ' +
                'Safely backs up original files. Recommended for Big Sur dock style.',
        });
        miscPage.add(camleGroup);

        const camleStatusRow = new Adw.ActionRow({ title: 'Patch Status' });
        const camleStatusLabel = new Gtk.Label({
            label: 'Checking...',
            css_classes: ['dim-label'],
        });
        camleStatusRow.add_suffix(camleStatusLabel);

        // Restore — icon-only button in rounded square style
        const restoreBtn = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Restore original CAMLE extension.js',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });

        // Patch button
        const patchBtn = new Gtk.Button({
            label: 'Patch',
            css_classes: ['suggested-action'],
            valign: Gtk.Align.CENTER,
        });

        camleStatusRow.add_suffix(restoreBtn);
        camleStatusRow.add_suffix(patchBtn);
        camleGroup.add(camleStatusRow);

        const extensionDir = this.metadata.path;

        const showModal = (title, body) => {
            const dialog = new Adw.MessageDialog({
                heading: title,
                body,
                transient_for: window,
            });
            dialog.add_response('ok', 'OK');
            dialog.present();
        };

        const refreshCamleStatus = () => {
            const status = getCamleStatus(extensionDir);
            if (status === 'not-installed') {
                camleStatusLabel.label = 'CAMLE not installed';
                patchBtn.sensitive = false;
                restoreBtn.sensitive = false;
            } else if (status === 'not-patched') {
                camleStatusLabel.label = 'Not patched';
                patchBtn.sensitive = true;
                restoreBtn.sensitive = false;
            } else {
                camleStatusLabel.label = 'Patched';
                patchBtn.sensitive = false;
                restoreBtn.sensitive = true;
            }
        };
        refreshCamleStatus();

        patchBtn.connect('clicked', () => {
            if (getCamleStatus(extensionDir) === 'not-installed') {
                showModal('CAMLE Not Installed',
                    'Compiz Alike Magic Lamp Effect is not installed.\n' +
                    'Please install it first through the GNOME Shell Extensions website.');
                return;
            }
            const result = patchCamle(extensionDir);
            if (result.success)
                showModal('Patch Applied',
                    'CAMLE has been patched successfully.\n' +
                    'Toggle CAMLE off and on, or log out and log back in to apply changes.');
            else
                showModal('Patch Failed', 'Something went wrong:\n' + result.error);
            refreshCamleStatus();
        });

        restoreBtn.connect('clicked', () => {
            if (getCamleStatus(extensionDir) !== 'patched') {
                showModal('No Backup Found',
                    'No backup directory found.\nYou have not patched CAMLE yet.');
                return;
            }
            const result = restoreCamle(extensionDir);
            if (result.success)
                showModal('Restored',
                    'CAMLE original extension.js has been restored.\n' +
                    'Toggle CAMLE off and on, or log out and log back in to apply changes.');
            else
                showModal('Restore Failed', 'Something went wrong:\n' + result.error);
            refreshCamleStatus();
        });

        window.add(miscPage);
    }
}