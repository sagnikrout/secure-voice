# SecureVoice (v3.7.5)

Peer-to-peer encrypted voice calling app engineered for weak networks (2G, EDGE, high latency, and high packet loss) and privacy-focused communication. Voice media streams connect directly between devices via WebRTC DTLS-SRTP with zero media relays by default.

[Web app](https://sagnikrout.github.io/secure-voice) | [Android Releases](https://github.com/sagnikrout/secure-voice/releases/latest) | [Changelog](CHANGELOG.md) | [Architecture](docs/ARCHITECTURE.md) | [Testing](docs/TESTING.md)

## Overview

SecureVoice connects callers directly using WebRTC DTLS-SRTP encryption. It features the Google Lyra v2 neural speech codec (SoundStream/LyraGAN architecture) for pristine wideband voice at 3.2 kbps (< 1 kB/s total network bandwidth), alongside an adaptive Opus ladder (1.2 to 24.0 kbps) and generative packet loss concealment.

Key design principles:
- **Direct P2P Media**: Voice streams travel directly between peers using DTLS-SRTP; zero central media servers handle audio.
- **Google Lyra v2 Neural Speech Codec**: Sub-1 kB/s wideband voice transmission using WebAssembly SIMD and WebRTC Insertable Streams.
- **Client-Side Encrypted Signaling**: Signaling payloads (SDP and ICE candidates) are encrypted client-side using Web Crypto ECDH (P-256) and AES-256-GCM before passing through any signaling relay.
- **Pluggable & Air-Gapped Transports**: Supports serverless Air-Gapped QR Code / Clipboard discovery as well as ephemeral WebSocket relays.
- **Zero Server Logs**: Call history and diagnostic logs remain exclusively on the user's local device sandbox (localStorage) and are never transmitted to any telemetry endpoint.
- **Connection Verification**: Deterministic 8-digit Short Authentication String (SAS) verbal safety code combined with direct DTLS certificate fingerprint inspection.

## Features

- **Google Lyra v2 Neural Codec**: 3.2 kbps SoundStream AI compression (~0.84 kB/s total data rate) with generative autoregressive packet loss concealment.
- **End-to-End Media Encryption**: Direct peer-to-peer WebRTC DTLS-SRTP voice encryption.
- **Encrypted Signaling**: Ephemeral ECDH (P-256) key exchange prevents signaling intermediaries from reading SDP fingerprints.
- **Air-Gapped QR Signaling**: 100% serverless call establishment via optical QR code or text clipboard exchange.
- **Verbal Safety Code (SAS)**: 8-digit verification code derived symmetrically from DTLS certificate fingerprints to detect MITM attacks.
- **Low-Bandwidth Codec Ladder**: 9 adaptive tiers from 1.2 kbps (`ULTRA_LOW`) up to 24.0 kbps (`HQ_PLUS`).
- Packet aggregation: 40ms lock-step packetization (`ptime=40`), cutting IP/UDP header overhead by 50% (25 pkts/sec).
- Packet loss recovery: In-band FEC (`useinbandfec=1`) combined with RFC 2198 redundancy (`audio/red`) to handle up to 50% packet drops.
- Constant latency engine: Dual-clamped jitter buffer (`jitterBufferTarget` + `playoutDelayHint`) preventing NetEQ time-stretching.
- Packet pacing: Audio streams marked with DSCP Expedited Forwarding (DiffServ 46) and paced with dynamic headroom.
- Fast reconnection: 1.5s grace period on network drop with exponential backoff ICE restarts and automatic TURN relay fallback.
- 6-stage audio cleanup: 80Hz highpass filter, 2.8kHz presence boost, 8.5kHz lowpass filter, noise gate (-48 dBFS), compressor, and makeup gain.
- Diagnostics overlay: In-call metrics for RTT, packet loss percentage, jitter delay, concealment ratio, and active bitrate tier.
- Android support: Standalone APK with background foreground service and wake lock support.
- Audio routing: Switch between loudspeaker, earpiece, wired headsets, and Bluetooth devices during calls.

## Audio and WebRTC pipeline

```text
[ Hardware microphone (48kHz) ]
          │
          ▼
[ Web Audio DSP pipeline ]
  ├─ 80Hz highpass filter (cuts mic and desk rumble)
  ├─ 2.8kHz peaking EQ (+2dB voice presence)
  ├─ 8.5kHz lowpass filter (cuts hiss while retaining consonants)
  ├─ Downward RMS noise gate (-48 dBFS)
  ├─ Dynamics compressor (-20dB threshold, 3:1 ratio)
  └─ Makeup gain (+1.21 dB)
          │
          ▼
[ Opus Wideband VBR encoder ]
  ├─ maxaveragebitrate=14000 (14 kbps Pareto optimal)
  ├─ cbr=0 (variable bitrate, zero metallic artifacts)
  ├─ usedtx=1 (silence suppression)
  ├─ useinbandfec=1 (Opus forward error correction)
  ├─ ptime=40 / maxptime=60 (25 pkts/sec)
  ├─ maxplaybackrate=16000 (16kHz Wideband speech band)
  └─ b=AS:18 (session bandwidth ceiling)
          │
          ▼
[ DTLS-SRTP encrypted stream ] ──► [ Remote peer ]
                                           │
                                           ▼
                                [ Dual-clamped jitter buffer ]
                                (Fixed NetEQ target floor)
```

## Technical specifications

| Parameter | Specification | Details |
| :--- | :--- | :--- |
| Media transport | WebRTC DTLS-SRTP | Direct peer-to-peer encrypted UDP |
| Audio codec | Opus Wideband VBR | 16 kHz wideband, 14.0 kbps Pareto optimal |
| Bandwidth ceiling | 18.0 kbps max | Set through SDP `b=AS:18` |
| Packet aggregation | `ptime: 40ms` | 25 pkts/sec (50% header reduction) |
| Loss recovery | In-band FEC + RFC 2198 RED | Survives up to 50% packet loss |
| Jitter buffer | Dual-clamped target | Fixed NetEQ playout floor |
| Traffic shaping | Packet pacer | DSCP Expedited Forwarding (DiffServ 46) |
| Reconnection | IceRestartManager | 1500ms grace period with 5 backoff retries |
| TURN fallback | TurnRelayManager | Probes relay latency and auto-forces TURN after retries |
| Verification | DTLS fingerprints | 8-digit safety code |
| Language | TypeScript | Strict types for WebRTC, audio nodes, and telemetry |
| Platforms | Web, PWA, Android APK | Android app built with Capacitor |

## Directory structure

```text
secure-voice/
├── android/                         # Android Studio project (Capacitor)
├── docs/
│   ├── ARCHITECTURE.md              # Subsystem design and audio pipeline
│   └── TESTING.md                   # Test matrix and benchmark specs
├── public/                          # Static web assets
├── scripts/                         # Benchmark and network simulation runners
│   ├── benchmark-network-resilience.js
│   ├── simulate-network-impairments.js
│   └── webrtc-simulation-runner.js
├── src/
│   ├── components/                  # React UI components (.tsx)
│   ├── constants/                   # Ladder tiers, timing, and codec configs
│   ├── hooks/                       # Call session, peer, and device hooks
│   ├── types/                       # TypeScript interfaces
│   ├── utils/                       # WebRTC, audio DSP, and network adapters
│   ├── App.tsx
│   └── main.tsx
├── CHANGELOG.md                     # Version history
├── package.json
└── tsconfig.json
```

## Testing

```bash
# Run unit and integration tests (432 tests across 26 suites)
npm test

# Run resilience and low-bandwidth benchmarks
npm run benchmark

# Compile TypeScript and build web bundle
npm run build
```

## Building the Android APK

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

The signed binary is written to `android/app/build/outputs/apk/release/app-release.apk`.

## License

MIT
