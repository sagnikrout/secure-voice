# SecureVoice (v3.1.0)

Peer-to-peer encrypted voice calling app designed for weak networks (2G, EDGE, high latency, and high packet loss). Runs in modern browsers or as an Android app with no accounts, phone numbers, or central servers.

[Web app](https://sagnikrout.github.io/secure-voice) | [Android APK](SecureVoice-v3.1.0.apk) | [Changelog](CHANGELOG.md) | [Architecture](docs/ARCHITECTURE.md) | [Testing](docs/TESTING.md)

## Overview

SecureVoice connects callers directly using WebRTC DTLS-SRTP encryption. It uses Opus narrowband encoding and aggressive packet aggregation to keep audio legible at bitrates as low as 3.2 kbps and packet loss up to 50%.

Good fit for:
- 2G and EDGE mobile connections
- Satellite and high-latency links (RTT > 600ms)
- Congested or throttled Wi-Fi
- Private peer-to-peer calls without accounts or server logging

## Features

- End-to-end encryption: Media streams use WebRTC DTLS-SRTP directly between peers.
- 5-digit safety code: Symmetrically derived from DTLS fingerprints so callers can verify the connection verbally.
- Low-bandwidth audio: Bitrates from 3.2 to 8.0 kbps CBR with 8 kHz SILK narrowband voice modeling.
- Packet aggregation: 80–100ms packetization (`ptime=80..100`), cutting IP/UDP header overhead from 17.6 kbps to 3.5 kbps.
- Packet loss recovery: In-band FEC (`useinbandfec=1`) combined with RFC 2198 redundancy (`audio/red`) to handle up to 50% packet drops.
- Locked jitter buffer: Dynamic NetEQ target floor (120ms to 400ms) to prevent NetEQ pitch-shifting and stutter on high-jitter links.
- Packet pacing: Audio streams marked with DSCP Expedited Forwarding and paced with 15% headroom to prevent router queue drops.
- Fast reconnection: 1.5s grace period on network drop with exponential backoff ICE restarts and automatic TURN relay fallback.
- 6-stage audio cleanup: 80Hz highpass filter, 2.8kHz presence boost, 4.2kHz lowpass filter, noise gate (-46 dBFS), compressor, and makeup gain.
- Diagnostics overlay: In-call metrics for RTT, packet loss percentage, jitter delay, concealment ratio, and active bitrate tier.
- Android support: Standalone APK with background foreground service and wake lock support.
- Audio routing: Switch between loudspeaker, earpiece, wired headsets, and Bluetooth devices during calls.

## Audio and WebRTC pipeline

```text
[ Hardware microphone ]
          │
          ▼
[ Web Audio DSP pipeline ]
  ├─ 80Hz highpass filter (cuts mic and desk rumble)
  ├─ 2.8kHz peaking EQ (+3dB voice presence)
  ├─ 4.2kHz lowpass filter (cuts hiss)
  ├─ Downward RMS noise gate (-46 dBFS)
  ├─ Dynamics compressor (-18dB threshold, 4:1 ratio)
  └─ Makeup gain (+1.58 dB)
          │
          ▼
[ Opus SILK narrowband encoder ]
  ├─ maxaveragebitrate=6000 (3.2–8.0 kbps adaptive ladder)
  ├─ cbr=1 (constant bitrate)
  ├─ usedtx=1 (silence suppression)
  ├─ useinbandfec=1 (Opus forward error correction)
  ├─ ptime=80 / maxptime=120 (12.5 pkts/sec)
  ├─ maxplaybackrate=8000 (8kHz SILK speech band)
  └─ b=AS:8 (session bandwidth ceiling)
          │
          ▼
[ DTLS-SRTP encrypted stream ] ──► [ Remote peer ]
                                           │
                                           ▼
                                [ NetEQ jitter buffer ]
                                (120ms–400ms target floor)
```

## Technical specifications

| Parameter | Specification | Details |
| :--- | :--- | :--- |
| Media transport | WebRTC DTLS-SRTP | Direct peer-to-peer encrypted UDP |
| Audio codec | Opus SILK | 8 kHz narrowband, 3.2–8.0 kbps CBR |
| Bandwidth ceiling | 8.0 kbps max | Set through SDP `b=AS:8` |
| Packet aggregation | `ptime: 80ms–100ms` | 10 to 12.5 pkts/sec |
| Loss recovery | In-band FEC + RFC 2198 RED | Survives up to 50% packet loss |
| Jitter buffer | RTCRtpReceiver target | 120ms (HQ) to 400ms (Ultra) NetEQ floor |
| Traffic shaping | Packet pacer | DSCP high priority with 85% headroom factor |
| Reconnection | IceRestartManager | 1500ms grace period with 5 backoff retries |
| TURN fallback | TurnRelayManager | Probes relay latency and auto-forces TURN after retries |
| Verification | DTLS fingerprints | 5-digit safety code |
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
# Run unit and integration tests (317 tests across 17 suites)
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
