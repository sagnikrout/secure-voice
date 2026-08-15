# 🛡️ SecureVoice (v2.6)

> **Zero-setup, end-to-end encrypted peer-to-peer voice calling optimized for low-bandwidth connections.**

[![Build & Tests](https://img.shields.io/badge/Tests-33%2F33%20Passed-success?style=flat-square)](https://github.com/sagnikrout/secure-voice)
[![React](https://img.shields.io/badge/React-18.2-blue?style=flat-square&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple?style=flat-square&logo=vite)](https://vitejs.dev/)
[![WebRTC](https://img.shields.io/badge/WebRTC-DTLS--SRTP-green?style=flat-square)](https://webrtc.org/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

---

## 🌟 Overview

**SecureVoice** is a lightweight, privacy-first peer-to-peer audio calling web application. It requires **zero account registration, phone numbers, or central user databases**. Users connect directly using cryptographically generated 6-character Peer IDs with audio encrypted end-to-end via **DTLS-SRTP**.

Specially tuned for constrained networks (2G, 3G, satellite links, congested public Wi-Fi), SecureVoice caps bandwidth at **16 kbps** using optimized Opus codec parameters and Web Audio API real-time noise suppression.

---

## 🚀 Key Features

* **🔒 End-to-End Encryption (E2EE)**: Audio streams peer-to-peer over WebRTC using DTLS-SRTP. No voice data passes through or gets recorded on any intermediate server.
* **📉 Low-Bandwidth Opus Tuning**: Custom SDP transformation limits bitrate to **12 kbps** (`maxaveragebitrate=12000`), enables Discontinuous Transmission / silence suppression (`usedtx=1`), and caps bandwidth to **16 kbps** (`b=AS:16`).
* **🎙️ Web Audio Denoise Pipeline**: Real-time 80Hz high-pass filter (eliminates background AC rumble and wind) coupled with a low-latency `DynamicsCompressor` noise gate.
* **📊 Live Audio Spectrum Visualizer**: Animated canvas showing real-time voice energy, with automatic frame throttling when the browser tab is hidden to save battery.
* **📇 Quick Contacts & Recent History**: `localStorage`-backed call history with 1-tap re-dial and contact removal.
* **🔔 Dual-Tone Synthetic Ringtone**: Oscillator-synthesized ringing frequencies (440Hz + 480Hz) with vibration sequences and mobile AudioContext unlock handlers.
* **🔊 Cross-Platform Audio Output**: Dynamic switching between device Speaker and Earpiece with cross-browser capability fallbacks.
* **🌓 Adaptive Dark / Light Themes**: Native CSS token design system with automatic system preference detection and smooth transitions.

---

## 📐 Technical Specifications

| Feature | Specification | Description |
| :--- | :--- | :--- |
| **Encryption** | `DTLS-SRTP` | Standard WebRTC end-to-end encryption |
| **Audio Codec** | `Opus` | Mono voice profile @ 12 kbps |
| **Bandwidth Cap** | `16 kbps max` | Enforced via SDP `b=AS:16` attribute |
| **Silence Suppression** | `DTX Enabled` | Zero bandwidth transmission during silence (`usedtx=1`) |
| **Noise Cancellation** | `Web Audio API` | 80 Hz High-pass filter + Dynamics Compressor Gate |
| **Connection Topology** | `Direct P2P Mesh` | Peer-to-peer media transport |
| **NAT Traversal** | `STUN / TURN` | Google STUN + OpenRelay TURN fallback |
| **Signaling** | `PeerJS Cloud` | Lightweight handshake signaling |

---

## 📂 Project Architecture

```text
secure-voice/
├── public/
│   └── favicon.svg               # Lightweight vector brand icon
├── src/
│   ├── components/
│   │   ├── AudioVisualizer.jsx   # Real-time audio waveform canvas
│   │   ├── InfoModal.jsx         # Technical specifications dialog
│   │   └── RecentCalls.jsx       # LocalStorage recent contacts manager
│   ├── hooks/
│   │   ├── useCallSession.js     # Media stream, call lifecycle, timer, audio device routing
│   │   ├── useLogs.js            # In-app activity logger
│   │   ├── usePeer.js            # PeerJS signaling, collision backoff, rate limiting
│   │   └── useTheme.js           # Dark/Light theme state manager
│   ├── test/
│   │   ├── setup.js              # JSDOM & Web Audio API test mocks
│   │   ├── audio.test.js         # Audio utility unit tests
│   │   ├── webrtc.test.js        # WebRTC & SDP transform unit tests
│   │   ├── App.test.jsx          # Full App integration tests
│   │   ├── InfoModal.test.jsx    # Modal component unit tests
│   │   └── RecentCalls.test.jsx  # Recent calls component unit tests
│   ├── utils/
│   │   ├── audio.js              # Web Audio context unlock, denoise pipeline, ringtone
│   │   └── webrtc.js             # Cryptographic ID generator, SDP modifier, ICE configuration
│   ├── App.jsx                   # Main application container
│   ├── index.css                 # CSS custom property design system
│   └── main.jsx                  # Application entry point
├── index.html                    # HTML shell & Content Security Policy
├── package.json                  # Dependencies & scripts
└── vite.config.js                # Vite build and Vitest configuration
```

---

## 🛠️ Getting Started

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/sagnikrout/secure-voice.git
   cd secure-voice
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development Server

Start the local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing

The project includes 33 unit and integration tests powered by **Vitest** and **@testing-library/react**:

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 🏗️ Production Build

To build the optimized static production bundle:
```bash
npm run build
```

The production assets will be generated in the `dist/` directory:
```text
dist/
├── index.html
└── assets/
    ├── index-[hash].css
    └── index-[hash].js
```

---

## 📱 Packaging for Android (Capacitor)

SecureVoice can be packaged into an Android APK using [Capacitor](https://capacitorjs.com/):

```bash
# Install Capacitor CLI & Core
npm install @capacitor/core @capacitor/cli @capacitor/android

# Initialize Capacitor
npx cap init SecureVoice com.securevoice.app --web-dir=dist

# Build project and sync to Android
npm run build
npx cap add android
npx cap sync android

# Open project in Android Studio
npx cap open android
```

---

## 🔒 Security & Privacy

* **Zero Metadata Logging**: No phone numbers, email addresses, usernames, or call histories are transmitted to any central database.
* **Cryptographic Entropy**: Peer IDs are generated using `crypto.getRandomValues`.
* **Content Security Policy (CSP)**: Strict CSP defined in `index.html` restricts media and script execution solely to authorized sources.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
