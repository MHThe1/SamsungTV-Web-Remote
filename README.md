<div align="center">

# Samsung Smart TV Web Remote

**An ultra-lightweight, high-performance web remote for Samsung Smart TVs running Tizen OS.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Raspberry%20Pi-lightgrey.svg)]()

*A clean, fast alternative to the official Samsung SmartThings app. Control your TV from any phone, tablet, or browser on your local Wi-Fi.*

</div>

---

## Why This Project?

| Feature | Samsung SmartThings App | This Web Remote |
| :--- | :--- | :--- |
| **Download Size** | ~1 GB+ | **< 1 MB** (source) / < 20 MB RAM |
| **Startup Time** | 4 - 10 seconds | **Instant (< 100ms)** |
| **Samsung Account Required** | Yes (Cloud Login) | **No (100% Local LAN)** |
| **Telemetry & Tracking** | Yes | **Zero (Private & Offline)** |
| **Install as Mobile App** | App Store / Play Store | **PWA (Add to Home Screen)** |

---

## Features

- **Network Auto-Discovery**: Automatically scans your local Wi-Fi subnet (via SSDP and port sweep) to detect your Samsung TV and MAC address.
- **Mobile-First PWA**: Designed specifically for mobile screens. Tap **"Add to Home Screen"** in iOS Safari or Android Chrome to get a full-screen, native remote experience without browser address bars.
- **Dual Navigation Modes**:
  - **Tactile D-Pad**: Directional pad with central OK/Enter button.
  - **Gesture Touchpad**: Swipe gestures and tap-to-select navigation.
- **Ergonomic Rocker Switches**: Dual-action vertical pill rockers for Volume (+/-) and Channel (+/-) with instant Mute.
- **Haptic & Audio Feedback**: Tactile vibrations and synthesized click sounds (via Web Audio API) with a 1-tap mute toggle.
- **Quick App Launchers**: Direct launch shortcuts for **YouTube**, **Netflix**, **Prime Video**, and **Spotify**.
- **Phone Keyboard & Text Input**: Type search queries and passwords from your phone keyboard instead of letter-by-letter TV navigation.
- **Number Keypad**: Numeric drawer for direct channel entry and PIN codes.
- **Wake-on-LAN**: Sends magic packets to wake the TV from standby over Ethernet or Wi-Fi.
- **Persistent Pairing**: TV auth tokens are cached locally (`config.json`), so you only confirm the prompt on your TV once.

---

## Compatibility

Works with all **Samsung Smart TVs running Tizen OS (2016 and newer)**:
- K-Series (2016)
- M/MU/Q-Series (2017)
- N/NU/Q-Series (2018)
- R/RU/Q-Series (2019)
- T/TU/Q-Series (2020)
- A/AU/QN-Series (2021)
- B/BU/QN-Series (2022)
- C/CU/QN-Series (2023)
- D-Series (2024+)

---

## Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- PC and Samsung TV connected to the **same Wi-Fi or local network**

### 2. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/samsung-tv-web-remote.git
cd samsung-tv-web-remote
npm install
```

### 3. Start the Server

- **Windows**: Double-click `start-remote.bat` or run:
  ```bash
  npm start
  ```
- **macOS / Linux / Raspberry Pi**:
  ```bash
  ./start-remote.sh
  # or: npm start
  ```

The console will display your local network access URLs:
```
======================================================
  Samsung Smart TV Web Remote running!
  Local URL:   http://localhost:3000
  Mobile URL:  http://192.168.0.xxx:3000
======================================================
```

---

## First-Time Pairing

1. Make sure your **TV screen is ON**.
2. Open the remote URL on your phone or PC.
3. A permission prompt will appear on your TV screen:
   > *"Allow WebRemote to connect?"*
4. Click **Allow** using your physical remote.
5. The TV will issue a token that is automatically saved into `config.json`. All future connections authenticate immediately with zero prompts.

---

## Installing on Your Phone (Full-Screen PWA)

For the best experience, save the remote as a standalone app:

- **iPhone (Safari)**:
  1. Open `http://<your-pc-ip>:3000` in Safari.
  2. Tap the **Share** button.
  3. Scroll down and tap **"Add to Home Screen"**.
- **Android (Chrome)**:
  1. Open `http://<your-pc-ip>:3000` in Chrome.
  2. Tap the menu **(three dots)** in the top right.
  3. Tap **"Install app"** or **"Add to Home screen"**.

---

## Desktop Keyboard Shortcuts

If you are controlling the TV from your laptop or PC:

| Key | TV Action |
| :--- | :--- |
| `Up` `Down` `Left` `Right` | Navigate |
| `Enter` / `Space` | Select / OK |
| `Backspace` / `Esc` | Return / Back |
| `Home` | Smart Hub (Home) |
| `+` / `-` | Volume Up / Down |
| `m` / `M` | Mute |

---

## Troubleshooting

### Phone connection times out:
1. **Windows Defender Firewall**: Windows blocks inbound connections on new ports by default.
   - Right-click [`allow-firewall.bat`](allow-firewall.bat) and choose **"Run as administrator"**.
   - Or run this in PowerShell (Admin):
     ```powershell
     netsh advfirewall firewall add rule name="Samsung TV Web Remote" dir=in action=allow protocol=TCP localport=3000
     ```
2. **Explicit `http://` prefix**: Mobile browsers often auto-prefix `https://`. Ensure you type `http://` explicitly:
   ```
   http://192.168.x.x:3000
   ```
3. **Same Network**: Verify your phone is connected to your home Wi-Fi and not on cellular mobile data (4G/5G) or a separated Guest network.

---

## Project Structure

```
samsung-tv-web-remote/
├── server.js              # Express HTTP & WebSocket server
├── samsung-tv.js          # Samsung Tizen WebSocket & Auto-Discovery driver
├── config.example.json    # Example configuration template
├── package.json           # Project manifest & dependencies
├── allow-firewall.bat     # Windows Firewall helper script
├── start-remote.bat       # Windows launcher
├── start-remote.sh        # Linux / macOS / Raspberry Pi launcher
├── CONTRIBUTING.md        # Contribution guidelines
├── LICENSE                # MIT License
└── public/
    ├── index.html         # Remote HTML structure & SVG icons
    ├── style.css          # Dark-theme design system
    ├── app.js             # Client WebSocket engine, haptics & gestures
    ├── manifest.json      # PWA Web App Manifest
    └── icon.svg           # Vector app icon
```

---

## License

This project is licensed under the [MIT License](LICENSE).
