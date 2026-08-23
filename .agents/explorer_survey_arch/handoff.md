# Architecture Survey & Codebase State Handoff Report

**Project**: SecureVoice (P2P Encrypted Voice Calling)  
**Project Root**: `/home/sagnik/teamwork_projects/secure_voice`  
**Explorer**: Explorer 1 (Architecture & Codebase State)  
**Date**: 2026-08-22  

---

## 1. Observation

### 1.1 Project Structure & Build Tooling
- **`package.json`**:
  - Name: `secure-voice` (v3.0.1, `"type": "module"`).
  - Production Dependencies: `@capacitor/android` (^8.5.0), `@capacitor/cli` (^8.5.0), `@capacitor/core` (^8.5.0), `@capawesome-team/capacitor-android-foreground-service` (^8.1.0), `human-signals` (^8.0.1), `lucide-react` (^0.344.0), `peerjs` (^1.5.4), `react` (^18.2.0), `react-dom` (^18.2.0).
  - Dev Dependencies: `@testing-library/jest-dom` (^7.0.1), `@testing-library/react` (^16.3.2), `@testing-library/user-event` (^14.6.4), `@types/react` (^18.2.66), `@types/react-dom` (^18.2.22), `@vitejs/plugin-react` (^6.0.5), `gh-pages` (^6.3.0), `jsdom` (^24.0.0), `playwright` (^1.62.1), `undici` (^6.19.8), `vite` (^8.2.1), `vitest` (^1.6.1).
  - Scripts: `"dev": "vite --host"`, `"build": "vite build"`, `"preview": "vite preview"`, `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:sim": "node scripts/webrtc-simulation-runner.js"`, `"test:network": "node scripts/simulate-network-impairments.js"`.
- **`vite.config.js`**:
  - Vite configuration with `@vitejs/plugin-react`, `base: './'`, dev port `3000`, test environment `jsdom`, globals enabled, and setup file `./src/test/setup.js`.
- **`capacitor.config.json`** & `android/`:
  - Configured for `com.securevoice.app` with custom native plugin `AudioRoutingPlugin.java` handling audio focus, earpiece/speaker/Bluetooth SCO routing, and proximity screen-off wake lock.

### 1.2 Audio & Web Audio Pre-Processing (`src/utils/audio.js`)
- **`createDenoisePipeline(stream)`** (`src/utils/audio.js:45-87`):
  - Builds an isolated `AudioContext` instance.
  - High-pass filter (`BiquadFilterNode`, `type = 'highpass'`, `frequency = 80Hz`) to filter low-frequency microphone rumble.
  - `DynamicsCompressorNode` (`threshold = -50dB`, `knee = 40dB`, `ratio = 12`, `attack = 0.005s`, `release = 0.25s`) acting as a subtle noise gate / level normalizer.
  - Connects `source -> highPass -> compressor -> MediaStreamAudioDestinationNode`.
- **`acquireMicrophone()`** (`src/hooks/useCallSession.js:157-194`):
  - Solicits `navigator.mediaDevices.getUserMedia` with constraints `{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }` and passes the resulting stream through `createDenoisePipeline`.
- **Hardware Mic Loopback Test** (`src/utils/audio.js:182-253`):
  - `createMicLoopbackTest` provides hardware testing with a 250ms delay line and `AnalyserNode` for live VU metering.
- **Teardown & Leak Prevention** (`src/utils/audio.js:277-287`):
  - `stopMediaStream` stops all tracks and sets `track.enabled = false` to prevent hardware indicator light leaking.

### 1.3 Signaling, WebRTC Transport & Opus Optimization (`src/constants/config.js`, `src/utils/webrtc.js`, `src/hooks/usePeer.js`, `src/hooks/useCallSession.js`)
- **Signaling**:
  - `usePeer.js` manages PeerJS cloud signaling. Peer IDs are generated via `generatePeerId()` (`src/utils/webrtc.js:14-37`) using `crypto.getRandomValues` rejection sampling against 30 unambiguous uppercase alphanumeric characters (`PEER_ID_ALPHABET`).
  - Rate limiting (5000ms window between incoming calls) and line-busy auto-rejection with missed call recording.
- **Opus SDP Munging** (`src/utils/webrtc.js:52-135`):
  - Injects `b=AS:16` (16 kbps bandwidth cap) and `a=ptime:40` / `a=maxptime:60` before attribute lines in audio media sections.
  - Munges `a=fmtp:<opus_pt>` with `maxaveragebitrate=12000`, `usedtx=1`, `useinbandfec=1`, `packetlossperc=10`, `stereo=0`, `sprop-stereo=0`.
