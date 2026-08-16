<div align="center">

# 🛡️ SecureVoice (v2.7)

### *High-Performance, Privacy-First, Low-Bandwidth P2P Encrypted Voice Communicator*

[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen?style=for-the-badge&logo=vite)](https://github.com/sagnikrout/secure-voice)
[![Vitest Suite](https://img.shields.io/badge/Tests-33%2F33%20Passed-success?style=for-the-badge&logo=vitest)](https://github.com/sagnikrout/secure-voice)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![WebRTC](https://img.shields.io/badge/WebRTC-DTLS--SRTP-333333?style=for-the-badge&logo=webrtc)](https://webrtc.org/)
[![Bandwidth](https://img.shields.io/badge/Bandwidth-12--16%20kbps-orange?style=for-the-badge)](https://github.com/sagnikrout/secure-voice)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

</div>

---

## 📖 Overview

**SecureVoice** is an ultra-secure, peer-to-peer voice calling application engineered for resilience in extremely low-bandwidth and high-latency network conditions (2G/3G cellular networks, satellite links, dial-up, congested public Wi-Fi).

Built on top of direct WebRTC peer connections with **DTLS-SRTP end-to-end encryption**, SecureVoice requires **zero signups, no phone numbers, and no central database**. Audio streams travel directly between peers with hardware noise suppression, silence compression, and sub-150ms real-time latency.

---

## 🚀 Key Features

* 🔐 **True End-to-End Encryption (E2EE)**: All audio frames are encrypted at the client level using WebRTC `DTLS-SRTP`. No intermediate server can intercept or decode the audio payload.
* 📉 **Aggressive Low-Bandwidth Opus Tuning**: Custom SDP munging sets `maxaveragebitrate=12000` (12 kbps), activates Discontinuous Transmission (`usedtx=1` silence compression), and caps session bandwidth to 16 kbps (`b=AS:16`).
* 🎙️ **Web Audio Denoise Pipeline**: Real-time 80Hz high-pass filter (eliminates wind & AC rumble) combined with a low-latency `DynamicsCompressor` noise gate.
* 📊 **Battery-Aware Waveform Visualizer**: Live 60 FPS audio frequency visualizer with automated page-visibility listeners (`document.hidden`) to pause canvas rendering loops when the app or tab is backgrounded.
* 📇 **Instant Contact Book & Recents**: Fast 1-tap redial stored safely in device `localStorage` with automated self-ID filtering.
* 🔔 **Synthetic Multi-Frequency Ringtone**: Browser-native oscillator pairs (440Hz + 480Hz) and device vibration patterns without external audio asset downloads.
* 🔊 **Audio Route Switching**: Seamless runtime switching between Device Speaker and Earpiece with defensive cross-browser error handling (`setSinkId`).
* 🌓 **Adaptive Liquid Glassmorphism Design**: High-contrast, accessibility-focused UI supporting native Dark and Light modes with automatic OS theme synchronization.

---

## 🏗️ Architecture & Audio Pipeline

```
  [ Hardware Mic ]
         │
         ▼
[ Web Audio Pipeline ]
  ├─ 80Hz High-Pass Filter (removes sub-bass rumble)
  ├─ Dynamics Compressor (noise gating & voice boost)
  └─ MediaStreamDestination
         │
         ▼
[ Opus SDP Munging Engine ]
  ├─ maxaveragebitrate=12000 (12 kbps)
  ├─ usedtx=1 (silence suppression)
  ├─ stereo=0, sprop-stereo=0 (mono voice optimization)
  └─ b=AS:16 (session bandwidth capped at 16 kbps)
         │
         ▼
 [ DTLS-SRTP Encrypted P2P Media Stream ] ──────► [ Remote Peer ]
```

---

## 📐 Technical Specifications

| Parameter | Specification | Details |
| :--- | :--- | :--- |
| **Media Transport** | WebRTC `DTLS-SRTP` | Direct Peer-to-Peer encrypted UDP |
| **Audio Codec** | Opus (Mono Voice) | Sampling: 48kHz, Bitrate: 12 kbps |
| **Bandwidth Limit** | Max 16 kbps | Enforced by SDP `b=AS:16` attribute |
| **Silence Compression** | DTX Enabled (`usedtx=1`) | Transmits 0 kbps during vocal pauses |
| **Signaling** | PeerJS Mesh | Lightweight ephemeral connection handshakes |
| **NAT Traversal** | STUN + TURN | Google STUN + OpenRelay TURN fallback |
| **Noise Filtering** | Web Audio API | 80 Hz highpass BiquadFilter + DynamicsCompressor |
| **Platform Target** | Web & Android | Responsive PWA + Native Capacitor APK |

---

## 📂 Project Directory Structure

```text
secure-voice/
├── android/                         # Native Android Studio project (Capacitor)
│   ├── app/                         # App module & AndroidManifest.xml
│   ├── gradle/                      # Gradle wrapper configuration
│   └── build.gradle                 # Native build settings
├── public/
│   └── favicon.svg                  # Vector SVG brand icon
├── src/
│   ├── components/                  # Pure, memoized UI components
│   │   ├── AudioVisualizer.jsx      # Canvas audio spectrum visualizer
│   │   ├── InfoModal.jsx            # Technical specs & security modal
│   │   └── RecentCalls.jsx          # Local storage contact book & recents
│   ├── constants/                   # Centralized application constants
│   │   └── config.js                # ICE servers, SDP configs, timings, keys
│   ├── hooks/                       # Custom decoupled React hooks
│   │   ├── useCallSession.js        # Call lifecycle, timers, mute, speaker, audio routing
│   │   ├── useLogs.js               # Activity log management
│   │   ├── usePeer.js               # PeerJS lifecycle, reconnects, rate limits
│   │   └── useTheme.js              # Theme manager with localStorage persistence
│   ├── test/                        # Vitest & Testing Library test suites
│   │   ├── setup.js                 # JSDOM, MediaDevices, & Web Audio mocks
│   │   ├── App.test.jsx             # Integration tests for core application
│   │   ├── audio.test.js            # Unit tests for Web Audio filters & ringtones
│   │   ├── InfoModal.test.jsx       # Modal component tests
│   │   ├── RecentCalls.test.jsx     # Recents list & storage tests
│   │   └── webrtc.test.js           # SDP munging & cryptographic ID tests
│   ├── utils/                       # Low-level system & WebRTC utilities
│   │   ├── audio.js                 # AudioContext singleton, denoise & oscillator
│   │   └── webrtc.js                # Crypto ID generator, SDP modifier, RTT monitor
│   ├── App.jsx                      # Main React application component
│   ├── index.css                    # Liquid glassmorphism CSS design system
│   └── main.jsx                     # Vite application entry point
├── capacitor.config.json            # Capacitor native mobile app configuration
├── index.html                       # HTML5 entry with strict CSP headers
├── package.json                     # Pinned dependencies & scripts
├── vite.config.js                   # Vite bundler & Vitest test runner config
└── SecureVoice-v2.7.apk              # Compiled production Android APK (4.2 MB)
```

---

## 🛠️ Quick Start & Local Setup

### Prerequisites
* **Node.js**: `v18.0.0` or newer
* **npm**: `v9.0.0` or newer

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/sagnikrout/secure-voice.git
cd secure-voice

# Install pinned dependencies
npm install
```

### 2. Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser to launch the live application.

---

## 🧪 Automated Testing Suite

SecureVoice is covered by **33 unit and integration tests** built with **Vitest**, **@testing-library/react**, and **JSDOM**:

```bash
# Run all tests once
npm test

# Run tests in continuous watch mode
npm run test:watch
```

### Test Suite Summary
```text
 ✓ src/test/webrtc.test.js (13 tests)   - SDP munging, DTX, AS:16, crypto ID, RTT quality
 ✓ src/test/audio.test.js (8 tests)     - Denoise filter, singleton context, ringtone synth
 ✓ src/test/RecentCalls.test.jsx (5 tests) - LocalStorage persistence, deletion, self-filter
 ✓ src/test/InfoModal.test.jsx (3 tests)   - Spec modal display, escape-key listener
 ✓ src/test/App.test.jsx (4 tests)         - Full UI rendering, sanitized input, theme toggle

Test Files: 5 passed (5)
     Tests: 33 passed (33)
  Duration: ~2.4s
```

---

## 🏗️ Production Build

To compile the optimized, tree-shaken static production bundle:
```bash
npm run build
```
Compiled output will be generated in `dist/` ready for zero-configuration static hosting (Vercel, Netlify, GitHub Pages, Cloudflare Pages).

---

## 📱 Building the Android APK

The project includes an integrated native Android platform configured with Capacitor.

### Build Steps:
```bash
# 1. Compile web distribution bundle
npm run build

# 2. Sync web assets to native Android project
npx cap sync android

# 3. Compile Debug APK with Gradle
cd android
./gradlew assembleDebug
```
The resulting APK is generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

*(A pre-compiled production build **`SecureVoice-v2.7.apk`** is located in the project root directory).*

---

## 🔒 Security & Privacy Guarantees

* **Zero Data Retention**: The signaling layer only facilitates peer handshakes. No usernames, phone numbers, IP addresses, or call logs are saved on servers.
* **Cryptographic ID Entropy**: Peer IDs are generated using `window.crypto.getRandomValues`.
* **Clean Hardware Teardown**: Microphone audio tracks are immediately destroyed when a call is terminated, rejected, or canceled to prevent hardware mic leaks.
* **Content Security Policy (CSP)**: Hardened headers prevent XSS and restrict remote resource execution.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.
