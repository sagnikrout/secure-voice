<div align="center">

# 🛡️ SecureVoice (v3.1.0)

### *High-Performance, Privacy-First, 2G Constant Latency P2P Encrypted Voice Communicator*

[![Build & Deploy](https://img.shields.io/badge/Deploy-Live%20on%20GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://sagnikrout.github.io/secure-voice)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25%20Type--Safe-blue?style=for-the-badge&logo=typescript)](https://github.com/sagnikrout/secure-voice)
[![Vitest Suite](https://img.shields.io/badge/Tests-317%2F317%20Passed-success?style=for-the-badge&logo=vitest)](https://github.com/sagnikrout/secure-voice)
[![Network Benchmark](https://img.shields.io/badge/Benchmark-29%2F29%20Verified-purple?style=for-the-badge&logo=webrtc)](https://github.com/sagnikrout/secure-voice)
[![Android APK](https://img.shields.io/badge/Android%20APK-v3.1.0-orange?style=for-the-badge&logo=android)](SecureVoice-v3.1.0.apk)
[![Bandwidth](https://img.shields.io/badge/Bandwidth-3.2--8.0%20kbps%20CBR-teal?style=for-the-badge)](https://github.com/sagnikrout/secure-voice)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

**🌐 Web App:** [https://sagnikrout.github.io/secure-voice](https://sagnikrout.github.io/secure-voice) &nbsp;|&nbsp; **📱 Android Release:** [`SecureVoice-v3.1.0.apk`](SecureVoice-v3.1.0.apk) &nbsp;|&nbsp; **📋 [Changelog](CHANGELOG.md)** &nbsp;|&nbsp; **🏗️ [Architecture](docs/ARCHITECTURE.md)** &nbsp;|&nbsp; **🧪 [Testing](docs/TESTING.md)**

</div>

---

## 📖 Overview

**SecureVoice** is a modern, privacy-first, peer-to-peer voice calling application engineered for maximum reliability over severely constrained, low-bandwidth, and high-latency network conditions (2G, EDGE, satellite links, and congested cellular environments).

Built on top of direct WebRTC peer connections with **DTLS-SRTP end-to-end encryption**, SecureVoice requires **zero signups, no accounts, no phone numbers, and no central database**. Audio streams are encrypted directly at the client endpoints and routed P2P with zero intermediate relay servers.

Perfect for:
- 🌍 Users in regions with limited 2G / EDGE mobile infrastructure
- 🔒 Privacy-conscious individuals & organizations
- 📡 Satellite, offshore, high-latency, and congested public Wi-Fi links
- 🛡️ Emergency voice lifelines requiring constant latency & zero bufferbloat

---

## 🚀 Key Features

* 🔐 **True End-to-End Encryption (E2EE)**: All media frames encrypted peer-to-peer using WebRTC DTLS-SRTP. Zero intermediate server access.
* 🛡️ **5-Digit DTLS Safety Code (MITM Detection)**: Deterministic verbal verification code derived symmetrically from DTLS session certificates.
* ⚡ **2G Constant Latency Architecture**:
  - **Bitrate Range:** `3.2 – 8.0 kbps` with Constant Bit Rate (`cbr=1`) to eliminate cell tower bufferbloat.
  - **Packet Aggregation:** `ptime=80–100ms` (10 to 12.5 pkts/sec), slashing IP/UDP header overhead by **80%**.
  - **Loss Concealment:** In-Band FEC (`useinbandfec=1`) + RFC 2198 Redundancy (`audio/red`) surviving **up to 50% packet drops**.
  - **Narrowband SILK Limit:** `maxplaybackrate=8000` (8 kHz) concentrating 100% of bit budget into the human vocal formant band.
* 🎛️ **Locked NetEQ Jitter Buffer Controller**: Dynamic jitter buffer floor (120ms–400ms) eliminating audio pitch-bending and delay swings on 2G.
* 🚦 **DSCP High-Priority Packet Pacer**: Marks audio packets with Expedited Forwarding priority and reserves 85% bitrate headroom to prevent queue drops.
* 🔄 **Self-Healing ICE Reconnection**: 1500ms silent grace period + 5-step exponential backoff + automatic escalation to lowest-latency TURN relay.
* 🎙️ **6-Stage Web Audio Vocal Formant DSP**:
  - 80Hz Butterworth Highpass Filter (sub-bass / handling noise cut)
  - 2.8kHz Peaking EQ (+3dB vocal presence boost)
  - 4.2kHz Lowpass Filter (ambient hiss cut)
  - Active Downward RMS Noise Gate (-46 dBFS threshold)
  - Studio Dynamics Compressor (-18dB threshold, 4:1 ratio)
  - 1.2x Makeup Gain (+1.58 dB)
* 📊 **Live WebRTC Diagnostic Overlay**: Real-time stats inspector displaying RTT, uplink/downlink packet loss %, jitter buffer delay, concealment ratio, and active ladder tier.
* 📱 **Native Android Background Service**: Keeps encrypted calls alive with foreground notification and wake lock when screen is locked.
* 🎚️ **Hardware Audio Routing**: Seamless in-call toggling between loudspeaker, earpiece, wired headsets, and Bluetooth SCO devices.
* 🌓 **Liquid Glassmorphism UI**: Accessible high-contrast interface with automated system dark/light theme sync.

---

## 🏗️ 2G Constant Latency Audio & WebRTC Pipeline

```text
[ Hardware Microphone ]
          │
          ▼
[ 6-Stage Web Audio DSP Graph ]
  ├─ 80Hz Highpass Filter (cuts HVAC & mic rumble)
  ├─ 2.8kHz Formant Peaking EQ (+3dB vocal presence)
  ├─ 4.2kHz Lowpass Filter (cuts room hiss & ultrasonic hash)
  ├─ Active RMS Noise Gate (silences ambient pauses to 0 dBFS)
  ├─ Dynamics Compressor (levels quiet whispers and loud voices)
  └─ Makeup Gain (+1.58 dB)
          │
          ▼
[ Opus SILK Narrowband Encoder ]
  ├─ maxaveragebitrate=6000 (3.2–8.0 kbps adaptive ladder)
  ├─ cbr=1 (Constant Bitrate to eliminate bufferbloat)
  ├─ usedtx=1 (silence suppression / 0 kbps on pauses)
  ├─ useinbandfec=1 (Opus forward error correction)
  ├─ packetlossperc=30 (tuned for up to 50% packet drop recovery)
  ├─ ptime=80 / maxptime=120 (12.5 pkts/sec, -80% header overhead)
  ├─ maxplaybackrate=8000 (8kHz SILK speech band)
  └─ b=AS:8 (session wire bandwidth ceiling)
          │
          ▼
[ DTLS-SRTP P2P Encrypted Stream ] ──────► [ Remote Peer ]
                                                   │
                                                   ▼
                                        [ Locked NetEQ Jitter Buffer ]
                                        (120ms–400ms target floor:
                                         zero pitch-bending or stutter)
```

---

## 📐 Technical Specifications

| Parameter | Specification | Technical Details |
| :--- | :--- | :--- |
| **Media Transport** | WebRTC DTLS-SRTP | Direct Peer-to-Peer encrypted UDP |
| **Audio Codec** | Opus SILK (Narrowband) | Sampling: 8 kHz SILK, Bitrate: 3.2–8.0 kbps CBR |
| **Bandwidth Ceiling** | Max 8.0 kbps | Enforced via SDP `b=AS:8` attribute |
| **Packet Aggregation** | `ptime: 80ms – 100ms` | 10 to 12.5 pkts/sec (-80% header overhead) |
| **Bitrate Mode** | Constant Bitrate (`cbr=1`) | Uniform transmission timing, zero queuing spikes |
| **Silence Compression** | DTX Enabled (`usedtx=1`) | Pauses transmission during conversational silence |
| **Error Recovery** | In-Band FEC + RFC 2198 RED | Reconstructs dropped packets up to 50% loss |
| **Jitter Stabilization** | RTCRtpReceiver Target | 120ms (HQ) to 400ms (ULTRA) locked NetEQ buffer |
| **Traffic Shaping** | Packet Pacer | DSCP `priority: 'high'` with 85% headroom factor |
| **Reconnection Model** | IceRestartManager | 1500ms grace period + 5-step exponential backoff |
| **NAT / Relay Fallback** | Adaptive TurnRelayManager | Probe latency ranking + auto relay escalation |
| **Voice Processing** | Web Audio API | 6-Stage Formant EQ + RMS Noise Gate + Compressor |
| **Security Verification**| DTLS Certificate Fingerprints | Deterministic 5-digit verbal Safety Code |
| **Type Safety** | TypeScript 100% | Full interfaces for SDP, WebRTC, and DSP |
| **Platforms** | Web, PWA, Android APK | Standalone APK signed with release keystore |

---

## 📂 Project Directory Structure

```text
secure-voice/
├── android/                         # Native Android Studio Project (Capacitor)
│   ├── app/
│   │   ├── build.gradle             # Version 310 / 3.1.0
│   │   └── src/main/java/...        # AudioRoutingPlugin & Foreground Service
│   └── gradlew
├── public/                          # Static assets & icons
│   ├── favicon.png
│   ├── logo.png
│   └── sound/
├── scripts/                         # Automated test harnesses & benchmarks
│   ├── benchmark-network-resilience.js  # 29-assertion resilience simulation
│   ├── simulate-network-impairments.js  # E2E Chromium impairment runner
│   └── webrtc-simulation-runner.js      # Headless WebRTC simulation
├── src/
│   ├── components/                  # React UI components (.tsx)
│   │   ├── App.tsx                  # Main application shell
│   │   ├── AudioSettingsModal.tsx   # Hardware audio device selector
│   │   ├── AudioVisualizer.tsx      # Frequency spectrum canvas
│   │   ├── CallAudioDeviceSwitcher.tsx
│   │   ├── InfoModal.tsx            # Technical specifications modal
│   │   ├── RecentCalls.tsx          # Local encrypted call log
│   │   ├── SecurityVerificationModal.tsx
│   │   └── WebRtcStatsOverlay.tsx   # Real-time WebRTC diagnostics
│   ├── constants/
│   │   └── config.ts                # Opus, 6-tier ladder, and timing constants
│   ├── hooks/                       # Custom React hooks (.ts)
│   │   ├── useAudioDevices.ts       # Audio input/output enumeration
│   │   ├── useCallSession.ts        # Call lifecycle, WebRTC, and DSP integration
│   │   ├── useLogs.ts               # Bounded activity logs
│   │   ├── usePeer.ts               # PeerJS handshake manager
│   │   └── useTheme.ts              # Dark/light theme state
│   ├── types/
│   │   └── index.ts                 # Core TypeScript type definitions
│   └── utils/                       # Core telecom & audio utilities (.ts)
│       ├── audio.ts                 # 6-Stage Web Audio DSP & RMS Noise Gate
│       ├── audioRouting.ts          # Hardware earpiece/speakerphone routing
│       ├── formatters.ts            # Sanitizers and display formatters
│       ├── iceRestartManager.ts     # Non-destructive ICE reconnection state machine
│       ├── jitterBufferController.ts# Dynamic NetEQ jitter buffer floor controller
│       ├── networkAdaptation.ts     # Telemetry monitor & 6-tier ladder controller
│       ├── packetPacer.ts           # DSCP priority and bitrate headroom pacer
│       ├── turnManager.ts           # Ephemeral probe ranking & TURN failover
│       └── webrtc.ts                # SDP munger, RED injector, and safety code
├── tsconfig.json                    # TypeScript compiler configuration
├── tsconfig.node.json
├── package.json
└── SHA256SUMS.txt                   # Cryptographic checksums of release assets
```

---

## 🧪 Testing & Quality Assurance

SecureVoice includes comprehensive unit, adversarial, and simulation test suites:

```bash
# Run all 17 test suites (317 tests)
npm test

# Run 29-assertion automated network impairment benchmark
npm run benchmark

# Compile TypeScript and build production web bundle
npm run build
```

---

## 📱 Compiling the Android APK

```bash
# Build web bundle and sync native Android project
npm run build
npx cap sync android

# Compile and sign production release APK
cd android
./gradlew assembleRelease
```

The output signed APK will be generated at:
```text
android/app/build/outputs/apk/release/app-release.apk
```

---

## 📄 License

MIT License. Designed and engineered for resilient, private communications.
