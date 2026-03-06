# 🍎 Dash Cupertinisator

> **Give your Linux Dash to Dock the premium Cupertino treatment.**

Dash Cupertinisator enhances your GNOME dock with physically coherent magnification, refined launch animations, and macOS-inspired motion design — built for GNOME 45+.

---

## ⚡ Core Features

### 🔍 Proportional Magnification
Experience silky-smooth icon zooming. Our custom math ensures that not only the icon under your cursor grows, but neighbors spread and scale proportionally for a truly organic feel.

### 🔴 Event-Driven Notification Badges
High-fidelity, event-driven badges that hook directly into the GNOME message tray.
- **Dynamic Scaling**: Badges scale proportionally with your icons.
- **Smart Positioning**: Locked to the icon corner with pixel-perfect offsets.
- **Count Support**: Real-time notification counts with adaptive font sizing.

### 📐 Pixel-Perfect Precision
- **Adaptive Tooltips**: App labels use LERP-smoothed tracking to follow magnified icons without jitter.
- **Sync Architecture**: Icons, dots, and badges remain perfectly aligned even during rapid cursor sweeps.

---

## 🎨 Advanced Aesthetics

### 💎 Premium Theme Overrides
- **Robust Theme Overrides**: Native, hand-crafted "Big Sur" and "Mojave" styles. Selectable through the extension settings, overrides Dash to Dock's original dock styling.
- **Floating Pill**: (BIG SUR Dock Style) Modern floating design with refined border radii.
- **Flush Dock**: (MOJAVE Dock Style) A classic, flush design that sits securely against the screen edge.
- **Theme Guard**: Automatically handles CSS alias expansion to ensure consistent styling regardless of Dash to Dock's internal toggles.

> **Notes**: - For the Frosted Glass look on your dock, please install [Blur My Shell](https://github.com/aunetx/blur-my-shell).
> - For a more faithful icon look, please use either of these iconpacks: [OS Catalina Icons](https://github.com/zayronxio/Os-Catalina-icons), for **Mojave** dock style, or [WhiteSur Icon Theme](https://github.com/vinceliuice/WhiteSur-icon-theme), for **Big Sur** dock style.

---

## 🧞 Magic Lamp Integration
We love the [Compiz-alike Magic Lamp Effect](https://github.com/hermes83/compiz-alike-magic-lamp-effect). 
Dash Cupertinisator includes **one-click patch** to ensure minimising windows no longer slither under the dock, and an especially **sweet** addition of Bilinear Texture Filtering to the Magic Lamp effect to mitigate jagginess.

---

## 🚀 Installation

1. **Prerequisites**: Ensure you have [Dash to Dock](https://github.com/micheleg/dash-to-dock) or [Ubuntu Dock](https://github.com/micheleg/dash-to-dock) installed and enabled. 
   **Recommended**: 
   - Install [Magic Lamp Effect](https://github.com/hermes83/compiz-alike-magic-lamp-effect) for the Magic Lamp window animations, and seeing our patcher in action!
   - Install [Blur My Shell](https://github.com/aunetx/blur-my-shell) for the Frosted Glass look on the Dock.

2. **Clone & Install**:
   ```bash
   git clone https://github.com/rinzler69-wastaken/dash-cupertinisator.git
   cd dash-cupertinisator
   make install
   ```
3. **Restart GNOME Shell**: Press `Alt+F2`, type `r`, and hit `Enter` (X11) or Log out and back in (Wayland).
4. **Enable**: Use **Extensions** or **Extension Manager** to enable "Dash Cupertinisator".

---

## 🛠 Customization & Theming

Open the extension settings to access the **Animation** and **Theme** sections. Dash Cupertinisator is built to be granular, allowing you to build your own "ideal" dock experience.

### 🧪 Animation Settings
Fine-tune the physics behind your dock's motion:
- **Magnification Scale**: Adjust how large icons grow on hover (default 0.5 magnification factor).
- **Distribution Spread**: Control the "bell curve" of the magnification; higher values make neighbors expand further.
- **Vertical Rise**: Set how high icons lift off from the background during magnification.
- **Bounce Physics**: Dedicated sliders for **Bounce Height** and **Bounce Speed** for app-icon bounce animation on window launches, and urgent notifications.

### 🎨 Theme Settings
Our custom CSS engine overrides Dash to Dock with premium, hand-crafted styles:
- **Dock Styles**:
  - **Mojave**: A classic, flush design that sits securely against the screen edge.
  - **Big Sur**: A modern, floating pill design with a gap from the edge and higher border radii.
- **Intelligent Color Schemes**:
  - **Follow System Theme**: Automatically swaps between light and dark modes based on your GNOME settings.
  - **Manual Override**: Force a **Light** or **Dark** aesthetic regardless of system state.
- **Theme Guard**: NOTE: Activating our theme locks the theming to "Shrink the Dock" to ensure a seamless, Cupertino-faithful look.

### 🔴 Extra Polish
- **Badge Management**: Toggle event-driven notification badges and unread counts.
- **CAMLE Patcher**: Apply our high-performance runtime patch to the [Magic Lamp Effect](https://github.com/hermes83/compiz-alike-magic-lamp-effect) with a single click.

---

## 🤝 Credits & Acknowledgements
This project is a heavily refined and modernized evolution of **Dash Animator** by [icedman](https://github.com/icedman). 

Special thanks to the GNOME community for the inspiration and the building blocks that make this possible.

---

## 📜 License
GPL-3.0 License. See `LICENSE` for details.
