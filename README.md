# SecureVoice (v3.8.2)

SecureVoice is an open-source, peer-to-peer encrypted voice calling application engineered for resilience on weak networks (2G, EDGE, high latency, and severe packet loss) and zero-trust private communication. Voice streams connect directly between devices via WebRTC DTLS-SRTP encryption with zero intermediate media relays by default.

[Web Application](https://sagnikrout.github.io/secure-voice) • [Latest Android Release](https://github.com/sagnikrout/secure-voice/releases/latest) • [Changelog](CHANGELOG.md) • [Architecture Guide](docs/ARCHITECTURE.md) • [Codebase Index](docs/INDEX.md) • [Testing](docs/TESTING.md)

---

## Architectural Principles

1. **Direct Peer-to-Peer Media**: Voice streams travel directly between callers using WebRTC DTLS-SRTP; zero central servers process or inspect audio.
2. **Official RNNoise v0.2 WebAssembly Engine**: Sub-millisecond neural noise suppression (125 KB WASM binary, 10ms algorithmic lookahead, ~1.5% single-core CPU load) executing on a dedicated AudioWorklet thread with a zero-allocation static heap.
3. **Adaptive Opus Survival Ladder**: 6-tier network adaptation engine dynamically scaling Opus Fullband / Wideband VBR from 40 kbps down to a 2.4 kbps survival floor on congested 2G and satellite connections.
4. **Client-Side Encrypted Signaling**: Signaling payloads (SDP offers, answers, and ICE candidates) are encrypted end-to-end on the client using Web Crypto ECDH (P-256) and AES-256-GCM before reaching any transport relay.
5. **Anti-Downgrade Protocol Enforcement**: The signaling subsystem immediately drops unencrypted call messages, preventing man-in-the-middle protocol downgrade attacks.
6. **Air-Gapped & Pluggable Transports**: Supports 100% serverless call establishment via optical QR codes and clipboard exchanges alongside ephemeral WebSocket broker relays.
7. **Zero Remote Telemetry**: Call logs and diagnostic records reside exclusively in the local browser sandbox (`localStorage`) and are never transmitted to external telemetry endpoints.
8. **Short Authentication String (SAS)**: Deterministic 8-digit verification code derived symmetrically from DTLS certificate fingerprints to detect active MITM attacks.

---

## Core Features

- **End-to-End Media Encryption**: Direct peer-to-peer DTLS-SRTP voice encryption.
- **Ephemeral Forward Secrecy**: Generates fresh ECDH keypairs per session; symmetric keys are flushed immediately upon call hangup or abnormal disconnection.
- **Hardware-Accelerated DSP**: 80Hz highpass filter, 2.8kHz vocal presence peaking EQ, 8.5kHz hiss cut, downward RMS noise gate (-48 dBFS), and dynamics compression.
- **Packet Loss Resilience**: In-band Forward Error Correction (`useinbandfec=1`) combined with RFC 2198 Redundancy (`audio/red`) to withstand up to 50% packet drops without audio clipping.
- **NetEQ Jitter Buffer Clamping**: Fixed playout delay hints prevent audio pitch-shifting and time-stretching on jittery links.
- **Non-Destructive Reconnection**: 1500ms grace period on network disruption with exponential backoff ICE restarts and automatic TURN relay fallback.
- **Audio Output Routing**: Switch seamlessly between loudspeaker, earpiece, wired headsets, and Bluetooth devices.
- **Native Android APK**: Lean ~2.3 MB signed APK built with Capacitor 8.5, Foreground Service persistence, and disabled WebView debugging.

---

## Audio DSP & Transmission Pipeline

Microphone audio passes through the following sequential processing stages:

| Stage | Component | Configuration / Parameters | Function |
| :--- | :--- | :--- | :--- |
| **1. Capture** | Web Audio Input | 48 kHz / Mono, 128-sample buffer | Captures hardware microphone stream. |
| **2. Low-Cut Filter** | Biquad Highpass | 80 Hz | Eliminates desk rumble and mechanical handling noise. |
| **3. Presence EQ** | Biquad Peaking | 2.8 kHz, Q = 1.0, Gain = +2.0 dB | Accentuates human vocal formant clarity. |
| **4. Hiss Cut** | Biquad Lowpass | 8.5 kHz | Strips high-frequency electrical hiss. |
| **5. Neural Suppression**| AudioWorklet WASM | RNNoise v0.2, 480 samples (10ms) | Suppresses non-stationary environmental noise. |
| **6. Gating & Dynamic** | AudioWorklet Gain | Threshold: -48 dBFS, 10ms attack | Silences ambient room acoustic bleed. |
| **7. Compression** | Dynamics Compressor | Threshold: -20 dB, Ratio: 3:1 | Normalizes volume between soft and loud speech. |
| **8. Encoding** | Opus VBR Encoder | 6.0 to 40.0 kbps, 20ms–100ms `ptime` | Fullband/wideband encoding with in-band FEC and DTX. |
| **9. Encrypted Transport**| WebRTC DTLS-SRTP | Direct peer-to-peer UDP | Delivers encrypted RTP voice packets to peer. |

---

## Technical Specifications

| Parameter | Specification | Details |
| :--- | :--- | :--- |
| **Media Transport** | WebRTC DTLS-SRTP | Direct peer-to-peer encrypted UDP |
| **Audio Codec** | Opus Fullband / Wideband | 48 kHz / 16 kHz VBR, adaptive 2.4 to 40 kbps |
| **Noise Suppression**| RNNoise v0.2 WASM | 125 KB binary, 10ms lookahead, AudioWorklet thread |
| **Loss Recovery** | In-band FEC + RFC 2198 RED | Survives up to 50% packet loss |
| **Signaling Security**| Client-Side ECDH + AES-256-GCM | Ephemeral keys flushed on session teardown |
| **Jitter Stabilization**| Dual-Clamped Targets | Locks NetEQ playout buffer to fixed floors |
| **Traffic Shaping** | Packet Pacer | DSCP Expedited Forwarding (DiffServ 46) |
| **Reconnection** | IceRestartManager | 1500ms grace period with 5 exponential backoff retries |
| **Identity Verification**| DTLS Certificate Fingerprint | 8-digit Short Authentication String (SAS) |
| **App Bundle Size** | ~828 KB (Web) / ~2.3 MB (APK) | Minified, tree-shaken, and R8 ProGuard optimized |
| **Supported Platforms**| Android (API 28+), Web, PWA | Responsive layout matching desktop and mobile viewports |

---

## Repository Structure

Refer to the complete [Codebase Index & Architecture Sitemap](docs/INDEX.md) for full directory listings:

```text
secure-voice/
├── android/                         # Android Studio native project (Capacitor 8.5)
├── docs/                            # Architectural guides, baselines, and file index
│   ├── ARCHITECTURE.md              # System design and audio render graph
│   ├── CODEC_ENGINE.md              # Adaptive Opus ladder specifications
│   ├── INDEX.md                     # Complete repository file index and sitemap
│   ├── PERFORMANCE_BASELINE.md      # ITU-T G.114 latency accounting and benchmarks
│   └── TESTING.md                   # Automated test matrix specifications
├── public/                          # Production static assets (logo.png, favicon.png)
├── scripts/                         # Build automation, SRI generation, and benchmarks
│   ├── build-release-apk.sh         # One-command release APK builder
│   ├── generate-sri.ts              # Subresource Integrity injector
│   └── validate-dependencies.ts     # CI dependency parity validator
├── src/                             # Application source code
│   ├── components/                  # React UI components (AudioSettings, QRCode, etc.)
│   ├── constants/                   # Ladder tiers, acoustic presets, and ICE servers
│   ├── core/                        # TelecomEngine and AudioEngine coordinators
│   ├── hooks/                       # CallSession, Peer, and device lifecycle hooks
│   ├── test/                        # Vitest suite (30 test files, 443 tests)
│   ├── types/                       # TypeScript schemas and state interfaces
│   └── utils/                       # WebRTC, Audio DSP, RNNoise WASM, and signaling
├── CHANGELOG.md                     # Documented release history
├── package.json                     # Dependency manifests and npm scripts
├── tsconfig.json                    # Strict TypeScript compiler options
└── vite.config.ts                   # Production build and testing configuration
```

---

## Development & Testing

```bash
# Verify 100% dependency parity
npm run check:deps

# Run full Vitest suite (30 test files, 443 tests)
npm test

# Run resilience and packet loss benchmarks
npm run benchmark

# Compile TypeScript and build production web bundle with SRI
npm run build
```

---

## Building the Android Release APK

To assemble the optimized, R8-minified production APK (~2.3 MB):

```bash
# Build web bundle, sync Capacitor, and assemble signed release APK
bash scripts/build-release-apk.sh
```

The signed binary is written to `dist/SecureVoice-v3.8.2-release.apk` alongside its SHA-256 checksum in `dist/SHA256SUMS.txt`.

---

## License

MIT License. See [LICENSE](LICENSE) for terms.
