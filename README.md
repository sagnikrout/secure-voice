<div align="center">

# 🛡️ SecureVoice (v3.0.1)

### *High-Performance, Privacy-First, Ultra-Low-Bandwidth P2P Encrypted Voice Communicator*

[![Build & Deploy](https://img.shields.io/badge/Deploy-Live%20on%20GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://sagnikrout.github.io/secure-voice)
[![Vitest Suite](https://img.shields.io/badge/Tests-69%2F69%20Passed-success?style=for-the-badge&logo=vitest)](https://github.com/sagnikrout/secure-voice)
[![WebRTC E2E Simulation](https://img.shields.io/badge/Simulation-10%2F10%20Verified-blue?style=for-the-badge&logo=webrtc)](https://github.com/sagnikrout/secure-voice)
[![Android APK](https://img.shields.io/badge/Android%20APK-v3.0.1-orange?style=for-the-badge&logo=android)](SecureVoice-v3.0.apk)
[![Bandwidth](https://img.shields.io/badge/Bandwidth-6--16%20kbps%20Adaptive-teal?style=for-the-badge)](https://github.com/sagnikrout/secure-voice)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

**🌐 Web App:** [https://sagnikrout.github.io/secure-voice](https://sagnikrout.github.io/secure-voice) &nbsp;|&nbsp; **📱 Android Release:** [`SecureVoice-v3.0.apk`](SecureVoice-v3.0.apk)

</div>

---

## 📖 Overview

**SecureVoice** is a modern, privacy-first, peer-to-peer voice calling application engineered for maximum reliability over severely constrained, low-bandwidth, and high-latency network conditions.

Built on top of direct WebRTC peer connections with **DTLS-SRTP end-to-end encryption**, SecureVoice requires **zero signups, no accounts, no phone numbers, and no central database**. Audio streams are encrypted directly at the client endpoints and routed P2P with zero intermediate relay servers.

Perfect for:
- 🌍 Users in regions with limited network infrastructure
- 🔒 Privacy-conscious individuals & organizations
- 📡 Satellite, 2G/3G, and congested public Wi-Fi scenarios
- 🛡️ Teams requiring defense-grade communication security

---

## 🚀 Key Features

* 🔐 **True End-to-End Encryption (E2EE)**: All media frames encrypted peer-to-peer using WebRTC DTLS-SRTP. Zero intermediate server involvement.
* 🛡️ **5-Digit DTLS Safety Code (MITM Detection)**: Deterministic verbal verification code derived from DTLS session certificates prevents man-in-the-middle attacks.
* 🎛️ **Dynamic Audio Routing**: Hot-swap between loudspeaker, earpiece, Bluetooth headsets, USB DACs mid-call with zero dropout.
* 🧹 **Privacy-Locked Pre-Call Interface**: Microphone remains fully disabled until call is explicitly initiated or answered.
* 📉 **Ultra-Low-Bandwidth Opus (6–16 kbps)**:
  - SDP bandwidth cap: `b=AS:16`
  - Bitrate target: `12 kbps` (mono voice)
  - Discontinuous Transmission (DTX): Silence suppression, 0 kbps on pauses
  - Forward Error Correction (FEC): Auto-recovery up to 10% packet loss
  - Header optimization: `ptime=40ms / maxptime=60ms` (-50% overhead)
* 🎙️ **Web Audio Denoise Pipeline**: Real-time 80Hz high-pass filter + dynamics compressor noise gate.
* 📊 **Live WebRTC Diagnostics**: In-call overlay with RTT, packet loss %, codec info, transport candidate type (Direct P2P vs TURN relay).
* 🔋 **Battery-Aware Visualizer**: 60 FPS spectrum analyzer with auto-throttling when app backgrounded.
* 📱 **Native Android Integration**: Capacitor with Foreground Service keeps P2P links active when minimized or screen locked.
* 📇 **Instant Contact Book**: 1-tap encrypted call redial stored locally with auto self-ID filtering.
* 🔔 **Synthetic Ringtone**: Browser-native dual-frequency oscillators (440Hz + 480Hz) + device vibration, zero audio files.
* 🌓 **Liquid Glassmorphism Design**: High-contrast accessibility-focused UI, Dark/Light modes with OS theme sync.
* ⚡ **Adaptive Bitrate**: Real-time network condition monitoring with automatic codec bitrate down-stepping on congestion.
* 🛑 **Intelligent Busy-Line Rejection**: Incoming calls auto-rejected if user already in active call, with missed call tracking.

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
| **Media Transport** | WebRTC DTLS-SRTP | Direct Peer-to-Peer encrypted UDP |
| **Audio Codec** | Opus (Mono Voice) | Sampling: 48kHz, Bitrate: 12 kbps nominal |
| **Bandwidth Cap** | Max 16 kbps | Enforced via SDP `b=AS:16` attribute |
| **Packetization** | `ptime: 40ms` | Reduces RTP header overhead by ~50% |
| **Silence Compression** | DTX Enabled (`usedtx=1`) | Transmits 0 kbps during vocal pauses |
| **Error Correction** | In-Band FEC (`useinbandfec=1`) | Reconstructs dropped packets up to 10% loss |
| **Signaling Mesh** | PeerJS Protocol | Ephemeral handshakes, no media relay |
| **NAT Traversal** | STUN + TURN | Google STUN servers + OpenRelay TURN fallback |
| **Acoustic Filter** | Web Audio API | 80Hz BiquadFilter + DynamicsCompressor |
| **Security Verification** | DTLS-SRTP Fingerprint | 5-digit verbal Safety Code SAS |
| **Platforms** | Web, PWA, Android | Responsive web + Capacitor native APK |

---

## 📂 Project Directory Structure

```text
secure-voice/
├── .github/workflows/               # GitHub Actions CI/CD
│   └── deploy.yml                   # Auto test, build, deploy to gh-pages
├── android/                         # Native Android Studio (Capacitor)
│   ├── app/
│   └── build.gradle
├── public/                          # Static assets
│   ├── favicon.svg
│   └── logo.png
├── scripts/                         # Test harnesses
│   ├── generate-android-icons.js
│   ├── simulate-network-impairments.js
│   └── webrtc-simulation-runner.js
├── src/
│   ├── components/                  # React UI components
│   │   ├── AudioSettingsModal.jsx   # Hardware device selector
│   │   ├── AudioVisualizer.jsx      # Spectrum canvas
│   │   ├── CallAudioDeviceSwitcher.jsx
│   │   ├── SecurityVerificationModal.jsx
│   │   ├── WebRtcStatsOverlay.jsx
│   │   ├── RecentCalls.jsx
│   │   └── InfoModal.jsx
│   ├── hooks/                       # React state logic
│   │   ├── useCallSession.js        # Call lifecycle
│   │   ├── usePeer.js               # PeerJS signaling
│   │   ├── useAudioDevices.js       # Hardware enum
│   │   ├── useTheme.js              # Theme manager
│   │   └── useLogs.js               # Activity logger
│   ├── utils/                       # Core utilities
│   │   ├── webrtc.js                # SDP munging, safety codes
│   │   ├── audio.js                 # Web Audio pipeline
│   │   ├── audioRouting.js          # Cross-platform routing
│   │   └── formatters.js            # String utils
│   ├── constants/
│   │   └── config.js                # ICE servers, Opus config, timings
│   ├── test/                        # Vitest test suites (69 tests)
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── package.json
├── vite.config.js
├── capacitor.config.json
├── index.html
└── SecureVoice-v3.0.apk
```

**How it fits together:**
User opens web app → generates unique Peer ID → shares with contact → enters contact's ID → WebRTC handshake via PeerJS → DTLS encrypts audio end-to-end → Opus codec streams through Web Audio denoise pipeline → audio flows P2P with zero relay servers. On Android, Capacitor Foreground Service keeps connection alive in background.

---

## 🛠️ Quick Start & Setup

### Prerequisites
* **Node.js**: `v18.0.0` or newer
* **npm**: `v9.0.0` or newer

### 1. Installation
```bash
# Clone repository
git clone https://github.com/sagnikrout/secure-voice.git
cd secure-voice

# Install dependencies
npm install
```

### 2. Development Server
```bash
npm run dev
```
Opens **http://localhost:3000** in your browser.

### 3. Production Build
```bash
npm run build
```
Generates optimized bundle in `dist/` with full tree-shaking and gzip.

### 4. Deploy to GitHub Pages
```bash
npm run deploy
```
Publishes to `gh-pages` branch. Live at: `https://YOUR_USERNAME.github.io/secure-voice`

---

## 🧪 Verification & Automated Testing

### Unit & Integration Tests (Vitest)
```bash
npm test
```
Runs **69 tests** across 9 test files covering audio filters, SDP munging, formatters, UI interactions. 100% passing.

### Headless 2-Peer WebRTC E2E Simulation
```bash
npm run test:sim
```
Spawns two isolated Chromium headless instances, registers peer IDs, completes encrypted handshake, exchanges live audio, verifies getStats() telemetry, tests clean teardown. **10/10 passing**.

### Network Impairments & Adaptive Bitrate Test
```bash
npm run test:network
```
Injects simulated 250ms latency, packet loss, cellular throttling via Chrome DevTools Protocol. Verifies Opus FEC resilience and bitrate down-stepping. **3/3 passing**.

---

## 📱 Compiling the Android APK

### Option 1: Build from Source
```bash
# 1. Build web distribution
npm run build

# 2. Sync assets to native project
npx cap sync

# 3. Assemble release APK
cd android
./gradlew assembleRelease

# Output: android/app/build/outputs/apk/release/app-release.apk
```

### Option 2: Use Pre-built APK
A production-signed APK is available in the root: `SecureVoice-v3.0.apk` (5.77 MB)

### Installation on Device
1. Transfer APK to Android device
2. Open file manager, tap APK
3. Tap **Install** (allow unknown sources if prompted)
4. Grant Microphone & Notification permissions

---

## 🔒 Security & Privacy Architecture

* **Zero Data Retention**: Signaling servers only coordinate WebRTC handshakes. No usernames, IPs, metadata, or logs retained.
* **Cryptographic ID Entropy**: Peer IDs generated with `window.crypto.getRandomValues` + rejection sampling.
* **Microphone Privacy Guard**: Microphone tracks destroyed on call end to prevent hardware indicator leaks.
* **Strict Content Security Policy**: Hardened CSP headers prevent script injection and external network access.
* **DTLS-SRTP Encryption**: All audio encrypted directly at endpoints. No intermediate relay can intercept.
* **Ephemeral Keys**: DTLS session keys generated per-call, never reused.
* **Local-Only Storage**: Recent calls and preferences stored in browser localStorage, never transmitted.

---

## 🔧 Configuration & Customization

### ICE Servers (STUN/TURN)
Edit `src/constants/config.js`:
```javascript
export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:your-custom-stun.com:19302' },
    { urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' }
  ]
};
```

### Opus Codec Bitrate
Edit `src/constants/config.js`:
```javascript
export const OPUS_CONFIG = {
  MAX_AVERAGE_BITRATE: '12000',  // Change to 16000, 20000, etc.
  BANDWIDTH_CAP_KBPS: 16,        // Session cap in kbps
  USE_DTX: '1',                  // Silence suppression
  USE_INBAND_FEC: '1'            // Forward error correction
};
```

### Audio Routing & Device Selection
Edit `src/utils/audioRouting.js` for platform-specific audio device control.

### UI Theme
Edit `src/hooks/useTheme.js` to add custom color schemes, or modify `src/index.css` for design tokens.

---

## 📊 Real-Time Diagnostics

During an active call, tap the **📊 Activity** button to open the WebRTC diagnostics overlay showing:
- **RTT (Round-Trip Time)**: Network latency in milliseconds
- **Packet Loss %**: Percentage of lost audio packets
- **Codec**: Current Opus configuration
- **Transport**: Direct P2P UDP or TURN relay
- **Audio Levels**: Input/output signal strength

---

## 🐛 Troubleshooting

### **No audio during call**
- ✅ Grant microphone permissions
- ✅ Check speaker/earpiece output device selection
- ✅ Verify both peers can see each other's Peer IDs
- ✅ Check network connectivity (ICE candidates forming)

### **Frequent disconnections**
- ✅ Verify network stability (RTT < 400ms ideal)
- ✅ Check firewall/NAT traversal (TURN relay should fallback)
- ✅ Reduce other network activity
- ✅ Move closer to Wi-Fi router

### **Poor audio quality**
- ✅ Check network packet loss % (aim < 5%)
- ✅ Verify bitrate adaptation in diagnostics
- ✅ Reduce background applications
- ✅ Check microphone sensitivity in audio settings

### **Peer ID not registering**
- ✅ Ensure HTTPS or localhost (crypto.getRandomValues requires secure context)
- ✅ Check browser console for errors
- ✅ Try refreshing page to regenerate ID
- ✅ Verify PeerJS signaling server is reachable

---

## 🤝 Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas for expansion:
- Video calling support
- Message encryption
- Call recording & playback
- Advanced network statistics
- Additional language support
- UI/UX improvements

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

© 2026 Sagnik Rout. All rights reserved.

---

**Questions or feedback?** Open an issue on GitHub or reach out via the homepage.
