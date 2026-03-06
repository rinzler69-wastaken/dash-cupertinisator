import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { BadgeManager } from './badge.js';
import St from 'gi://St';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

import { setTimeout, setInterval, clearInterval, clearTimeout } from './utils.js';

const Point = Graphene.Point;

const ANIM_INTERVAL = 15;
const ANIM_INTERVAL_PAD = 15;
const ANIM_POS_COEF = 2;
const ANIM_PULL_COEF = 1.8;
const ANIM_SCALE_COEF = 3.5;
const ANIM_ON_LEAVE_COEF = 1.0; //Penting 
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
    this._miniatures = [];
    this._miniatureBins = [];
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
    try {
      this._badgeManager.setBadgesEnabled(
        this.extension._settings?.get_boolean('show-badges') ?? true
      );
      if (typeof this._badgeManager.setCountEnabled === 'function') {
        this._badgeManager.setCountEnabled(
          this.extension._settings?.get_boolean('show-count') ?? true
        );
      }
      this._badgeSettingId = this.extension._settings?.connect('changed::show-badges', () => {
        try {
          this._badgeManager?.setBadgesEnabled(
            this.extension._settings.get_boolean('show-badges')
          );
        } catch (e) { }
      });
      this._countSettingId = this.extension._settings?.connect('changed::show-count', () => {
        try {
          if (typeof this._badgeManager?.setCountEnabled === 'function') {
            this._badgeManager.setCountEnabled(
              this.extension._settings.get_boolean('show-count')
            );
          }
        } catch (e) { }
      });
    } catch (e) { }
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;
    this._endAnimation();

    if (this._oneShotId) {
      clearInterval(this._oneShotId);
      this._oneShotId = null;
    }

    if (this._iconsContainer) {
      Main.layoutManager.removeChrome(this._iconsContainer);
      this._iconsContainer.destroy();
      this._iconsContainer = null;
      Main.layoutManager.removeChrome(this._dotsContainer);
      this._dotsContainer.destroy();
      this._dotsContainer = null;
    }

    if (this._badgeManager) {
      this._badgeManager.destroy();
      this._badgeManager = null;
    }
    if (this._badgeSettingId && this.extension._settings) {
      this.extension._settings.disconnect(this._badgeSettingId);
      this._badgeSettingId = null;
    }
    if (this._countSettingId && this.extension._settings) {
      this.extension._settings.disconnect(this._countSettingId);
      this._countSettingId = null;
    }
    this._dots = [];
    this._miniatures.forEach(m => m.destroy());
    this._miniatures = [];
    this._miniatureBins.forEach(bin => bin.destroy());
    this._miniatureBins = [];
    if (this._separator) {
      this._separator.destroy();
      this._separator = null;
    }
    if (this.dashContainer) {
      this._restoreIcons();
    }
  }

  reloadIcons() {
    if (!this._enabled) return;

    // Destroy icon clones (but leave miniatures intact)
    if (this._iconsContainer) {
      let children = this._iconsContainer.get_children();
      children.forEach(c => {
        if (c.name !== 'miniature-preview') {
          if (c._appwell) {
            c._appwell._dashAnimatorHooked = false;
          }
          c.destroy();
        }
      });
    }

    // Clear running dots so they don't leak or hang
    if (this._dotsContainer) {
      this._dotsContainer.destroy_all_children();
      this._dots = [];
    }

    // Force animation loop to rebuild everything instantly
    this._iconsCount = 0;
    this._startAnimation();
  }

  showAll() {
    if (this._iconsContainer) {
      this._iconsContainer.visible = true;
    }
    if (this._dotsContainer) {
      this._dotsContainer.visible = true;
    }
  }

  hideAll() {
    if (this._iconsContainer) {
      this._iconsContainer.visible = false;
    }
    if (this._dotsContainer) {
      this._dotsContainer.visible = false;
    }
  }

  isJumping() {
    if (!this._iconsContainer) return false;
    let animateIcons = this._iconsContainer.get_children().filter(c => c.name !== 'miniature-preview' && c.name !== 'cupertinisator-badge');
    return animateIcons.some(icon => {
      return (icon._clickJump !== undefined && icon._clickJump > 0) ||
        (icon._attentionJump !== undefined && icon._attentionJump > 0);
    });
  }

  isMagnifying() {
    if (!this._iconsContainer) return false;
    let animateIcons = this._iconsContainer.get_children().filter(c => c.name !== 'miniature-preview' && c.name !== 'cupertinisator-badge');
    return animateIcons.some(icon => {
      return (icon._currentScale !== undefined && icon._currentScale > 1.6) ||
        (icon._targetScale !== undefined && icon._targetScale > 1.6);
    });
  }

  preview() {
    this._preview = ANIM_PREVIEW_DURATION;
  }

  _updateSeparator() {
    if (!this.dash || !this.dash._box) return;

    if (this._miniatures.length > 0) {
      if (!this._separator) {
        this._separator = new St.Widget({
          style_class: 'separator',
          important: true
        });
        // Try to insert before miniatures (after icons)
        // Since we add miniatures to the END of dash._box, we find the first miniature bin
        if (this._miniatureBins.length > 0) {
          this.dash._box.insert_child_below(this._separator, this._miniatureBins[0]);
        } else {
          this.dash._box.add_child(this._separator);
        }
      }

      // Update separator size based on orientation
      let iconSize = this.dash.iconSize * (this.extension.scale || 1.0);
      let position = this.dashContainer._position;
      if (position === 0 || position === 2) { // Horizontal
        this._separator.set_size(2, iconSize);
      } else { // Vertical
        this._separator.set_size(iconSize, 2);
      }
    } else if (this._separator) {
      this._separator.destroy();
      this._separator = null;
    }
  }

  addMiniature(window) {
    if (!this.extension || !this.dashContainer) return;

    // Create a Ghost Bin to expand the dock
    let ghostBin = new St.Bin({
      name: 'miniature-ghost-bin',
      width: 0,
      height: 0,
      visible: true
    });

    // Inject into the real dash box
    this.dash._box.add_child(ghostBin);
    this._miniatureBins.push(ghostBin);

    // Create the miniature actor
    let miniature = new St.Widget({
      name: 'miniature-preview',
      reactive: true,
      can_focus: true
    });
    miniature._window = window;
    miniature._ghostBin = ghostBin;
    miniature._fillLevel = 0; // for liquid animation

    // Use application icon since Clutter.Clone causes crashes on minimized Actor
    let tracker = Shell.WindowTracker.get_default();
    let app = tracker.get_window_app(window);
    if (app) {
      let icon = app.create_icon_texture(96);
      miniature.add_child(icon);
    }


    // Add Liquid Shader
    let effect = new Clutter.ShaderEffect();
    effect.set_shader_source(`
      uniform sampler2D tex;
      uniform float fill_level;
      void main() {
        vec4 color = texture2D(tex, cogl_tex_coord_in[0].st);
        float mask = step(1.0 - fill_level, 1.0 - cogl_tex_coord_in[0].t);
        gl_FragColor = color * mask;
      }
    `);
    miniature.add_effect(effect);
    miniature._shader = effect;

    this._miniatures.push(miniature);
    this._iconsContainer.add_child(miniature);

    this._updateSeparator();

    miniature.connect('button-press-event', () => {
      window.activate(global.get_current_time());
      return Clutter.EVENT_STOP;
    });

    this._startAnimation();
  }

  removeMiniature(window) {
    let idx = this._miniatures.findIndex(m => m._window === window);
    if (idx !== -1) {
      let m = this._miniatures[idx];
      if (m._ghostBin) m._ghostBin.destroy();
      m.destroy();
      this._miniatures.splice(idx, 1);

      let bIdx = this._miniatureBins.indexOf(m._ghostBin);
      if (bIdx !== -1) this._miniatureBins.splice(bIdx, 1);
    }
    this._updateSeparator();
    this._startAnimation();
  }

  getMiniatureGeometry(window) {
    let m = this._miniatures.find(m => m._window === window);
    if (m) {
      let [x, y] = m.get_transformed_position();
      let [w, h] = m.get_size();
      return { x, y, width: w, height: h };
    }
    return null;
  }

  _precreate_dots(count) {
    if (!this._dots) {
      this._dots = [];
    }
    if (this.show_dots && this.extension.xDot) {
      for (let i = 0; i < count - this._dots.length; i++) {
        let dot = new this.extension.xDot(DOT_CANVAS_SIZE);
        this._dots.push(dot);
        this._dotsContainer.add_child(dot);
        dot.set_position(0, 0);
      }
    }
    this._dots.forEach((d) => {
      d.visible = false;
    });
  }

  _animate() {
    if (!this._iconsContainer || !this.dashContainer) return;
    this.dash = this.dashContainer.dash;

    if (this._relayout > 0 && this.extension && this.extension._updateLayout) {
      this.extension._updateLayout();
      this._relayout--;
    }

    this._iconsContainer.width = 1;
    this._iconsContainer.height = 1;
    this._dotsContainer.width = 1;
    this._dotsContainer.height = 1;

    let jumping = this.isJumping();
    let magnification = (this.extension._isHidden && !jumping) ? 0 :
      (this.extension.animation_magnify * 0.9 || 0) - ANIM_ICON_SCALE_REDUCE;
    let spread = typeof this.extension.animation_spread === 'number' ? this.extension.animation_spread : 0.5;

    // Simple zeroing logic as requested
    if (this.extension.enable_magnification === false) {
      magnification = -ANIM_ICON_SCALE_REDUCE; // Effectively 0 for the peakScale math if ANIM_ICON_SCALE=1.0 plus this
      // Actually let's just use the override later to be safe
    }

    let animateIcons = this._iconsContainer.get_children();
    if (this._iconsCount != animateIcons.length) {
      this._relayout = 8;
      this._iconsCount = animateIcons.length;
    }

    let dock_position = 'bottom';
    let iy = 1;

    let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;

    let pivot = new Point();
    pivot.x = 0.5;
    pivot.y = 1.0;

    let iconSize = this.dash.iconSize * (this.extension.scale || 1.0);

    switch (this.dashContainer._position) {
      case 0:
        dock_position = 'top';
        iy = -1.0;
        pivot.x = 0.5;
        pivot.y = 0.0;
        break;
      case 1:
        dock_position = 'right';
        iy = 0;
        pivot.x = 1.0;
        pivot.y = 0.5;
        break;
      case 2:
        dock_position = 'bottom';
        break;
      case 3:
        dock_position = 'left';
        iy = 0;
        pivot.x = 0.0;
        pivot.y = 0.5;
        break;
    }

    let visible_dots = 0;
    let icons = this._findIcons();

    icons.forEach((c) => {
      let bin = c._bin;
      if (!bin) return;

      if (c._appwell && c._appwell.app && c._appwell.app.get_n_windows() > 0) {
        visible_dots++;
      }

      for (let i = 0; i < animateIcons.length; i++) {
        if (animateIcons[i]._bin == bin) {
          return;
        }
      }

      let uiIcon = new St.Widget({
        name: 'icon',
        width: iconSize,
        height: iconSize,
      });

      uiIcon.pivot_point = pivot;
      uiIcon._bin = bin;
      uiIcon._appwell = c._appwell;
      uiIcon._label = c._label;

      this._iconsContainer.add_child(uiIcon);

      // spy dragging events
      let draggable = c._draggable;
      if (draggable && !draggable._dragBeginId) {
        draggable._dragBeginId = draggable.connect('drag-begin', () => {
          this._dragging = true;
          this.disable();
        });
        draggable._dragEndId = draggable.connect('drag-end', () => {
          this._dragging = false;
          this._oneShotId = setTimeout(
            this.enable.bind(this),
            ANIM_REENABLE_DELAY
          );
        });
      }
    });

    this._precreate_dots(visible_dots);

    let pointer = global.get_pointer();
    let nearestIdx = -1;
    let nearestIcon = null;
    let nearestDistance = -1;

    // Filter and sort in one go if possible
    animateIcons.forEach((c) => {
      if (this.extension.services) {
        this.extension.services.updateIcon(c.first_child);
      }

      let orphan = true;
      for (let i = 0; i < icons.length; i++) {
        if (icons[i]._bin == c._bin) {
          orphan = false;
          break;
        }
      }

      if (orphan) {
        this._iconsContainer.remove_child(c);
      }
    });

    // Also remove miniatures whose windows are gone
    this._miniatures.forEach(m => {
      if (!m._window || m._window.get_compositor_private() == null) {
        this.removeMiniature(m._window);
      }
    });

    animateIcons = this._iconsContainer.get_children().filter(c => c.name !== 'miniature-preview' && c.name !== 'cupertinisator-badge');
    let animateMiniatures = this._iconsContainer.get_children().filter(c => c.name === 'miniature-preview');

    // Sort order only matters for magnification spread
    let cornerPos = this._get_position(this.dashContainer);
    animateIcons.sort((a, b) => {
      let dstA = this._get_distance_sqr(cornerPos, this._get_position(a._bin));
      let dstB = this._get_distance_sqr(cornerPos, this._get_position(b._bin));
      return dstA - dstB;
    });

    let currentX = 0;
    let currentY = 0;
    let dotIndex = 0;
    let idx = 0;

    animateIcons.forEach((icon) => {
      let bin = icon._bin;
      let pos = this._get_position(bin);

      if (bin.first_child) bin.first_child.opacity = 0;
      icon.set_size(iconSize, iconSize);

      if (!icon.first_child && bin.first_child) {
        let img = new St.Icon({
          name: 'icon',
          icon_name: bin.first_child.icon_name || null,
          gicon: bin.first_child.gicon || null,
        });
        img._source = bin;
        img.set_icon_size(iconSize * ANIM_ICON_QUALITY);
        img.set_scale(1 / ANIM_ICON_QUALITY, 1 / ANIM_ICON_QUALITY);
        icon.add_child(img);
        if (this._badgeManager) this._badgeManager.attachToIcon(icon);

        if (icon._appwell && !icon._appwell._dashAnimatorHooked) {
          icon._appwell._dashAnimatorHooked = true;
          icon._appwell.connect('clicked', () => {
            let app = icon._appwell.app;
            if (app && app.get_n_windows() === 0) {
              icon._clickJump = 1.0;
              this._startAnimation();
              if (this.dashContainer && this.dashContainer._animateIn)
                this.dashContainer._animateIn(0.2, 0);
            }
          });
          // urgent signal — _appwell IS the AppIcon, urgent is directly on it
          icon._appwell.connect('notify::urgent', () => {
            if (icon._appwell.urgent && !(icon._attentionJump > 0)) {
              icon._attentionCooldown = 0;
              icon._attentionJump = 1.0;
              icon._urgentPending = true;
              this._startAnimation();
              if (this.dashContainer && this.dashContainer._animateIn)
                this.dashContainer._animateIn(0.2, 0);
            }
            if (!icon._appwell.urgent)
              icon._urgentPending = false;
          });
        }
      }

      let bposcenter = [
        pos[0] + (iconSize * scaleFactor) / 2,
        pos[1] + (iconSize * scaleFactor) / 2
      ];
      let dst = this._get_distance(pointer, bposcenter);

      icon._distance = dst;
      icon._dx = bposcenter[0] - pointer[0];
      icon._dy = bposcenter[1] - pointer[1];

      icon._edgeNear = pos[0];
      icon._edgeFar = pos[0] + iconSize * scaleFactor;
      icon._edgeNearV = pos[1];
      icon._edgeFarV = pos[1] + iconSize * scaleFactor;

      if (nearestDistance == -1 || nearestDistance > dst) {
        nearestDistance = dst;
        nearestIcon = icon;
        nearestIdx = idx;
      }

      icon._target = pos;
      icon._targetScale = 1;
      idx++;
    });

    if (this._preview && this._preview > 0) {
      nearestIdx = Math.floor(animateIcons.length / 2);
      nearestIcon = animateIcons[nearestIdx];
      nearestDistance = 0;
      this._preview -= this.animationInterval;
    } else {
      this._preview = null;
    }

    if (!this._inDash || this.extension._isHidden) {
      nearestIcon = null;
    }

    if (nearestIcon) {
      let raise = ANIM_ICON_RAISE - (ANIM_ICON_RAISE * (1.0 - (this.extension.animation_rise || 0)) - 0.1);
      let peakScale = ANIM_ICON_SCALE + magnification;

      if (this.extension.enable_magnification === false) {
        peakScale = 1.0;
        raise = 0;
        spread = 0;
      }

      let hitRadius = iconSize * scaleFactor * (ANIM_ICON_HIT_AREA + spread * 2.5);
      let isHorizontal = dock_position === 'bottom' || dock_position === 'top';
      let cursorAxis = isHorizontal ? pointer[0] : pointer[1];

      animateIcons.forEach((icon) => {
        let edgeNear = isHorizontal ? icon._edgeNear : icon._edgeNearV;
        let edgeFar = isHorizontal ? icon._edgeFar : icon._edgeFarV;

        let edgeDist;
        if (cursorAxis < edgeNear) {
          edgeDist = edgeNear - cursorAxis;
        } else if (cursorAxis > edgeFar) {
          edgeDist = cursorAxis - edgeFar;
        } else {
          edgeDist = 0;
        }

        if (edgeDist >= hitRadius) return;

        let normalized = edgeDist / hitRadius;
        let falloff = Math.cos(normalized * Math.PI / 2);
        let targetSz = 1.0 + (peakScale - 1.0) * falloff;

        if (targetSz > icon._targetScale) {
          icon._targetScale = targetSz;

          if (dock_position === 'bottom') {
            icon._target[1] -= iconSize * raise * scaleFactor * falloff;
          } else if (dock_position === 'top') {
            icon._target[1] += iconSize * raise * scaleFactor * falloff;
          } else if (dock_position === 'left') {
            icon._target[0] += iconSize * raise * scaleFactor * falloff;
          } else if (dock_position === 'right') {
            icon._target[0] -= iconSize * raise * scaleFactor * falloff;
          }
        }
      });
    }

    let didAnimate = false;
    dotIndex = 0; // Reset dotIndex for use in the loop

    animateIcons.forEach((icon) => {
      let pos = icon._target;
      let scale = icon._targetScale;

      // Fetch scale from our trusted JS state to guarantee smoothness, only querying Clutter once on initialization
      if (icon._currentScale === undefined) {
        icon._currentScale = icon.get_scale()[0];
      }
      let fromScale = icon._currentScale;

      icon.visible = !isNaN(pos[0]);
      if (!icon.visible) return;

      icon.set_scale(1, 1);

      let _scale_coef = nearestIcon ? ANIM_SCALE_COEF : ANIM_SCALE_COEF * ANIM_ON_LEAVE_COEF;

      scale = (fromScale * _scale_coef + scale) / (_scale_coef + 1);
      if (Math.abs(scale - icon._targetScale) < 0.001) {
        scale = icon._targetScale;
      } else {
        didAnimate = true;
      }
      // Guarantee next frame remembers exactly what this frame mathematically calculated
      icon._currentScale = scale;

      let jX = 0, jY = 0;
      if (icon._clickJump > 0) {
        let jumpHeight = this.extension.jump_height || 0.85;
        let jumpSpeed = this.extension.jump_speed || 1.0;
        let jumpOffset = Math.sin(icon._clickJump * Math.PI) * iconSize * ANIM_ICON_RAISE * scaleFactor * 1.65 * jumpHeight;
        if (dock_position === 'bottom') jY = -jumpOffset;
        else if (dock_position === 'top') jY = jumpOffset;
        else if (dock_position === 'left') jX = jumpOffset;
        else if (dock_position === 'right') jX = -jumpOffset;
        icon._clickJump -= 0.0275 * jumpSpeed;
        if (icon._clickJump < 0) icon._clickJump = 0;
        didAnimate = true;
      }

      let isStarting = icon._appwell && icon._appwell.app && (icon._appwell.app.get_state() === Shell.AppState.STARTING) && icon._appwell.app.get_n_windows() === 0;
      if (isStarting && (!icon._clickJump || icon._clickJump <= 0)) {
        icon._clickJump = 1.0;
        didAnimate = true;
        if (this.dashContainer && this.dashContainer._animateIn)
          this.dashContainer._animateIn(0.2, 0);
      }

      // Attention bounce — own track, never touches _clickJump or isJumping() was previously.
      // Uses appIcon.urgent boolean D2D already maintains — no get_windows() needed.
      if (icon._appwell && icon._appwell.urgent) {
        if (!(icon._attentionJump > 0)) {
          icon._attentionCooldown = (icon._attentionCooldown || 0) - 1;
          if (icon._attentionCooldown <= 0) {
            icon._attentionJump = 1.0;
            icon._attentionCooldown = 60;
            // Force dock visible when attention bounce fires
            if (this.dashContainer && this.dashContainer._animateIn)
              this.dashContainer._animateIn(0.2, 0);
            if (this.dashContainer && this.dashContainer._animateIn)
              this.dashContainer._animateIn(0.2, 0);
          }
        }
      } else {
        icon._attentionCooldown = 0;
      }
      if (icon._attentionJump > 0) {
        let jh = this.extension.jump_height || 0.85;
        let js = this.extension.jump_speed || 1.0;
        let off = Math.sin(icon._attentionJump * Math.PI) * iconSize * ANIM_ICON_RAISE * scaleFactor * 1.65 * jh;
        if (dock_position === 'bottom') jY = -off;
        else if (dock_position === 'top') jY = off;
        else if (dock_position === 'left') jX = off;
        else if (dock_position === 'right') jX = -off;
        icon._attentionJump -= 0.0275 * js;
        if (icon._attentionJump < 0) icon._attentionJump = 0;
        didAnimate = true;
      }

      if (!isNaN(scale)) {
        icon.set_scale(scale, scale);
        if ((!this.extension._isHidden || jumping) && !isNaN(scale)) {
          let stretchedSize = Math.round(iconSize * scale);
          let pad = Math.round(12 * scaleFactor);
          if (dock_position === 'top' || dock_position === 'bottom') {
            icon._bin.set_width(stretchedSize);
            if (icon._appwell && icon._appwell.get_parent()) icon._appwell.get_parent().set_width(stretchedSize + pad);
          } else {
            icon._bin.set_height(stretchedSize);
            if (icon._appwell && icon._appwell.get_parent()) {
              let parent = icon._appwell.get_parent();
              let naturalWidth = parent.get_preferred_width(-1)[1];
              icon._appwell.get_parent().set_height(stretchedSize + pad);
              icon._appwell.get_parent().set_width(naturalWidth);
            }
          }
        }
      }

      if (!isNaN(pos[0]) && !isNaN(pos[1])) {
        let renderX = pos[0];
        let renderY = pos[1];
        icon.set_position(Math.round(renderX + jX), Math.round(renderY + jY));

        if (icon._label) {
          let label = icon._label;
          let pivot = icon.pivot_point;
          let centerX = renderX + jX + iconSize * (pivot.x * (1 - scale) + scale / 2);
          let centerY = renderY + jY + iconSize * (pivot.y * (1 - scale) + scale / 2);
          let visualHalfSize = (iconSize * scale) / 2;
          let margin = (14 + 10 * (scale - 1)) * scaleFactor;

          let targetLX, targetLY;
          switch (dock_position) {
            case 'left':
              targetLX = centerX + visualHalfSize + margin;
              targetLY = centerY - label.height / 2;
              break;
            case 'right':
              targetLX = centerX - visualHalfSize - label.width - margin;
              targetLY = centerY - label.height / 2;
              break;
            case 'bottom':
              targetLX = centerX - label.width / 2;
              targetLY = centerY - visualHalfSize - label.height - margin;
              break;
            case 'top':
              targetLX = centerX - label.width / 2;
              targetLY = centerY + visualHalfSize + margin;
              break;
          }

          // Smooth tooltip position to kill microshiver from frame-to-frame scale jitter
          const lerpT = 0.35;
          if (label._smoothX === undefined) {
            label._smoothX = targetLX;
            label._smoothY = targetLY;
          } else {
            label._smoothX += (targetLX - label._smoothX) * lerpT;
            label._smoothY += (targetLY - label._smoothY) * lerpT;
          }
          label.x = Math.round(label._smoothX);
          label.y = Math.round(label._smoothY);
        }

        if (this.show_dots && icon._appwell && icon._appwell.app && icon._appwell.app.get_n_windows() > 0) {
          let dot = this._dots[dotIndex++];
          if (dot) {
            dot.set_scale(scale, scale);
            dot.visible = true;
            let dX = 0, dY = 0;
            if (dock_position === 'bottom') dY = (iconSize * scale) / 2 + 6 * scaleFactor;
            else if (dock_position === 'top') dY = -(iconSize * scale) / 2 - 6 * scaleFactor;
            else if (dock_position === 'left') dX = -(iconSize * scale) / 2 - 6 * scaleFactor;
            else if (dock_position === 'right') dX = (iconSize * scale) / 2 + 6 * scaleFactor;
            dot.set_position(Math.round(centerX + dX - 12 * scaleFactor), Math.round(centerY + dY - 12 * scaleFactor));
          }
        }

        // Badge update
        if (this._badgeManager) this._badgeManager.updateIcon(icon, iconSize);
      }
    });

    // Handle Miniatures
    animateMiniatures.forEach((m) => {
      if (!m._window) return;
      let bin = m._ghostBin;
      if (!bin) return;

      let pos = this._get_position(bin);
      let renderX = pos[0];
      let renderY = pos[1];

      // Update Fill Animation
      if (m._fillLevel < 1.0) {
        m._fillLevel += 0.02;
        if (m._fillLevel > 1.0) m._fillLevel = 1.0;
        didAnimate = true;
        if (m._shader) {
          m._shader.set_uniform_value('fill_level', m._fillLevel);
        }
      }

      if (m.get_first_child()) {
        // center the fallback icon
        let child = m.get_first_child();
        let scale = iconSize / 96;
        child.set_scale(scale, scale);
      }

      // Positioning and Sizing
      m.set_size(iconSize, iconSize);
      m.set_position(Math.round(renderX), Math.round(renderY));

      // Route GNOME Shell window animations to this exact position safely
      if (m._window && m._window.set_icon_geometry) {
        let rect = new Meta.Rectangle({
          x: Math.round(renderX),
          y: Math.round(renderY),
          width: iconSize,
          height: iconSize
        });
        m._window.set_icon_geometry(rect);
      }

      // Update Ghost Bin for dock expansion
      if (dock_position === 'top' || dock_position === 'bottom') {
        bin.set_width(iconSize);
      } else {
        bin.set_height(iconSize);
      }
    });

    if (!this._isInFullscreen()) {
      this._iconsContainer.show();
      this._dotsContainer.show();
    }

    if (didAnimate) {
      this._debounceEndAnimation();
    }
  }

  _findIcons() {
    return this.extension._findIcons();
  }

  _get_x(obj) {
    if (obj == null) return 0;
    return obj.get_transformed_position()[0];
  }

  _get_y(obj) {
    if (obj == null) return 0;
    return obj.get_transformed_position()[1];
  }

  _get_position(obj) {
    return [this._get_x(obj), this._get_y(obj)];
  }

  _get_distance_sqr(pos1, pos2) {
    let a = pos1[0] - pos2[0];
    let b = pos1[1] - pos2[1];
    return a * a + b * b;
  }

  _get_distance(pos1, pos2) {
    return Math.sqrt(this._get_distance_sqr(pos1, pos2));
  }

  _beginAnimation() {
    if (this._timeoutId) {
      clearInterval(this._timeoutId);
      this._timeoutId = null;
    }
    if (this._intervalId == null) {
      if (this.dashContainer && this.extension) {
        this.animationInterval =
          ANIM_INTERVAL +
          (this.extension.animation_fps || 0) * ANIM_INTERVAL_PAD;
      }

      this._intervalId = setInterval(
        this._animate.bind(this),
        this.animationInterval
      );
    }

    if (this.dash && this.extension && this.extension.debug_visual) {
      this.dash.first_child.add_style_class_name('hi');
    }
  }

  _endAnimation() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    if (this._timeoutId) {
      clearInterval(this._timeoutId);
    }
    this._timeoutId = null;
    if (this.dash) {
      this.dash.first_child.remove_style_class_name('hi');
    }
    this._relayout = 0;
  }

  _debounceEndAnimation() {
    if (this._timeoutId) {
      clearInterval(this._timeoutId);
    }
    this._timeoutId = setTimeout(
      this._endAnimation.bind(this),
      ANIM_DEBOUNCE_END_DELAY + this.animationInterval
    );
  }

  _onMotionEvent() {
    this._onEnterEvent();
  }

  _onEnterEvent() {
    this._inDash = true;
    this._startAnimation();
  }

  _onLeaveEvent() {
    this._inDash = false;
    this._debounceEndAnimation();
  }

  _onFocusWindow() {
    this._relayout = 8;
    if (!this._intervalId) {
      this._startAnimation();
    }
  }

  _onFullScreen() {
    if (!this._iconsContainer) return;
    if (!this._isInFullscreen()) {
      this._iconsContainer.show();
      this._dotsContainer.show();
    } else {
      this._iconsContainer.hide();
      this._dotsContainer.hide();
    }
  }

  _isInFullscreen() {
    let monitor = this.dashContainer.monitor || this.dashContainer._monitor;
    return monitor.inFullscreen;
  }

  _startAnimation() {
    this._beginAnimation();
    this._debounceEndAnimation();
  }

  _restoreIcons() {
    let icons = this._findIcons();
    icons.forEach((c) => {
      let bin = c._bin;
      if (c._icon) c._icon.opacity = 255;
      if (bin && bin.first_child) bin.first_child.opacity = 255;

      // RESTORE size on disable
      if (this.dashContainer && this.dash) {
        let position = this.dashContainer._position;
        let iconSize = this.dash.iconSize * (this.extension.scale || 1.0);
        if (position === 0 || position === 2) {
          bin.set_width(iconSize);
          if (c._appwell && c._appwell.get_parent()) c._appwell.get_parent().set_width(-1);
        } else {
          bin.set_height(iconSize);
          if (c._appwell && c._appwell.get_parent()) c._appwell.get_parent().set_height(-1);
        }
      }
    });

    // Final safety: ensure everything in the real dash is visible
    if (this.dash && this.dash._box) {
      this.dash._box.get_children().forEach(child => {
        if (child.first_child) child.first_child.opacity = 255;
      });
    }
  }
};