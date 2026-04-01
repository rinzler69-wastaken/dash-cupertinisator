// badge.js — minimal safe stub
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import St from 'gi://St';

import Clutter from 'gi://Clutter';

const EXTENSION_DIR = Gio.File.new_for_uri(import.meta.url).get_parent().get_path();
const BADGE_GICON = new Gio.FileIcon({
  file: Gio.File.new_for_path(`${EXTENSION_DIR}/assets/notification-badge.svg`),
});
export class BadgeManager {
  constructor() {
    this._appMap = {};
    this._badgesOn = true;
    this._countOn = true;
    this._sourceIds = new Map();
    this._trayIds = [];
    this._icons = new Set(); // all active uiIcons, for idle badge refresh

    try {
      this._tray = Main.messageTray;

      const onSourceAdded = (tray, source) => {
        this._watchSource(source);
        this._rebuild();
      };
      const onSourceRemoved = (tray, source) => {
        this._unwatchSource(source);
        this._rebuild();
      };

      try { this._trayIds.push(this._tray.connect('source-added', onSourceAdded)); } catch (e) { }
      try { this._trayIds.push(this._tray.connect('source-removed', onSourceRemoved)); } catch (e) { }
      try { this._trayIds.push(this._tray.connect('queue-changed', () => this._rebuild())); } catch (e) { }

      // Watch existing sources
      try {
        this._tray.getSources().forEach(s => this._watchSource(s));
      } catch (e) { }

      this._rebuild();

      // Probe which signals exist — log once to journalctl
      const probe = ['source-added', 'source-removed', 'notify::count',
        'queue-changed', 'changed', 'notify::source-count'];
      probe.forEach(sig => {
        try {
          const id = this._tray.connect(sig, () => { });
          this._tray.disconnect(id);
          log(`[badge] signal OK: ${sig}`);
        } catch (e) {
          log(`[badge] signal MISSING: ${sig}`);
        }
      });
    } catch (e) {
      this._tray = null;
    }
  }

  destroy() {
    try {
      this._trayIds.forEach(id => { try { this._tray?.disconnect(id); } catch (e) { } });
      this._trayIds = [];
      this._sourceIds.forEach((ids, source) => this._unwatchSource(source));
      this._sourceIds.clear();
    } catch (e) { }
    this._icons.clear();
    this._appMap = {};
  }

  _watchSource(source) {
    if (this._sourceIds.has(source)) return;
    const ids = [];
    for (const sig of ['notify::count', 'count-updated', 'changed']) {
      try {
        ids.push(source.connect(sig, () => this._rebuild()));
        break;
      } catch (e) { }
    }
    this._sourceIds.set(source, ids);
  }

  _unwatchSource(source) {
    const ids = this._sourceIds.get(source) ?? [];
    ids.forEach(id => { try { source.disconnect(id); } catch (e) { } });
    this._sourceIds.delete(source);
  }

  setBadgesEnabled(enabled) {
    this._badgesOn = enabled;
    // Force all badges to immediately re-evaluate visibility without needing a hover event!
    this._rebuild();
  }

  setCountEnabled(enabled) {
    this._countOn = enabled;
    this._rebuild();
  }

  _rebuild() {
    this._appMap = {};
    try {
      this._tray.getSources().forEach(source => {
        const id = source?.app?.get_id()
          ?? source?._app?.get_id()
          ?? source?._appId
          ?? null;
        if (id && source.count > 0)
          this._appMap[id] = (this._appMap[id] ?? 0) + source.count;
      });
    } catch (e) { }
    // Force-update all badge visibilities immediately, even when dock is idle
    this._icons.forEach(uiIcon => {
      try { this._applyBadge(uiIcon); } catch (e) { }
    });
    // Wake the animation loop so updateIcon() runs, computes geometry,
    // and sets _geometryReady = true for any icons whose badges haven't
    // been positioned yet (i.e. clones created while loop was dead).
    try { this.onRebuild?.(); } catch (e) { }
  }

