import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { BadgeManager } from './badge.js';
import St from 'gi://St';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';

import { setTimeout, setInterval, clearInterval, clearTimeout } from './utils.js';

const Point = Graphene.Point;

const ANIM_INTERVAL = 15;
const ANIM_INTERVAL_PAD = 15;
const ANIM_POS_COEF = 2;
const ANIM_PULL_COEF = 1.8;
const ANIM_SCALE_COEF = 3.5;
const ANIM_ON_LEAVE_COEF = 1.0;
const ANIM_ICON_RAISE = 0.75;
const ANIM_ICON_SCALE = 1.8;
const ANIM_ICON_SCALE_REDUCE = 0.5;
const ANIM_ICON_HIT_AREA = 1.25;
const ANIM_ICON_QUALITY = 2.0;
const ANIM_REENABLE_DELAY = 750;
const ANIM_DEBOUNCE_END_DELAY = 1000;
const ANIM_PREVIEW_DURATION = 1500;

const DOT_CANVAS_SIZE = 96;

export class Animator {
  constructor() {
    this._enabled = false;
    this.animationInterval = ANIM_INTERVAL;
    this._separator = null;
  }

  enable() {
    if (this._enabled) return;
    this._iconsContainer = new St.Widget({
      name: 'iconsContainer',
      reactive: false,
      can_focus: false
    });
    Main.layoutManager.addChrome(this._iconsContainer, {
      affectsStruts: false,
      affectsInputRegion: false,
      trackFullscreen: false
    });
    this._dotsContainer = new St.Widget({
      name: 'dotsContainer',
      reactive: false,
      can_focus: false
    });
    Main.layoutManager.addChrome(this._dotsContainer, {
      affectsStruts: false,
      affectsInputRegion: false,
      trackFullscreen: false
    });

    this._enabled = true;
    this._dragging = false;
    this._oneShotId = null;
    this._relayout = 8;
    this.show_dots = true;
    this._badgeManager = new BadgeManager();
    // When a notification arrives, wake the loop so updateIcon() runs,
    // computes geometry, sets _geometryReady = true. After the loop
    // debounces off, _endAnimation calls _persistBadgedClones which
    // keeps badged icons as clones permanently until next loop run.
    this._badgeManager.onRebuild = () => {
      // Immediately persist badge state so it's visible right now,
      // not after the debounce window expires.
      this._persistBadgedClones();
      // Also wake the loop so updateIcon() runs geometry and _geometryReady is set.
      this._startAnimation();
    };

    try {
      this._badgeManager.setBadgesEnabled(this.extension._settings?.get_boolean('show-badges') ?? true);
      this._badgeSettingId = this.extension._settings?.connect('changed::show-badges', () => {
        try { this._badgeManager?.setBadgesEnabled(this.extension._settings.get_boolean('show-badges')); } catch (e) { }
      });
    } catch (e) { }
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;
    this._endAnimation();
    if (this._oneShotId) { clearInterval(this._oneShotId); this._oneShotId = null; }
    if (this._leaveSettleId) { clearTimeout(this._leaveSettleId); this._leaveSettleId = null; }
    if (this._iconsContainer) {
      Main.layoutManager.removeChrome(this._iconsContainer);
      this._iconsContainer.destroy();
      this._iconsContainer = null;
      Main.layoutManager.removeChrome(this._dotsContainer);
      this._dotsContainer.destroy();
      this._dotsContainer = null;
    }
    if (this._badgeManager) { this._badgeManager.destroy(); this._badgeManager = null; }
    this._dots = [];
    if (this._separator) { this._separator.destroy(); this._separator = null; }
    if (this.dashContainer) this._restoreIcons();
  }

  reloadIcons() {
    if (!this._enabled) return;
    if (this._iconsContainer) {
      this._iconsContainer.get_children().forEach(c => {
        if (c._appwell) c._appwell._dashAnimatorHooked = false;
        c.destroy();
      });
    }
    if (this._dotsContainer) {
      this._dotsContainer.destroy_all_children();
      this._dots = [];
    }
    this._iconsCount = 0;
    this._startAnimation();
  }