- **Dynamic Bitrate Adaptation** (`src/hooks/useCallSession.js:312-379`):
  - WebRTC stats polling interval at `TIMINGS.STATS_POLL_INTERVAL_MS = 3000ms`.
  - Calculates loss rate over inbound RTP packets:
    - `lossRate >= 0.12` (12% loss) -> steps down to 6 kbps (`MIN_BITRATE_BPS`).
    - `lossRate >= 0.05` (5% loss) -> steps down to 8 kbps (`MID_BITRATE_BPS`).
    - `lossRate <= 0.01` (<1% loss & RTT < 200ms) -> steps up to 16 kbps (`MAX_BITRATE_BPS`).
    - Modifies sender encodings using `audioSender.setParameters({ encodings: [{ maxBitrate: targetBitrate }] })`.
- **E2EE Safety Verification** (`src/utils/webrtc.js:156-179`):
  - Generates a deterministic 5-digit MITM Safety Code from sorted DTLS-SRTP SHA-256 fingerprints in local/remote SDP descriptions.

### 1.4 Test Suite & Simulation Harness (`src/test/`, `scripts/`)
- **Unit & Component Tests** (`src/test/`):
  - 10 test suites covering `audio.test.js`, `webrtc.test.js`, `audioRouting.test.js`, `formatters.test.js`, `useAudioDevices.test.js`, `AudioSettingsModal.test.jsx`, `InfoModal.test.jsx`, `RecentCalls.test.jsx`, `App.test.jsx`.
  - Mocking setup in `setup.js` for Web Audio API, MediaDevices, matchMedia, clipboard, and vibrate.
- **Simulation Scripts** (`scripts/`):
  - `webrtc-simulation-runner.js`: Automated 2-peer Playwright test verifying call setup, audio telemetry, duration, stats, device switcher, and teardown.
  - `simulate-network-impairments.js`: CDP throttle simulation (250ms latency, 10 kbps upload, 16 kbps download).

---

## 2. Logic Chain

From our direct codebase inspection against the requirements specified in `ORIGINAL_REQUEST.md`, we deduce the following logic chain:

1. **R1 Analysis (Extreme Low-Bandwidth & High-Loss Audio Transport)**:
   - *Requirement*: Opus dynamic FEC, DTX, maxaveragebitrate down to 6kbps, ptime/maxptime tuning, packet duplication / RED.
   - *Codebase State*:
     - Opus DTX (`usedtx=1`), ptime (`a=ptime:40`), maxptime (`a=maxptime:60`), maxaveragebitrate (`12000`), and basic FEC (`useinbandfec=1`, `packetlossperc=10`) are set in SDP.
     - `setParameters` bitrate stepping reaches 6 kbps (`MIN_BITRATE_BPS`).
   - *Deficiency*:
     - **RED (RFC 2198 Redundant Audio Data) is not negotiated**: Although mentioned in UI strings (`InfoModal.jsx`), there is no SDP negotiation for RED payload type (RFC 2198 audio redundancy) nor preference prioritization via `RTCRtpTransceiver.setCodecPreferences`. Under 30–50% packet loss, packet duplication with RED is essential to prevent severe packet starvation.
     - **Static Initial FEC Loss Estimate**: Initial SDP sets `packetlossperc=10`. Under extreme conditions (30-50% loss), Opus encoder FEC requires higher target packet loss setting or dynamic adjustments down to sub-6kbps audio bitrates.

2. **R2 Analysis (Real-Time Network Quality Adaptation & Fast Reconnection)**:
   - *Requirement*: Real-time stats monitoring, dynamic bitrate/FEC stepping, seamless ICE restart / fast re-signaling without dropping call session.
   - *Codebase State*:
     - `useCallSession.js:287-310` listens to `pc.onconnectionstatechange` and `pc.oniceconnectionstatechange`.
     - When `state === 'disconnected'`, a 2.5s watchdog timeout (`TIMINGS.DISCONNECT_WATCHDOG_MS`) runs, after which it directly invokes `endCall()`.
     - When `state === 'failed'`, it calls `endCall()` immediately.
   - *Deficiency*:
     - **Missing ICE Restart**: The application never invokes `pc.restartIce()` or re-signaling offers when a link disconnects or fails. Any network transition (e.g. WiFi to cellular handover, temporary loss of signal) results in an unrecoverable call termination after 2.5 seconds instead of a seamless session reconnect.
     - **Polling Interval**: Polling every 3000ms is too sluggish to react to fast network drops or sudden packet bursts before the user hears silence or degradation.

