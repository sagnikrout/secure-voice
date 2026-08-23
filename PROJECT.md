# Project: SecureVoice

## Architecture
SecureVoice is a production-grade, peer-to-peer encrypted voice calling application engineered for crystal-clear communication under extreme network degradation (sub-6kbps bandwidth, 30%–50% packet loss, 300–800ms latency, 100ms jitter, and intermittent connectivity).

### Core Layers
1. **Audio Pre-Processing Layer (`src/utils/audio.js`)**:
   - 6-Stage Web Audio pipeline: 80Hz Highpass Rumble Cut -> 2.8kHz Voice Presence Peaking Boost (+3dB) -> 4.2kHz Lowpass Hiss Cut -> Downward RMS Noise Gate (-46 dBFS) -> Dynamics Compressor (-18dB, 4:1) -> 1.2x Makeup Gain -> MediaStream Destination.
   - Hardware loopback testing, VU metering, and leak-free resource teardown.
2. **WebRTC Transport & Codec Layer (`src/utils/webrtc.js`, `src/constants/config.js`)**:
   - Dynamic Opus SDP transformation (`transformOpusSdp`): `useinbandfec=1`, `packetlossperc=10..50`, `usedtx=1`, `maxaveragebitrate=6000..20000`, `cbr=0`, `maxplaybackrate=8000..16000`, `ptime=60`, `maxptime=120`, `b=AS:8..24`.
   - RFC 2198 Redundant Audio Data (`audio/red`) negotiation and transceiver codec preference ordering.
   - `RTCRtpSender` encoding priority (`priority: 'high'`, `networkPriority: 'high'`).
3. **Telemetry & Adaptation Engine (`src/utils/networkAdaptation.js`, `src/hooks/useCallSession.js`)**:
   - 1000ms real-time `getStats()` polling extracting RTT, inbound loss, remote-inbound (uplink) loss, jitter, average jitter buffer delay, and concealment ratio.
   - 5-Tier Adaptive Bitrate Ladder (HQ: 20k, STD: 14k, LB: 10k, HL: 7.5k, EXT: 6k) with Exponential Moving Average (EMA) smoothing and asymmetric hysteresis (fast 1-tick downgrade, slow 4-tick upgrade).
   - Seamless ICE restart state machine (`pc.restartIce()`) with 5-retry exponential backoff preserving call session, streams, and UI timers across network drops and handovers.
4. **Signaling & Lifecycle Management (`src/hooks/usePeer.js`, `src/hooks/useCallSession.js`)**:
   - PeerJS P2P cloud signaling with 30-char unambiguous alphanumeric Peer IDs, rate limiting, and missed-call recording.
   - Deterministic 5-digit MITM Safety Code verification from DTLS-SRTP SHA-256 fingerprints.
5. **Testing & Benchmark Infrastructure (`src/test/`, `scripts/`)**:
   - Vitest unit and integration test matrix covering audio filtering, stats extraction, adaptation ladder, and reconnection state machines.
   - Playwright automated multi-profile network impairment benchmark runner (sub-6kbps, 30-50% loss, 300-800ms latency, jitter, reconnection).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 6-Stage Web Audio Denoise & Voice Isolation | 80Hz rumble highpass, 2.8kHz presence boost, 4.2kHz hiss cut, downward noise gate, compressor, makeup gain | M1 | ORIGINAL_REQUEST §R3 |