  showAll() {
    if (this._iconsContainer) this._iconsContainer.visible = true;
    if (this._dotsContainer) this._dotsContainer.visible = true;
  }

  hideAll() {
    if (this._iconsContainer) this._iconsContainer.visible = false;
    if (this._dotsContainer) this._dotsContainer.visible = false;
  }

  isJumping() {
    if (!this._iconsContainer) return false;
    let icons = this._iconsContainer.get_children().filter(c => c.name !== 'cupertinisator-badge');
    return icons.some(i => (i._clickJump > 0 || i._attentionJump > 0));
  }

  // isMagnifying() {
  //   if (!this._iconsContainer) return false;
  //   let threshold = this.extension.enable_magnification ? 1.6 : 1.01;
  //   let icons = this._iconsContainer.get_children().filter(c => c.name !== 'cupertinisator-badge');
  //   return icons.some(i => (i._currentScale > threshold || i._targetScale > threshold));
  // }

  isMagnifying() {
    if (!this._iconsContainer) return false;
    if (this.extension?.enable_magnification === false) return false;
    let animateIcons = this._iconsContainer.get_children().filter(c => c.name !== 'cupertinisator-badge');
    return animateIcons.some(icon => {
      return (icon._currentScale !== undefined && icon._currentScale > 1.6) ||
        (icon._targetScale !== undefined && icon._targetScale > 1.6);
    });
  }

  preview() { this._preview = ANIM_PREVIEW_DURATION; }

  _precreate_dots(count) {
    if (!this._dots) this._dots = [];
    if (this.show_dots && this.extension.xDot) {
      for (let i = 0; i < count - this._dots.length; i++) {
        let dot = new this.extension.xDot(DOT_CANVAS_SIZE);
        this._dots.push(dot);
        this._dotsContainer.add_child(dot);
        dot.set_position(0, 0);
      }
    }
    this._dots.forEach(d => { d.visible = false; });
  }

