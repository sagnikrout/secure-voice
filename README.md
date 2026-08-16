<div align="center">

# 🛡️ SecureVoice (v3.0)

### *High-Performance, Privacy-First, Ultra-Low-Bandwidth P2P Encrypted Voice Communicator*

[![Build & Deploy](https://img.shields.io/badge/Deploy-Live%20on%20GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://sagnikrout.github.io/secure-voice)
[![Vitest Suite](https://img.shields.io/badge/Tests-68%2F68%20Passed-success?style=for-the-badge&logo=vitest)](https://github.com/sagnikrout/secure-voice)
[![WebRTC E2E Simulation](https://img.shields.io/badge/Simulation-10%2F10%20Verified-blue?style=for-the-badge&logo=webrtc)](https://github.com/sagnikrout/secure-voice)
[![Android APK](https://img.shields.io/badge/Android%20APK-v3.0.0-orange?style=for-the-badge&logo=android)](SecureVoice-v3.0.apk)
[![Bandwidth](https://img.shields.io/badge/Bandwidth-6--16%20kbps%20Adaptive-teal?style=for-the-badge)](https://github.com/sagnikrout/secure-voice)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

**🌐 Web App:** [https://sagnikrout.github.io/secure-voice](https://sagnikrout.github.io/secure-voice) &nbsp;|&nbsp; **📱 Android Release:** [`SecureVoice-v3.0.apk`](SecureVoice-v3.0.apk)

</div>

---

## 📖 Overview

**SecureVoice** is a modern, privacy-first, peer-to-peer voice calling application engineered for maximum reliability over severely constrained, low-bandwidth, and high-latency network conditions (2G/3G cellular networks, satellite links, dial-up, congested public Wi-Fi).

Built on top of direct WebRTC peer connections with **DTLS-SRTP end-to-end encryption**, SecureVoice requires **zero signups, no accounts, no phone numbers, and no central database**. Audio streams travel directly between peer endpoints with acoustic filtering, silence suppression, adaptive bitrate stepping, and sub-100ms latency.

---

## 🚀 Key Features

* 🔐 **True End-to-End Encryption (E2EE)**: All media frames are encrypted peer-to-peer using WebRTC `DTLS-SRTP`. No intermediate server can listen to, relay, or decrypt voice payloads.
* 🛡️ **DTLS-SRTP Verbal Safety Code (MITM Detection)**: Generates a deterministic 5-digit verification code directly from the DTLS session certificates for verbal out-of-band identity confirmation.
* 🎛️ **Unified In-Call Audio Settings Modal**: Dynamically enumerates and switches between all detected hardware audio outputs (Loudspeaker, Earpiece Handset, Headphones, USB DACs, Bluetooth SCO) and all hardware microphones.
* 🧹 **Minimalist, Privacy-Locked Pre-Call Screen**: Zero hardware microphone activation or permission leakage until a call is explicitly initiated or answered.
* 📉 **Aggressive Low-Bandwidth Opus Optimization**:
  - SDP bandwidth cap at 16 kbps (`b=AS:16`).
  - Bitrate target of 12 kbps (`maxaveragebitrate=12000`).
  - Discontinuous Transmission (`usedtx=1` silence compression).
  - Opus In-band Forward Error Correction (`useinbandfec=1` with `packetlossperc=10`).
  - Custom packetization times (`ptime=40` / `maxptime=60`) reducing IP/UDP/RTP header overhead by 50%.
* 🎙️ **Web Audio Denoise Pipeline**: Real-time 80Hz high-pass filter (eliminates background AC & wind rumble) coupled with an adaptive `DynamicsCompressor` noise gate.
* 📊 **Real-Time WebRTC Diagnostics & Telemetry**: In-app live overlay displaying round-trip latency (RTT), packet loss percentage, candidate routing (`Direct P2P UDP` vs `TURN Relay`), codec profile, and live audio levels.
* 🔋 **Battery-Aware Waveform Visualizer**: Smooth 60 FPS spectrum analyzer with automated page visibility throttling (`document.hidden`) to conserve battery when the app is backgrounded.
* 📱 **Native Android Integration**: Built with Capacitor & Foreground Service keeping P2P links active with persistent low-power background execution.
* 📇 **Instant Contact Book & Recents**: 1-tap encrypted call redial stored locally in `localStorage` with automated self-ID filtering.
* 🔔 **Synthetic Multi-Frequency Ringtone**: Browser-native oscillator pairs (440Hz + 480Hz) and device vibration patterns with zero audio file downloads.
* 🌓 **Liquid Glassmorphism Design System**: High-contrast, accessibility-focused UI supporting native Dark and Light modes with automatic OS theme synchronization.

---

## 🏗️ Audio Processing & WebRTC Pipeline

```text
  [ Hardware Microphone ]
            │
            ▼
  [ Web Audio Pipeline ]
    ├─ 80Hz High-Pass Filter (removes sub-bass & air rumble)
    ├─ Dynamics Compressor (noise gating & level normalization)
    └─ MediaStreamDestination
            │
            ▼
  [ Opus SDP Munging Engine ]
    ├─ maxaveragebitrate=12000 (12 kbps target)
    ├─ usedtx=1 (silence suppression / 0 kbps on pauses)
    ├─ useinbandfec=1 (Opus forward error correction)
    ├─ packetlossperc=10 (packet loss tolerance)
    ├─ ptime=40 / maxptime=60 (header reduction)
    └─ b=AS:16 (session bandwidth cap)
            │
            ▼
   [ DTLS-SRTP Encrypted P2P Media Stream ] ──────► [ Remote Peer ]
```

---

## 📐 Technical Specifications

| Parameter | Specification | Technical Details |
| :--- | :--- | :--- |
| **Media Transport** | WebRTC `DTLS-SRTP` | Direct Peer-to-Peer encrypted UDP |
| **Audio Codec** | Opus (Mono Voice) | Sampling: 48kHz, Bitrate: 12 kbps |
| **Bandwidth Cap** | Max 16 kbps | Enforced via SDP `b=AS:16` attribute |
| **Packetization** | `ptime: 40ms` | Reduces RTP header overhead by ~50% |
| **Silence Compression** | DTX Enabled (`usedtx=1`) | Transmits 0 kbps during vocal pauses |
| **Error Correction** | In-Band FEC (`useinbandfec=1`) | Reconstructs dropped packets up to 10% loss |
| **Signaling Mesh** | PeerJS Protocol | Ephemeral signaling handshakes |
| **NAT Traversal** | STUN + TURN | Google STUN + OpenRelay TURN fallback |
| **Acoustic Filter** | Web Audio API | 80Hz BiquadFilter + DynamicsCompressor |
| **Security Verification**| DTLS-SRTP Fingerprint Hash | Deterministic 5-digit verbal SAS code |
| **Platforms** | Web, PWA, Android | Responsive Web + Capacitor Native APK |

---

## 📂 Project Directory Structure

```text
secure-voice/
├── .github/workflows/               # GitHub Actions CI/CD deployment workflow
│   └── deploy.yml                   # Automated test, build, and deploy to gh-pages
├── android/                         # Native Android Studio project (Capacitor)
│   ├── app/                         # Android application module & manifest
│   └── build.gradle                 # Native Gradle build scripts
├── public/
│   ├── favicon.svg                  # SVG brand vector icon
│   └── logo.png                     # High-resolution application logo
├── scripts/                         # Automated test harnesses & build scripts
│   ├── generate-android-icons.js    # Native launcher icon generator
│   ├── simulate-network-impairments.js # Adaptive bitrate & network throttle tests
│   └── webrtc-simulation-runner.js  # Headless 2-peer end-to-end simulation runner
├── src/
│   ├── components/                  # UI Components
│   │   ├── AudioSettingsModal.jsx   # Dynamic hardware audio input/output router
│   │   ├── AudioVisualizer.jsx      # Battery-aware real-time spectrum canvas
│   │   ├── CallAudioDeviceSwitcher.jsx # In-call action dock button controller
│   │   ├── DeviceSelectors.css      # Component stylesheet
│   │   ├── Icon.jsx                 # Vector SVG icon renderer
│   │   ├── InfoModal.jsx            # Technical specs & privacy information
│   │   ├── RecentCalls.jsx          # Local storage contact book & recents
│   │   ├── SecurityVerificationModal.jsx # DTLS-SRTP MITM verification dialog
│   │   └── WebRtcStatsOverlay.jsx   # Live WebRTC diagnostics & telemetry overlay
│   ├── constants/
│   │   └── config.js                # ICE servers, Opus profiles, timings, storage keys
│   ├── hooks/                       # Decoupled React State & Lifecycle Hooks
│   │   ├── useAudioDevices.js       # Dynamic input & output hardware enumeration
│   │   ├── useCallSession.js        # Call lifecycle, adaptive bitrate, mute, timers
│   │   ├── useLogs.js               # Activity history logger with bounded buffer
│   │   ├── usePeer.js               # PeerJS signaling, reconnection, spam throttling
│   │   └── useTheme.js              # Dark/Light theme manager with system sync
│   ├── styles/
│   │   ├── tokens.css               # Design tokens, typography & color scales
│   │   └── DeviceSelectors.css      # Modal & audio settings stylesheet
│   ├── test/                        # Vitest & Testing Library Test Suites
│   │   ├── setup.js                 # JSDOM, MediaDevices, & Web Audio mocks
│   │   ├── App.test.jsx             # Shell & UI integration tests
│   │   ├── audio.test.js            # AudioContext, filters & ringtone unit tests
│   │   ├── audioRouting.test.js     # setSinkId & routing tests
│   │   ├── AudioSettingsModal.test.jsx # Modal interactions & routing tests
│   │   ├── formatters.test.js       # Pure formatting & sanitization tests
│   │   ├── InfoModal.test.jsx       # Modal display & keyboard escape tests
│   │   ├── RecentCalls.test.jsx     # Contact persistence & deletion tests
│   │   ├── useAudioDevices.test.js  # Enumeration & permission tests
│   │   └── webrtc.test.js           # SDP munging, FEC, DTX, & crypto ID tests
│   ├── utils/                       # Core System Utilities
│   │   ├── audio.js                 # Web Audio API pipeline & ringtone synthesis
│   │   ├── audioRouting.js          # Cross-platform audio routing (Web + Android)
│   │   ├── formatters.js            # Pure string, time, and peer ID formatting
│   │   └── webrtc.js                # SDP transformations, RTT scoring, MITM codes
│   ├── App.jsx                      # Main application shell
│   ├── index.css                    # Global responsive stylesheet & animations
│   └── main.jsx                     # Application entry point
├── capacitor.config.json            # Capacitor native configuration
├── index.html                       # HTML5 entry with strict CSP headers
├── package.json                     # Pinned dependencies & scripts
├── vite.config.js                   # Vite bundler & Vitest test runner configuration
└── SecureVoice-v3.0.apk              # Signed production Android release APK (5.77 MB)
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

# Install dependencies
npm install
```

### 2. Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Verification & Automated Testing

SecureVoice includes comprehensive unit, integration, simulation, and network impairment test suites:

### 1. Unit & Integration Tests (Vitest)
```bash
npm test
```
*Runs all 68 tests across 9 test files with full mock coverage.*

### 2. Headless 2-Peer WebRTC E2E Simulation
```bash
npm run test:sim
```
*Spawns two concurrent headless Chromium instances, registers peer IDs, completes an encrypted call handshake, exchanges live audio, verifies getStats() telemetry, and tests clean teardown.*

### 3. Network Impairments & Adaptive Bitrate Test
```bash
npm run test:network
```
*Injects simulated 250ms latency, packet loss, and cellular bandwidth throttling via Chrome DevTools Protocol (CDP) to verify adaptive bitrate scaling and Opus FEC resilience.*

---

## 📦 Production Deployment

### Build Static Bundle
```bash
npm run build
```
Generates production assets in `dist/` with full tree-shaking and gzip optimization.

### Deploy to GitHub Pages
```bash
npm run deploy
```
Publishes the compiled production bundle directly to the `gh-pages` branch.

---

## 📱 Compiling the Android APK

The project includes an integrated native Android workspace configured with Capacitor and Foreground Services:

```bash
# 1. Build web distribution
npm run build

# 2. Sync assets to native Android project
npx cap sync

# 3. Assemble Release APK
cd android
./gradlew assembleRelease
```
The compiled binary will be located at:
`android/app/build/outputs/apk/release/app-release.apk`

*(A pre-compiled production release build **`SecureVoice-v3.0.apk`** is available in the root directory).*

---

## 🔒 Security & Privacy Architecture

* **Zero Data Retention**: Signaling servers only coordinate WebRTC handshakes. No usernames, IP addresses, metadata, or logs are retained.
* **Cryptographic ID Entropy**: Peer IDs are generated using `window.crypto.getRandomValues` with rejection sampling.
* **Microphone Privacy Guard**: Microphone tracks are strictly destroyed when a call ends or is rejected to prevent hardware mic indicator leaks.
* **Strict Content Security Policy (CSP)**: Hardened headers prevent script injection and restrict external network access.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
