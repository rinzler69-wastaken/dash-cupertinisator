# 🍎 Dash Cupertinisator

> **Give your GNOME dock the Cupertino treatment.**

Dash Cupertinisator sits on top of [Dash to Dock](https://github.com/micheleg/dash-to-dock) and brings macOS-inspired motion, refined launch animations, hand-crafted dock themes, and a suite of quality-of-life polish to your GNOME desktop.

---

## ✨ Features

### Proportional Magnification
Icons zoom smoothly under your cursor, with neighbors spreading and scaling proportionally — the same organic, physics-aware feel as the macOS dock.

### Launch Animations
Bounce animations fire on app launch and urgent notifications, with a dedicated jump height and speed you can dial in to taste.

### Event-Driven Notification Badges
Badges hook directly into the GNOME message tray rather than polling. They scale with your icons, stay pixel-locked to the icon corner, and display live unread counts.

### Adaptive Tooltips
App labels use LERP-smoothed tracking to follow magnified icons without jitter or lag.

### Magic Lamp Integration
Dash Cupertinisator includes a one-click patcher for the [Compiz-alike Magic Lamp Effect](https://github.com/hermes83/compiz-alike-magic-lamp-effect). The patch prevents minimizing windows from slithering below the gap between the dock and the screen edge, and adds bilinear texture filtering to smooth out minimize effect's jagginess.

---

## 🎨 Themes

Two hand-crafted dock styles, each available in light and dark:

**Big Sur** — A modern floating pill with a gap from the screen edge and generous border radii. Pairs best with the [WhiteSur Icon Theme](https://github.com/vinceliuice/WhiteSur-icon-theme).

**Mojave** — A classic flush dock anchored to the screen edge with squared-off base corners. Pairs best with [OS Catalina Icons](https://github.com/zayronxio/Os-Catalina-icons).

Both themes support bottom, left, and right dock positions.

> For the frosted glass dock background, install [Blur My Shell](https://github.com/aunetx/blur-my-shell).

Theme activation overrides a set of Dash to Dock settings to ensure a coherent Cupertino-faithful look — Built-in D2D theming and non ".shrink" CSS properties are automatically suppressed while the theme is active.

---

## 🚀 Installation

**Prerequisites**
- [Dash to Dock](https://github.com/micheleg/dash-to-dock) installed and enabled
- GNOME 45 or later

**Recommended**
- [Blur My Shell](https://github.com/aunetx/blur-my-shell) for frosted glass dock background
- [Magic Lamp Effect](https://github.com/hermes83/compiz-alike-magic-lamp-effect) to use the CAMLE patcher

**Steps**
```bash
git clone https://github.com/rinzler69-wastaken/dash-cupertinisator.git
cd dash-cupertinisator
make install
```

Then restart GNOME Shell:
- **X11**: Press `Alt+F2`, type `r`, hit `Enter`
- **Wayland**: Log out and back in

Finally, enable "Dash Cupertinisator" via **Extensions** or **Extension Manager**.

---

## ⚙️ Settings

### Animation
- **Magnification Scale** — How large icons grow on hover
- **Distribution Spread** — How far the magnification bell curve reaches to neighboring icons
- **Vertical Rise** — How high icons lift from the background during magnification
- **Bounce Height / Speed** — Physics of the launch and urgent apps bounce. It is recommended to turn off "Wiggle Urgent Apps" on Dash To Dock settings for app icon bounce to work properly.

### Theme
- **Dock Style** — Big Sur or Mojave
- **Color Scheme** — Follow System (auto light/dark), or manually force Light or Dark
- **Override Theming** — Master toggle; activating this locks conflicting D2D settings automatically, and disables non ".shrink" CSS properties.

### Extras
- **Notification Badges** — Toggle event-driven badges and unread counts
- **CAMLE Patcher** — One-click patch/restore for the Magic Lamp Effect. Automatically backs up original CAMLE files before patching.

---

## 🐛 Known Bugs

This extension operates on top of Dash to Dock and GNOME Shell internals, both of which impose constraints we can't fully work around. The following issues are known and documented for contributors.

- **Icons render behind dock background after Intelligent Autohide toggle**
Toggling D2D's Intelligent Autohide on or off sometimes causes app icons to render below the dock pill background. Workaround: disable and re-enable Dash Cupertinisator.

- **Dock placement change requires manual re-trigger**
Changing dock position (bottom/left/right) in D2D settings kills Cupertinisator's animation hooks. The theme survives but animations go dead. Workaround: toggle the extension off and on after changing position.

- **(FUTURE FEATURE PLAN: Running indicator position follows dock position) Running indicator dots ignore dock position**
The running dot under app icons always appears at the bottom of the icon regardless of dock position. On a left or right dock, the dot should appear on the side facing the screen center. This requires monkeypatching D2D's indicator update pipeline and is deferred for a future contributor.

- **No dock scaling when icon count overflows**
macOS shrinks the dock proportionally when too many apps are pinned. GNOME Shell's Clutter paint pipeline makes actor-level scaling non-trivial alongside D2D's scroll container. Currently, D2D's default behavior (scroll or fixed size) applies. Currently if "Fixed Icon Size (Scrollable Dock)" is enabled, the overflowing icons stay visible instead of otherwise masked in vanilla D2D. Deferred for a future contributor. Workaround: It is recommended to disable "Fixed Icon Size (Scrollable Dock)" option in Dash to Dock settings.

<!-- **Frosted glass blur does not clip to dock border radius**
When using Blur My Shell, the blur film underneath the dock pill does not respect the dock's border radius — square corners bleed out from behind the rounded pill. This requires deep integration with BMS's compositor pipeline and is deferred for a future contributor. -->

- **Dock sometimes visible during fullscreen with missing icons**
In certain fullscreen scenarios (particularly when switching workspaces mid-game, dock hasn't hidden yet when entering fullscreen, or opening Activities Overview from a fullscreen app/workspace), the dock pill may appear without icons due to compositor z-order conflicts between the fullscreen surface and the dock actor tree. Currently, dock is hidden altogether during fullscreen.

---

## 🤝 Credits

Dash Cupertinisator is a heavily modernized fork of **Dash Animator** by [icedman](https://github.com/icedman), ported to GNOME 45+ and extended with theming, badge support, CAMLE integration, and multi-position dock support.

Thanks to the GNOME and Dash to Dock communities for the foundation this is all built on.

---

## 📜 License

GPL-2.0-or-later. See `LICENSE` for details.