  _animate() {
    if (!this._iconsContainer || !this.dashContainer) return;
    this.dash = this.dashContainer.dash;
    if (this._relayout > 0 && this.extension && this.extension._updateLayout) {
      this.extension._updateLayout();
      this._relayout--;
    }
    this._iconsContainer.width = 1; this._iconsContainer.height = 1;
    this._dotsContainer.width = 1; this._dotsContainer.height = 1;

    let jumping = this.isJumping();
    let magnification = (this.extension.animation_magnify * 0.9 || 0) - ANIM_ICON_SCALE_REDUCE;
    if (this.extension._isHidden && !jumping) magnification = 0;
    let spread = typeof this.extension.animation_spread === 'number' ? this.extension.animation_spread : 0.5;

    let animateIcons = this._iconsContainer.get_children().filter(c => c.name !== 'cupertinisator-badge');
    if (this._iconsCount != animateIcons.length) {
      this._relayout = 8;
      this._iconsCount = animateIcons.length;
    }

    let dock_position = 'bottom';
    let iy = 1;
    let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    let pivot = new Point(); pivot.x = 0.5; pivot.y = 1.0;
    let iconSize = (this.dash && this.dash.iconSize) ? this.dash.iconSize * (this.extension.scale || 1.0) : 48;

    switch (this.dashContainer._position) {
      case 0: dock_position = 'top'; iy = -1.0; pivot.x = 0.5; pivot.y = 0.0; break;
      case 1: dock_position = 'right'; iy = 0; pivot.x = 1.0; pivot.y = 0.5; break;
      case 2: dock_position = 'bottom'; break;
      case 3: dock_position = 'left'; iy = 0; pivot.x = 0.0; pivot.y = 0.5; break;
    }

    let visible_dots = 0;
    let icons = this._findIcons();

    icons.forEach((c) => {
      let bin = c._bin;
      if (!bin) return;
      if (c._appwell && c._appwell.app && c._appwell.app.get_n_windows() > 0) visible_dots++;
      let found = false;
      for (let i = 0; i < animateIcons.length; i++) {
        if (animateIcons[i]._bin == bin) { found = true; break; }
      }
      if (!found) {
        let uiIcon = new St.Widget({ name: 'icon', width: iconSize, height: iconSize });
        uiIcon.pivot_point = pivot; uiIcon._bin = bin; uiIcon._appwell = c._appwell; uiIcon._label = c._label;
        this._iconsContainer.add_child(uiIcon);
        let draggable = c._draggable;
        if (draggable && !draggable._dragBeginId) {
          draggable._dragBeginId = draggable.connect('drag-begin', () => { this._dragging = true; this.disable(); });
          draggable._dragEndId = draggable.connect('drag-end', () => { this._dragging = false; this._oneShotId = setTimeout(this.enable.bind(this), ANIM_REENABLE_DELAY); });
        }
      }
    });

    this._precreate_dots(visible_dots);
    let pointer = global.get_pointer();
    let nearestIcon = null;
    let nearestDistance = -1;

    animateIcons.forEach((c) => {
      let orphan = true;
      for (let i = 0; i < icons.length; i++) { if (icons[i]._bin == c._bin) { orphan = false; break; } }
      if (orphan) this._iconsContainer.remove_child(c);
    });

    animateIcons = this._iconsContainer.get_children().filter(c => c.name !== 'cupertinisator-badge');
    let cornerPos = this._get_position(this.dashContainer);
    animateIcons.sort((a, b) => {
      let dstA = this._get_distance_sqr(cornerPos, this._get_position(a._bin));
      let dstB = this._get_distance_sqr(cornerPos, this._get_position(b._bin));
      return dstA - dstB;
    });

    let dotIndex = 0;
    animateIcons.forEach((icon) => {
      let bin = icon._bin;
      let pos = this._get_position(bin);
      icon.set_size(iconSize, iconSize);

      if (!icon.first_child && bin.first_child) {
        let img = new St.Icon({ name: 'icon', icon_name: bin.first_child.icon_name || null, gicon: bin.first_child.gicon || null });
        img._source = bin; img.set_icon_size(iconSize * ANIM_ICON_QUALITY); img.set_scale(1 / ANIM_ICON_QUALITY, 1 / ANIM_ICON_QUALITY);
        icon.add_child(img);
        if (this._badgeManager) this._badgeManager.attachToIcon(icon);
        if (icon._appwell && !icon._appwell._dashAnimatorHooked) {
          icon._appwell._dashAnimatorHooked = true;
          icon._appwell.connect('clicked', () => {
            if (icon._appwell.app && icon._appwell.app.get_n_windows() === 0) { icon._clickJump = 1.0; this._startAnimation(); if (this.dashContainer?._animateIn) this.dashContainer._animateIn(0.2, 0); }
          });
          icon._appwell.connect('notify::urgent', () => {
            if (icon._appwell.urgent && !(icon._attentionJump > 0)) { icon._attentionJump = 1.0; icon._attentionCooldown = 60; this._startAnimation(); if (this.dashContainer?._animateIn) this.dashContainer._animateIn(0.2, 0); }
          });
        }
      }

      let bposcenter = [pos[0] + (iconSize * scaleFactor) / 2, pos[1] + (iconSize * scaleFactor) / 2];
      let dst = this._get_distance(pointer, bposcenter);
      icon._distance = dst;
      icon._edgeNear = pos[0]; icon._edgeFar = pos[0] + iconSize * scaleFactor;
      icon._edgeNearV = pos[1]; icon._edgeFarV = pos[1] + iconSize * scaleFactor;
      if (nearestDistance == -1 || nearestDistance > dst) { nearestDistance = dst; nearestIcon = icon; }
      icon._nativeTarget = [pos[0], pos[1]]; icon._target = [pos[0], pos[1]]; icon._targetScale = 1;
    });

    if (this._preview && this._preview > 0) {
      nearestIcon = animateIcons[Math.floor(animateIcons.length / 2)];
      this._preview -= this.animationInterval;
    } else this._preview = null;

    if (!this._inDash || this.extension._isHidden) nearestIcon = null;

    if (nearestIcon) {
      let raise = ANIM_ICON_RAISE - (ANIM_ICON_RAISE * (1.0 - (this.extension.animation_rise || 0)) - 0.1);
      let peakScale = ANIM_ICON_SCALE + magnification;
      let safetyFloor = this.extension.enable_magnification ? 1.8 : 2.5;
      if (peakScale < safetyFloor) peakScale = safetyFloor;
      let hitRadius = iconSize * scaleFactor * (ANIM_ICON_HIT_AREA + spread * 2.5);
      let isHorizontal = dock_position === 'bottom' || dock_position === 'top';
      let cursorAxis = isHorizontal ? pointer[0] : pointer[1];

      animateIcons.forEach((icon) => {
        let edgeNear = isHorizontal ? icon._edgeNear : icon._edgeNearV;
        let edgeFar = isHorizontal ? icon._edgeFar : icon._edgeFarV;
        let edgeDist = (cursorAxis < edgeNear) ? (edgeNear - cursorAxis) : ((cursorAxis > edgeFar) ? (cursorAxis - edgeFar) : 0);
        if (edgeDist >= hitRadius) return;
        let normalized = edgeDist / hitRadius;
        let falloff = Math.cos(normalized * Math.PI / 2);
        let targetSz = 1.0 + (peakScale - 1.0) * falloff;
        if (targetSz > icon._targetScale) {
          icon._targetScale = targetSz;
          if (dock_position === 'bottom') icon._target[1] -= iconSize * raise * scaleFactor * falloff;
          else if (dock_position === 'top') icon._target[1] += iconSize * raise * scaleFactor * falloff;
          else if (dock_position === 'left') icon._target[0] += iconSize * raise * scaleFactor * falloff;
          else if (dock_position === 'right') icon._target[0] -= iconSize * raise * scaleFactor * falloff;
        }
      });
    }

    let didAnimate = false;
    animateIcons.forEach((icon) => {
      let pos = icon._target;
      let scale = icon._targetScale;
      if (icon._currentScale === undefined) icon._currentScale = icon.get_scale()[0];
      let fromScale = icon._currentScale;

      icon.visible = !isNaN(pos[0]) && pos[0] !== 0; // Guard (0,0) sticking
      if (!icon.visible) return;

      let _scale_coef = nearestIcon ? ANIM_SCALE_COEF : ANIM_SCALE_COEF * ANIM_ON_LEAVE_COEF;
      scale = (fromScale * _scale_coef + scale) / (_scale_coef + 1);
      if (Math.abs(scale - icon._targetScale) < 0.001) scale = icon._targetScale; else didAnimate = true;
      icon._currentScale = scale;

      let jX = 0, jY = 0;
      if (icon._clickJump > 0) {
        let jh = this.extension.jump_height || 0.85;
        let off = Math.sin(icon._clickJump * Math.PI) * iconSize * ANIM_ICON_RAISE * scaleFactor * 1.65 * jh;
        if (dock_position === 'bottom') jY = -off; else if (dock_position === 'top') jY = off; else if (dock_position === 'left') jX = off; else if (dock_position === 'right') jX = -off;
        icon._clickJump -= 0.0275 * (this.extension.jump_speed || 1.0); if (icon._clickJump < 0) icon._clickJump = 0;
        didAnimate = true;
      }
      if (icon._attentionJump > 0) {
        let jh = this.extension.jump_height || 0.85;
        let off = Math.sin(icon._attentionJump * Math.PI) * iconSize * ANIM_ICON_RAISE * scaleFactor * 1.65 * jh;
        if (dock_position === 'bottom') jY = -off; else if (dock_position === 'top') jY = off; else if (dock_position === 'left') jX = off; else if (dock_position === 'right') jX = -off;
        icon._attentionJump -= 0.0275 * (this.extension.jump_speed || 1.0); if (icon._attentionJump < 0) icon._attentionJump = 0;
        didAnimate = true;
      }

      let isJumping = (icon._clickJump > 0 || icon._attentionJump > 0);
      let isMagnifying = (this.extension.enable_magnification && Math.abs(scale - 1.0) > 0.001);
      let isActive = isJumping || isMagnifying;

      // Badged icons are always clones — badge lives on the clone and must
      // never disappear during scrub. Everyone else uses isActive as before.
      const appId = icon._appwell?.app?.get_id() ?? null;
      const hasBadge = appId && ((this._badgeManager?._appMap?.[appId] ?? 0) > 0);
      const forceClone = hasBadge;

      let appliedScale = (this.extension.enable_magnification === false) ? 1.0 : scale;
      icon.set_scale(appliedScale, appliedScale);

      if ((!this.extension._isHidden || jumping) && (isActive || forceClone)) {
        let sz = Math.round(iconSize * appliedScale);
        let pad = Math.round(12 * scaleFactor);
        if (dock_position === 'top' || dock_position === 'bottom') {
          icon._bin.set_width(sz);
          if (icon._appwell?.get_parent()) icon._appwell.get_parent().set_width(sz + pad);
        } else {
          icon._bin.set_height(sz);
          if (icon._appwell?.get_parent()) icon._appwell.get_parent().set_height(sz + pad);
        }
      }

      if (icon._bin.first_child) icon._bin.first_child.opacity = (isActive || forceClone) ? 0 : 255;
      icon.visible = isActive || forceClone;

      let renderX = (this.extension.enable_magnification === false) ? icon._nativeTarget[0] : pos[0];
      let renderY = (this.extension.enable_magnification === false) ? icon._nativeTarget[1] : pos[1];
      icon.set_position(Math.round(renderX + jX), Math.round(renderY + jY));

      if (icon._label) {
        let label = icon._label;
        if (icon !== nearestIcon && !isActive) label.opacity = 0;
        let pP = icon.pivot_point;
        let cx = renderX + jX + iconSize * (pP.x * (1 - appliedScale) + appliedScale / 2);
        let cy = renderY + jY + iconSize * (pP.y * (1 - appliedScale) + appliedScale / 2);
        //

        let margin = (26 + -13 * (appliedScale - 1)) * scaleFactor;
        //Adjust tooltip height apart from app icon vertically. first number is tooltip height for magnification OFF mode,
        //second number is how much height would be added or subtracted to the first number for magnification ON mode. 
        //DEFAULT= 26 + -13

        let tx, ty;
        if (dock_position === 'bottom') { tx = cx - label.width / 2; ty = cy - (iconSize * appliedScale) / 2 - label.height - margin; }
        else if (dock_position === 'top') { tx = cx - label.width / 2; ty = cy + (iconSize * appliedScale) / 2 + margin; }
        else if (dock_position === 'left') { tx = cx + (iconSize * appliedScale) / 2 + margin; ty = cy - label.height / 2; }
        else { tx = cx - (iconSize * appliedScale) / 2 - label.width - margin; ty = cy - label.height / 2; }

        if (label._smoothX === undefined) { label._smoothX = tx; label._smoothY = ty; }
        else { label._smoothX += (tx - label._smoothX) * 0.35; label._smoothY += (ty - label._smoothY) * 0.35; }
        label.x = Math.round(label._smoothX); label.y = Math.round(label._smoothY);
      }
      if (this.show_dots && icon._appwell?.app?.get_n_windows() > 0) {
        let dot = this._dots[dotIndex++];
        if (dot) {
          dot.set_scale(appliedScale, appliedScale); dot.visible = true;
          let cx = renderX + jX + (iconSize * appliedScale) / 2; let cy = renderY + jY + (iconSize * appliedScale) / 2;
          let dx = 0, dy = 0;
          if (dock_position === 'bottom') dy = (iconSize * appliedScale) / 2 + 6 * scaleFactor;
          else if (dock_position === 'top') dy = -(iconSize * appliedScale) / 2 - 6 * scaleFactor;
          dot.set_position(Math.round(cx + dx - 12 * scaleFactor), Math.round(cy + dy - 12 * scaleFactor));
        }
      }
      if (this._badgeManager) this._badgeManager.updateIcon(icon, iconSize);
    });
    if (didAnimate) this._startAnimation();
  }