  _applyBadge(uiIcon) {
    const badge = uiIcon._badge;
    if (!badge || !badge._geometryReady) return;
    const app = uiIcon._appwell?.app ?? null;
    const count = this._appMap[app?.get_id()] ?? 0;
    const show = this._badgesOn && count > 0;

    // Update nested text label instantly when count changes or toggle changes
    if (show && (badge._lastCount !== count || badge._lastCountOn !== this._countOn)) {
      badge._lastCount = count;
      badge._lastCountOn = this._countOn;
      let textStr = '';
      if (this._countOn) {
        textStr = count > 99 ? '99+' : count.toString();
      }
      badge._labelActor.set_text(textStr);
      let fontSize = textStr.length > 2 ? 24 : (textStr.length > 1 ? 30 : 34);
      // let fontSize = textStr.length > 2 ? 26 : (textStr.length > 1 ? 32 : 36);
      badge._labelActor.set_style(`color: white; font-weight: 400; font-size: ${fontSize}px; text-align: center; margin-bottom: 2px;`);
    }

    badge.visible = show;
  }

  attachToIcon(uiIcon) {
    try {
      const BASE_SIZE = 64;
      const badge = new St.Widget({
        name: 'cupertinisator-badge-container',
        visible: false,
        reactive: false,
      });

      const icon = new St.Icon({
        name: 'cupertinisator-badge-icon',
        gicon: BADGE_GICON,
        icon_size: BASE_SIZE,
      });
      badge.add_child(icon);

      const label = new St.Label({
        name: 'cupertinisator-badge-label',
        text: '',
      });

      badge.layout_manager = new Clutter.BinLayout();
      icon.x_expand = true;
      icon.y_expand = true;
      label.x_expand = true;
      label.y_expand = true;
      label.y_align = Clutter.ActorAlign.CENTER;
      label.x_align = Clutter.ActorAlign.CENTER;

      badge.add_child(label);

      badge._iconActor = icon;
      badge._labelActor = label;
      // Lock visibility until animator.js dynamically calculates perfect runtime geometry
      badge._geometryReady = false;
      badge.set_pivot_point(0, 0);


      uiIcon.add_child(badge);
      uiIcon._badge = badge;
      this._icons.add(uiIcon);
    } catch (e) { }
  }

  // scanTray has been removed, badge manager is strictly event-driven!

  updateIcon(uiIcon, iconSize) {
    try {
      const badge = uiIcon._badge;
      if (!badge) return;

      if (!this._badgesOn) { badge.visible = false; return; }

      const app = uiIcon._appwell?.app ?? null;
      const count = this._appMap[app?.get_id()] ?? 0;
      const hasNotification = app ? count > 0 : false;
      const shouldShow = this._badgesOn && hasNotification;

      // Always calculate and prime the geometry mathematics, even if invisible, 
      // so the badge is perfectly positioned the instant _applyBadge makes it visible later.
      const sz = Math.round(Math.max(16, iconSize * 0.5));
      if (badge._sz !== sz) {
        badge._sz = sz;
        const scale = sz / 64.0; // scale down from BASE_SIZE
        badge.set_scale(scale, scale);
      }
      // Pull the badge further inward so it sits securely on the corner
      badge.x = uiIcon.width - sz * 0.75;
      badge.y = -sz * 0.25;

      if (shouldShow && (badge._lastCount !== count || badge._lastCountOn !== this._countOn)) {
        badge._lastCount = count;
        badge._lastCountOn = this._countOn;
        let textStr = '';
        if (this._countOn) {
          textStr = count > 99 ? '99+' : count.toString();
        }
        badge._labelActor.set_text(textStr);
        let fontSize = textStr.length > 2 ? 26 : (textStr.length > 1 ? 32 : 36);
        badge._labelActor.set_style(`color: white; font-weight: 400; font-size: ${fontSize}px; text-align: center; margin-bottom: 2px;`);
      }

      // Geometry calculations are officially complete! Unlock visibility state permanently.
      badge._geometryReady = true;
      badge.visible = shouldShow;
    } catch (e) { }
  }
}