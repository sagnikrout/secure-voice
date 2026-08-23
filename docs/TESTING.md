# 🧪 Testing & Verification Infrastructure

SecureVoice incorporates a 4-tier testing methodology covering unit testing, component isolation, adversarial fault injection, and automated network impairment benchmarks.

---

## 🏗️ Test Suite Overview

| Category | Command | Target / Scope | Suites / Assertions |
| :--- | :--- | :--- | :--- |
| **Unit & Integration** | `npm test` | Vitest suites in `src/test/` | 17 suites / 317 tests (100% passing) |
| **Typecheck & Build** | `npm run build` | `tsc && vite build` | Strict TypeScript + Vite bundle |
| **Resilience Benchmark** | `npm run benchmark` | `tsx scripts/benchmark-network-resilience.js` | 29/29 assertions verified |
| **Network Simulation** | `npm run test:network` | `tsx scripts/simulate-network-impairments.js` | Chrome CDP network throttling & handoff |

---

## 📁 Test Matrix (`src/test/`)

- `App.test.tsx`: Root component rendering, navigation, and global event listeners.
- `AudioSettingsModal.test.tsx`: Microphone/speaker hardware selection and audio device routing.
- `InfoModal.test.tsx`: Security specification and architecture overview dialog.
- `RecentCalls.test.tsx`: Peer call history, missed call badges, and click-to-dial.
- `audio.test.ts`: 6-stage Web Audio DSP pipeline, noise gate attack/release timings, loopback tests.
- `audioAdversarial.test.ts`: Fault injection for Web Audio API failures, dead streams, and invalid contexts.
- `audioAdversarialDeep.test.ts`: Extreme boundary conditions for RMS calculations, threshold limits, and audio buffers.
- `audioAdversarialDynamics.test.ts`: Stress testing for dynamic compressor and gain node transitions.
- `audioRouting.test.ts`: Hardware device switching and Android audio focus handling.
- `formatters.test.ts`: Peer ID formatting, call duration timers, and data sanitizers.
- `iceRestart.test.ts`: Reconnection state machines, exponential backoff, and non-destructive renegotiation.
- `networkAdaptation.test.ts`: 5-tier adaptive bitrate ladder, EMA smoothing, and asymmetric hysteresis.
- `resilienceFeatures.test.ts`: NetEQ jitter buffer target clamping and DSCP packet pacing.
- `useAudioDevices.test.ts`: Hardware enumeration and device change listeners.
- `webrtc.test.ts`: SDP munging, RFC 2198 RED injection, and safety code derivation.
- `webrtcAdversarial.test.ts`: Malformed SDP handling, extreme bitrate boundaries, and fingerprint verification.
- `webrtcStateAdversarial.test.ts`: Peer connection state anomalies and race condition guards.