  _findIcons() { return this.extension._findIcons(); }
  _get_x(obj) { return obj ? obj.get_transformed_position()[0] : 0; }
  _get_y(obj) { return obj ? obj.get_transformed_position()[1] : 0; }
  _get_position(obj) { return [this._get_x(obj), this._get_y(obj)]; }
  _get_distance_sqr(p1, p2) { let a = p1[0] - p2[0], b = p1[1] - p2[1]; return a * a + b * b; }
  _get_distance(p1, p2) { return Math.sqrt(this._get_distance_sqr(p1, p2)); }

  _beginAnimation() {
    if (this._intervalId == null) {
      this.animationInterval = ANIM_INTERVAL + (this.extension.animation_fps || 0) * ANIM_INTERVAL_PAD;
      this._intervalId = setInterval(this._animate.bind(this), this.animationInterval);
    }
  }

  _endAnimation() {
    if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
    if (this._timeoutId) { clearInterval(this._timeoutId); this._timeoutId = null; }
    this._relayout = 0;
    // After loop dies, keep badged icons as clones so badges remain visible.
    // Any icon whose badge has a count > 0 stays with native opacity=0 (hidden)
    // and clone opacity=255 (visible). Non-badged icons snap back to native.
    this._persistBadgedClones();
  }

  _persistBadgedClones() {
    if (!this._iconsContainer || !this._badgeManager) return;
    const animateIcons = this._iconsContainer.get_children()
      .filter(c => c.name !== 'cupertinisator-badge');
    animateIcons.forEach(icon => {
      const app = icon._appwell?.app ?? null;
      const count = this._badgeManager._appMap?.[app?.get_id()] ?? 0;
      const hasBadge = count > 0;
      if (hasBadge) {
        // Keep native icon hidden — clone stays as the visible representation
        if (icon._bin?.first_child) icon._bin.first_child.opacity = 0;
        icon.opacity = 255;
        icon.visible = true;
      } else {
        // No badge — restore native icon, hide clone
        if (icon._bin?.first_child) icon._bin.first_child.opacity = 255;
        icon.visible = false;
      }
    });
  }