| 2 | Mic Stream Management & Cleanup | Device switching, hardware loopback testing, zero-leak track/context teardown | M1 | ORIGINAL_REQUEST §R3 |
| 3 | Dynamic Opus SDP Munging | Configurable `maxaveragebitrate` down to 6kbps, `useinbandfec=1`, dynamic `packetlossperc`, `usedtx=1`, `maxplaybackrate`, `ptime:60`, `maxptime:120`, `b=AS` | M2 | ORIGINAL_REQUEST §R1 |
| 4 | RFC 2198 RED Audio Redundancy | SDP payload injection for RED (`audio/red`) and transceiver codec preference ordering to survive 30–50% packet loss | M2 | ORIGINAL_REQUEST §R1 |
| 5 | Sender Encoding Priority & DSCP | Configure `RTCRtpSender` encoding parameters with `priority: 'high'` and `networkPriority: 'high'` | M2 | ORIGINAL_REQUEST §R1 |
| 6 | Real-Time Telemetry Monitor | 1000ms stats polling extracting RTT, downlink loss, uplink loss (RTCP RR), jitter, jitter buffer delay, concealment ratio | M3 | ORIGINAL_REQUEST §R2 |
| 7 | 5-Tier Adaptive Bitrate Ladder | Multi-tier ladder (HQ, STD, LB, HL, EXT) with EMA smoothing and asymmetric hysteresis | M3 | ORIGINAL_REQUEST §R2 |
| 8 | Seamless ICE Restart & Fast Reconnection | `pc.restartIce()` state machine with 5-retry exponential backoff preserving call session, stream, and audio context | M3 | ORIGINAL_REQUEST §R2 |
| 9 | Cross-Platform Benchmark Harness | Cross-platform process spawning (`npm.cmd` vs `npm`) in simulation scripts | M4 | ORIGINAL_REQUEST §R4 |
| 10 | 5-Profile Network Impairment Suite | Automated Playwright benchmarks for sub-6kbps, 30–50% loss, 300–800ms latency, 100ms jitter, and reconnection | M4 | ORIGINAL_REQUEST §R4 |
| 11 | Unit & Integration Test Matrix | Comprehensive Vitest suites for audio processing, adaptation logic, SDP transforms, and reconnection watchdogs | M4 | ORIGINAL_REQUEST §R4 |
| 12 | End-to-End Verification & Coverage Hardening | 100% test pass rate, clean build, benchmark execution, and adversarial testing | M5 | ORIGINAL_REQUEST Acceptance |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Audio Pre-Processing & Voice Isolation | 6-stage audio pipeline in `src/utils/audio.js`, noise gate, presence EQ, hiss cut, compressor, makeup gain | none | PLANNED |
| M2 | Extreme Low-Bandwidth & High-Loss Transport | Opus SDP tuning down to 6kbps, dynamic FEC/DTX, ptime:60/120, RFC 2198 RED negotiation, sender priority | none | PLANNED |
| M3 | Network Quality Adaptation & ICE Restart | Real-time telemetry monitor, 5-tier adaptation ladder with hysteresis, non-destructive ICE restart state machine | M2 | PLANNED |
| M4 | Automated Benchmarks & Test Suite | Cross-platform simulation harness, 5-profile network benchmark suite, comprehensive Vitest test coverage | M1, M2, M3 | PLANNED |
| M5 | Final E2E Verification & Hardening | 100% tests passing, clean build (`npm run build`), benchmark execution, adversarial coverage hardening | M1, M2, M3, M4 | PLANNED |

---

## Interface Contracts

### Audio Pipeline (`src/utils/audio.js`)
```javascript
export function createDenoisePipeline(stream, options = {}) {
  // Returns: { processedStream: MediaStream, audioCtx: AudioContext, nodes: { source, highPass, presenceEQ, hissCut, noiseGateGain, compressor, makeupGain, dest }, setNoiseGateEnabled(bool), setNoiseGateThreshold(db), cleanup() }
}
export function stopMediaStream(stream, audioCtx, nodes) {
  // Safely stops tracks, disconnects audio nodes, closes AudioContext
}
```

### WebRTC Transport & SDP (`src/utils/webrtc.js`, `src/constants/config.js`)
```javascript
export function transformOpusSdp(sdp, options = {}) {
  // options: { bitrate, ptime, maxptime, fec, packetLossPerc, dtx, stereo, maxPlaybackRate, enableRed }
  // Returns transformed SDP string with RED (RFC 2198), Opus parameters, and bandwidth limits
}
export function configureAudioTransceiver(transceiver) {
  // Sets codec preferences prioritizing audio/red followed by audio/opus
}
export function applySenderBitrate(sender, bitrateBps) {
  // Sets encodings maxBitrate, priority: 'high', networkPriority: 'high'
}
```

### Network Adaptation & Telemetry (`src/utils/networkAdaptation.js`)
```javascript
export class NetworkTelemetryMonitor {
  constructor(pc, onSnapshot) {}
  start(intervalMs = 1000) {}
  stop() {}
  async sample() // Returns NetworkTelemetrySnapshot
}

export class AdaptiveBitrateController {
  constructor(options = {}) {}
  evaluate(telemetrySnapshot) // Returns { tierChanged: boolean, currentTier: AdaptationTier, targetBitrateBps: number }
  reset() {}
}
```

### ICE Restart State Machine (`src/utils/iceRestartManager.js` or `src/hooks/useCallSession.js`)
```javascript
export class IceRestartManager {
  constructor(config = {}) {}
  triggerRestart(pc, renegotiateCallback) // Initiates pc.restartIce() with exponential backoff
  reset() {}
}
```

---

## Code Layout
- `src/constants/config.js`: Configuration constants for Opus, Adaptation Ladder, ICE Reconnect, and Timings.
- `src/utils/audio.js`: Audio capture, 6-stage Web Audio pipeline, noise gate, loopback test, and cleanup.
- `src/utils/webrtc.js`: SDP munging, RED negotiation, MITM safety code calculation, and codec helpers.
- `src/utils/networkAdaptation.js`: Telemetry monitor, EMA smoothing, and 5-tier adaptive ladder controller.
- `src/hooks/useCallSession.js`: Active call session lifecycle, stats integration, non-destructive ICE restart, and audio track routing.
- `src/hooks/usePeer.js`: PeerJS signaling, peer ID generation, incoming call filtering, and renegotiation handling.
- `src/components/`: UI components (CallScreen, WebRtcStatsOverlay, AudioSettingsModal, etc.).
- `src/test/`: Vitest test suites (`audio.test.js`, `webrtc.test.js`, `networkAdaptation.test.js`, etc.).
- `scripts/`: Playwright simulation runners (`simulate-network-impairments.js`, `webrtc-simulation-runner.js`).