3. **R3 Analysis (Web Audio Pre-Processing & Voice Isolation)**:
   - *Requirement*: Microphone audio pre-processing pipeline removing rumble, ambient noise, clipping.
   - *Codebase State*:
     - `createDenoisePipeline` in `src/utils/audio.js` applies an 80Hz high-pass filter and a dynamics compressor.
   - *Deficiency*:
     - While rumble (low-frequency <80Hz) and dynamic range compression are handled, the pipeline lacks a speech bandpass/lowpass shaping filter (e.g., 7.5kHz - 8kHz cutoff) to eliminate high-frequency hiss/ambient noise, and lacks a dedicated peak limiter stage to prevent harsh digital clipping before passing audio to the WebRTC encoder.

4. **R4 Analysis (Automated Network Impairment Benchmarks & E2E Test Suite)**:
   - *Requirement*: Programmatic simulation test harness in `scripts/` and unit/integration tests in `src/test/`.
   - *Codebase State*:
     - `scripts/simulate-network-impairments.js` and `scripts/webrtc-simulation-runner.js` exist.
   - *Deficiency*:
     - **Portability Bug**: Both scripts hardcode `spawn('cmd.exe', ['/c', 'npm', ...])` at line 37, which fails on non-Windows Linux/WSL environments when spawning the dev server.
     - **Scenario Breadth**: The impairment runner tests only 1 mild condition (250ms latency / 10kbps upload). It lacks automated benchmarks verifying 30-50% packet loss resilience, high jitter, and ICE reconnection handling under worst-case network profiles.

---

## 3. Caveats

1. **Test Execution Environment**: Direct execution of shell commands was limited during survey due to environment PATH configuration, but all source code, test files, and config files were inspected directly line-by-line.
2. **Capacitor Android Native Routing**: The Android native Java plugin (`AudioRoutingPlugin.java`) was reviewed and verified to interface with Android `AudioManager` and `CommunicationDevice` APIs, but native build verification (`./gradlew assembleDebug`) requires the Android SDK.
3. **WebRTC RED Browser Support**: Not all browser engines support RFC 2198 RED audio transceivers equally; standard WebRTC implementations require fallback to pure Opus in-band FEC when RED is not negotiated by the remote peer.

---

## 4. Conclusion & Actionable Recommendations

The repository provides a clean, well-architected React + PeerJS foundation with established unit testing and simulation hooks. However, to satisfy all requirements in `ORIGINAL_REQUEST.md` (R1–R4), the following specific enhancements are required:

| Target Requirement | Specific Gap | Proposed Actionable Implementation |
| :--- | :--- | :--- |
| **R1: Low-Bandwidth & High-Loss Audio** | Missing RED negotiation & extreme packet loss FEC tuning | 1. Update `transformOpusSdp` and `config.js` to support RFC 2198 RED audio payload negotiation and transceiver codec preference ordering.<br>2. Support aggressive FEC tuning (`packetlossperc=30-50`) and lower bitrate floor down to 5–6 kbps when severe loss is detected. |
| **R2: Network Adaptation & Fast Reconnection** | Call termination on disconnect instead of seamless ICE restart | 1. Implement automatic `pc.restartIce()` and re-signaling offer mechanism in `useCallSession.js` on `iceConnectionState === 'disconnected' | 'failed'`.<br>2. Reduce stats polling interval from 3000ms to 1000–1500ms with fast-response bitrate stepping. |
| **R3: Audio Pre-Processing & Voice Isolation** | Missing high-frequency noise filter and clipping limiter | Enhance `createDenoisePipeline` in `src/utils/audio.js` with speech-band lowpass filtering (~7.5kHz cutoff) and peak limiter / soft-saturation curve for clipping prevention. |
| **R4: Impairment Benchmarks & Tests** | Hardcoded Windows `cmd.exe` spawn and narrow impairment test cases | 1. Fix cross-platform process spawning in `scripts/*.js` (`process.platform === 'win32' ? 'cmd.exe' : 'npm'`).<br>2. Expand `simulate-network-impairments.js` to benchmark 30–50% packet loss, high jitter, and ICE restart reconnection. |

---

## 5. Verification Method

1. **Unit & Integration Tests**:
   - Run: `npm test` (or `npx vitest run`)
   - Target files: `src/test/audio.test.js`, `src/test/webrtc.test.js`, `src/test/audioRouting.test.js`, `src/test/App.test.jsx`.
2. **Build Verification**:
   - Run: `npm run build`
   - Inspect: `dist/` directory generated with zero bundling errors.
3. **End-to-End & Network Impairment Benchmarks**:
   - Run: `npm run test:sim` (`node scripts/webrtc-simulation-runner.js`)
   - Run: `npm run test:network` (`node scripts/simulate-network-impairments.js`)