  _debounceEndAnimation() {
    if (this._timeoutId) clearInterval(this._timeoutId);
    this._timeoutId = setTimeout(this._endAnimation.bind(this), ANIM_DEBOUNCE_END_DELAY + this.animationInterval);
  }

  _onMotionEvent() { this._onEnterEvent(); }
  _onEnterEvent() { this._inDash = true; this._startAnimation(); }
  _onLeaveEvent() {
    this._inDash = false;
    // When magnification is ON the icon lerp settle naturally keeps the loop
    // alive ~300-500ms after cursor exit, giving D2D a clean quiet window to
    // commit to hiding. Replicate that window explicitly for magnification OFF
    // by delaying debounce slightly so D2D gets the same settling opportunity.
    if (this.extension?.enable_magnification === false) {
      if (this._leaveSettleId) {
        clearTimeout(this._leaveSettleId);
      }
      this._leaveSettleId = setTimeout(() => {
        this._leaveSettleId = null;
        this._debounceEndAnimation();
      }, 400);
    } else {
      this._debounceEndAnimation();
    }
  }
  _onFocusWindow() { this._relayout = 8; if (!this._intervalId) this._startAnimation(); }

  _onFullScreen() {
    if (!this._iconsContainer) return;
    if (!this._isInFullscreen()) { this._iconsContainer.show(); this._dotsContainer.show(); }
    else { this._iconsContainer.hide(); this._dotsContainer.hide(); }
  }

  _isInFullscreen() {
    let m = this.dashContainer.monitor || this.dashContainer._monitor;
    return m ? m.inFullscreen : false;
  }

  _startAnimation() { this._beginAnimation(); this._debounceEndAnimation(); }

  _restoreIcons() {
    this._findIcons().forEach(c => {
      if (c._icon) c._icon.opacity = 255;
      if (c._bin?.first_child) c._bin.first_child.opacity = 255;
      if (this.dashContainer && this.dash) {
        let sz = this.dash.iconSize * (this.extension.scale || 1.0);
        if (this.dashContainer._position % 2 === 0) {
          c._bin.set_width(sz); if (c._appwell?.get_parent()) c._appwell.get_parent().set_width(-1);
        } else {
          c._bin.set_height(sz); if (c._appwell?.get_parent()) c._appwell.get_parent().set_height(-1);
        }
      }
    });
    if (this.dash?._box) { this.dash._box.get_children().forEach(c => { if (c.first_child) c.first_child.opacity = 255; }); }
  }
}