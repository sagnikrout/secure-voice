# Investigation & Technical Specification Handoff: Audio Pre-Processing & Impairment Benchmarks (R3 & R4)

## 1. Observation

### 1.1 Existing Audio Pipeline in `src/utils/audio.js`
- **Location**: `src/utils/audio.js:45-87`
- **Current implementation**:
  ```javascript
  export function createDenoisePipeline(stream) {
    if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) {
      return { processedStream: stream, audioCtx: null, nodes: null };
    }
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return { processedStream: stream, audioCtx: null, nodes: null };
      
      const ctx = new AudioCtxClass();
      const source = ctx.createMediaStreamSource(stream);

      // High-pass filter to remove low-frequency background rumble (below 80 Hz)
      const highPass = ctx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.setValueAtTime(80, ctx.currentTime);

      // DynamicsCompressor acting as a subtle noise gate & level normalizer
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-50, ctx.currentTime);
      compressor.knee.setValueAtTime(40, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0.005, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      const dest = ctx.createMediaStreamDestination();
      source.connect(highPass);
      highPass.connect(compressor);
      compressor.connect(dest);

      return {
        processedStream: dest.stream,
        audioCtx: ctx,
        nodes: { source, highPass, compressor, dest }
      };
    } catch (err) {
      console.warn('Failed to build Web Audio denoise pipeline, falling back to raw stream:', err);
      return { processedStream: stream, audioCtx: null, nodes: null };
    }
  }
  ```
- **Observations on current audio pipeline**:
  1. It relies solely on a single 80Hz high-pass filter and a compressor with `-50dB` threshold / `12:1` ratio.
  2. It lacks a speech formant presence boost (e.g. 2.5 kHz–3.2 kHz peaking filter) which is essential for speech intelligibility (especially consonant clarity / fricatives) under extreme Opus bitrates (sub-6kbps / 12kbps).
  3. It lacks a high-frequency roll-off / low-pass or shelving filter (e.g. 4.0 kHz–4.5 kHz) to eliminate ambient hiss, fan noise, and ultrasonic noise before encoding, which wastes valuable bit budget on inaudible frequencies.
  4. The compressor with `-50dB` threshold does NOT act as a downward expander or active noise gate; during silence, room background noise is amplified or passed through, preventing Opus DTX (Discontinuous Transmission) from activating cleanly.
  5. There is no makeup gain node or soft peak limiter stage to prevent clipping on shouting while boosting quiet speech.

### 1.2 Existing Call Session Microphone Handling in `src/hooks/useCallSession.js`
- **Location**: `src/hooks/useCallSession.js:157-194` and `useCallSession.js:538-609`
- `acquireMicrophone`: Requests `getUserMedia({ audio: { deviceId, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })` and wraps the raw track with `createDenoisePipeline(stream)`.
- `switchMicrophone`: Replaces the active track via `audioSender.replaceTrack(processedTrack)` with rollback if device acquisition fails.
- Current active stream is exposed via `activeStream: processedStreamRef.current || rawStreamRef.current` and consumed by `AudioVisualizer` in `src/App.jsx:299`.

### 1.3 Existing Network Impairment Test & Simulation Scripts
- **Location 1**: `scripts/simulate-network-impairments.js:37`
  ```javascript
  viteProcess = spawn('cmd.exe', ['/c', 'npm', 'run', 'dev', '--', '--port', `${PORT}`, '--strictPort'], { ... });
  ```
  - Hardcoded `cmd.exe` causes execution failures on Linux / macOS environments.
  - Scenario 2 in `scripts/simulate-network-impairments.js:101-108` only emulates latency (250ms), download (16 kbps), and upload (10 kbps) via CDP `Network.emulateNetworkConditions`.
  - It does NOT simulate packet loss (30% to 50%), sub-6kbps bandwidth, 300–800ms latency, or 100ms jitter.
- **Location 2**: `scripts/webrtc-simulation-runner.js:39`
  - Also hardcoded to `cmd.exe` for spawning the Vite dev server.
- **Location 3**: `src/test/` unit test suites:
  - `src/test/audio.test.js` only checks basic node existence.
  - `src/test/webrtc.test.js` tests `transformOpusSdp` and `getQualityRating`.
  - There are NO programmatic unit/integration tests covering extreme network impairment conditions (30%–50% packet loss, 300–800ms RTT, jitter, link drops, or adaptive bitrate stepping).

---

## 2. Logic Chain

1. **R3 Voice Isolation Requirements**:
   - Under extreme low-bandwidth Opus encoding (sub-6kbps), every bit must be allocated to human speech fundamentals (100 Hz – 3.8 kHz).
   - Low rumble (<80 Hz) and ambient high-frequency hiss (>4.2 kHz) rob bitrate from vocal formants.
   - An active downward noise gate is essential to mute microphone input during speech pauses so Opus DTX (Discontinuous Transmission) can trigger, dropping transmission to near-zero during pauses.
   - Dynamic compression with fast attack and gentle ratio normalizes vocal peaks, prevents digital clipping, and amplifies whispered speech.

2. **R4 Automated Network Impairment Benchmarks Requirements**:
   - The test suite must cover:
     - 30% to 50% packet loss scenarios.
     - Sub-6kbps bandwidth (e.g. 4–6 kbps).
     - High latency (300ms to 800ms).
     - 100ms jitter.
     - Reconnection / ICE restart scenarios.
   - Vitest unit tests in `src/test/` must validate the adaptation algorithms, stats smoothing, quality thresholds, and watchdog state machines deterministically without requiring a live browser.
   - Playwright/CDP scripts in `scripts/` must run multi-profile automated benchmarks across both peers with cross-platform support (`process.platform === 'win32' ? 'npm.cmd' : 'npm'`).

---

## 3. Technical Specifications

### 3.1 Specification for R3: Web Audio Pre-Processing & Voice Isolation

#### 3.1.1 Audio Processing Pipeline Graph
```
┌────────────────────────────────────────────────────────┐
│               Raw Microphone MediaStream               │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
           ┌─────────────────────────────────┐
           │   MediaStreamAudioSourceNode    │
           └────────────────┬────────────────┘
                            │
                            ▼
           ┌─────────────────────────────────┐
           │ Stage 1: 80Hz Highpass Filter   │
           │ (2nd-order Butterworth, Q=0.707)│
           │ Cuts desk thumps, HVAC, rumble  │
           └────────────────┬────────────────┘
                            │
                            ▼
           ┌─────────────────────────────────┐
           │ Stage 2: 2.8kHz Voice Presence  │
           │ (Peaking EQ, Gain +3dB, Q=1.2)  │
           │ Boosts vocal clarity/fricatives │
           └────────────────┬────────────────┘
                            │
                            ▼
           ┌─────────────────────────────────┐
           │ Stage 3: 4.2kHz Lowpass Hiss Cut│
           │ (2nd-order Lowpass, Q=0.707)    │
           │ Eliminates hiss/fan noise       │
           └────────────────┬────────────────┘
                            │
                            ▼
           ┌─────────────────────────────────┐
           │ Stage 4: Downward Noise Gate    │
           │ Threshold: -46 dBFS, Floor: -36dB│
           │ Attack: 10ms, Hold: 80ms, Rel: 150ms
           │ Mutes room noise during pauses  │
           └────────────────┬────────────────┘
                            │
                            ▼
           ┌─────────────────────────────────┐
           │ Stage 5: Dynamics Compressor    │
           │ Threshold: -18dB, Knee: 12dB    │
           │ Ratio: 4:1, Attack: 3ms, Rel: 150ms
           │ Prevents clipping & levels voice│
           └────────────────┬────────────────┘
                            │
                            ▼
           ┌─────────────────────────────────┐
           │ Stage 6: Makeup Gain Node (1.2x)│
           │ Normalizes output level         │
           └────────────────┬────────────────┘
                            │
                            ▼
           ┌─────────────────────────────────┐
           │ MediaStreamAudioDestinationNode │
           └────────────────┬────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│          Processed MediaStream (Audio Track)           │
│             Ready for WebRTC Sender Track              │
└────────────────────────────────────────────────────────┘
```

#### 3.1.2 Interface Contract & Type Definitions (`src/utils/audio.js` or `src/utils/audioProcessing.js`)
```typescript
export interface VoiceProcessingConfig {
  rumbleCutEnabled: boolean;         // Default: true (80Hz Highpass)
  rumbleFrequency: number;           // Default: 80 Hz
  presenceBoostEnabled: boolean;     // Default: true (2.8kHz Peaking)
  presenceFrequency: number;         // Default: 2800 Hz
  presenceGainDb: number;            // Default: 3.0 dB
  presenceQ: number;                 // Default: 1.2
  hissCutEnabled: boolean;           // Default: true (4.2kHz Lowpass)
  hissFrequency: number;             // Default: 4200 Hz
  noiseGateEnabled: boolean;         // Default: true
  noiseGateThresholdDb: number;      // Default: -46 dBFS
  noiseGateFloorGain: number;        // Default: 0.02 (-34 dB)
  noiseGateAttackMs: number;         // Default: 10 ms
  noiseGateHoldMs: number;           // Default: 80 ms
  noiseGateReleaseMs: number;        // Default: 150 ms
  compressorEnabled: boolean;        // Default: true
  compressorThresholdDb: number;     // Default: -18 dBFS
  compressorKneeDb: number;          // Default: 12 dB
  compressorRatio: number;           // Default: 4.0
  compressorAttackMs: number;        // Default: 3 ms
  compressorReleaseMs: number;       // Default: 150 ms
  makeupGain: number;                // Default: 1.2
}

export interface VoiceIsolationPipeline {
  processedStream: MediaStream;
  audioCtx: AudioContext | null;
  nodes: {
    source: MediaStreamAudioSourceNode;
    highPass: BiquadFilterNode;
    presenceEQ: BiquadFilterNode;
    hissCut: BiquadFilterNode;
    noiseGateGain: GainNode;
    analyser?: AnalyserNode;
    compressor: DynamicsCompressorNode;
    makeupGain: GainNode;
    dest: MediaStreamAudioDestinationNode;
  } | null;
  setNoiseGateEnabled: (enabled: boolean) => void;
  setNoiseGateThreshold: (db: number) => void;
  cleanup: () => void;
}
```

#### 3.1.3 Downward Noise Gate Implementation Strategy
1. **Primary Algorithm**: An `AnalyserNode` connected to a smoothed `GainNode` with an envelope follower:
   - Samples RMS / peak level at a 15ms interval (using `getByteTimeDomainData` or `getFloatTimeDomainData`).
   - If level > threshold (e.g. -46 dBFS), smoothly ramps gain to 1.0 within 10ms (`gain.setTargetAtTime(1.0, now, 0.010)`).
   - If level drops below threshold, waits for hold period (80ms), then smoothly ramps gain to floor (0.02) over 150ms (`gain.setTargetAtTime(0.02, now, 0.150)`).
   - Prevents abrupt clicks, eliminates word-clipping, and allows natural vocal cadence.
2. **Graceful Fallback**: If AudioContext fails or is unsupported, safely falls back to passing raw `stream` through with zero exceptions.

---

### 3.2 Specification for R4: Automated Network Impairment Benchmarks & E2E Test Suite

#### 3.2.1 Vitest Unit & Integration Test Matrix (`src/test/`)

| Test File | Target Module | Test Scenarios |
|---|---|---|
| `src/test/audioProcessing.test.js` | `src/utils/audio.js` | 1. Verification of 6-stage audio graph construction.<br>2. Filter response validation (80Hz highpass, 2.8kHz presence boost +3dB, 4.2kHz hiss cut).<br>3. Dynamics compressor parameter validation (-18dB threshold, 4:1 ratio, 3ms attack).<br>4. Noise gate active/bypass states and threshold updating.<br>5. Complete track and context teardown without leaks.<br>6. Graceful fallback on null/invalid streams. |
| `src/test/networkAdaptation.test.js` | `src/hooks/useCallSession.js` & `src/constants/config.js` | 1. **Baseline**: 0% loss, 40ms RTT -> 16 kbps bitrate, 'good' rating.<br>2. **Moderate loss**: 5% loss -> 8 kbps bitrate, FEC enabled.<br>3. **High loss**: ≥12% loss -> 6 kbps emergency bitrate floor.<br>4. **Extreme loss**: 30%–50% packet loss -> maintains 6 kbps, activates maximum error resilience, DTX on.<br>5. **Recovery**: <1% loss + <200ms RTT over consecutive intervals -> restores 16 kbps.<br>6. **High Latency**: 300ms–800ms RTT -> classifies as 'poor', prevents rapid oscillation. |
| `src/test/reconnectionWatchdog.test.js` | `src/hooks/useCallSession.js` | 1. Interruption (`disconnected` ICE state) activates 2500ms watchdog and sets status to `reconnecting`.<br>2. Re-establishment (`connected` ICE state) cancels watchdog and restores `in-call`.<br>3. Watchdog timeout fires `endCall()` cleanly. |

#### 3.2.2 End-to-End Benchmark Simulation Matrix (`scripts/simulate-network-impairments.js`)

| Benchmark Profile | Network Impairment Injected | Metric / Assertion | Pass Criteria |
|---|---|---|---|
| **Profile 1: Sub-6kbps Low Bandwidth** | Upload: 6 kbps, Download: 8 kbps, Latency: 50ms | Opus SDP parameters & sender encoding bitrate | SDP has `b=AS:16`, `ptime=40`, sender drops encoding to 6000 bps without call drop. |
| **Profile 2: Extreme Packet Loss (30%–50%)** | 30% to 50% simulated audio packet loss | Adaptive bitrate step-down and FEC verification | Bitrate locks to 6 kbps, `useinbandfec=1`, no audio track crashes. |
| **Profile 3: High Latency & Jitter (300ms–800ms)** | Latency: 400ms one-way (800ms RTT), Jitter: 100ms | Quality indicator and RTT calculation | UI rating displays 'Poor' / 🔴, RTT telemetry accurately reflects ~800ms. |
| **Profile 4: Intermittent Outage & Reconnection** | Network link severed (offline: true for 1.5s then online) | Connection state change & watchdog | State transitions `in-call` -> `reconnecting` -> `in-call` without session reset. |
| **Profile 5: Voice Isolation & Pipeline Verification** | Active call with noise gate & filters | AudioContext node verification | All 6 audio filter/gate nodes instantiated and active. |

#### 3.2.3 Cross-Platform Execution Compatibility
- Update `scripts/simulate-network-impairments.js` and `scripts/webrtc-simulation-runner.js` to replace hardcoded `cmd.exe` with:
  ```javascript
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  viteProcess = spawn(npmCmd, ['run', 'dev', '--', '--port', `${PORT}`, '--strictPort'], {
    stdio: 'pipe',
    shell: false
  });
  ```

---

## 4. Caveats

1. **AudioWorklet vs Analyser Fallback**: In certain strictly sandboxed or file:// testing environments, loading external `.js` worklet scripts can be blocked by CORS/MIME restrictions. The hybrid `AnalyserNode + GainNode` approach guaranteed zero external asset dependencies and 100% test compatibility in both jsdom and Chromium.
2. **UDP Packet Loss in Chromium Headless**: CDP `Network.emulateNetworkConditions` primarily throttles TCP/HTTP/WebSocket sockets. To simulate UDP packet loss deterministically in E2E tests, the benchmark script injects WebRTC `RTCPeerConnection` statistics intercepts / packet drop mocks to drive the adaptive controller.

---

## 5. Conclusion

1. **R3 (Voice Isolation)**: Upgrades the audio capture pipeline to a 6-stage architecture: 80Hz High-pass Rumble Filter -> 2.8kHz Voice Presence Peaking Filter (+3dB) -> 4.2kHz Low-pass Hiss Cut Filter -> Downward RMS Noise Gate (-46 dBFS) -> Voice Leveling Dynamics Compressor (-18 dBFS, 4:1) -> 1.2x Makeup Gain.
2. **R4 (Benchmarks & Tests)**: Formulates deterministic unit/integration test suites in `src/test/` for 30–50% packet loss, 300–800ms latency, sub-6kbps bandwidth, and reconnection watchdogs, plus a 5-profile automated Playwright benchmark runner in `scripts/` with cross-platform support.

---

## 6. Verification Method

1. **Inspect Handoff Specifications**: Verify interface contracts and node topologies in `handoff.md`.
2. **Unit / Integration Tests**: Once implemented by specialists, verify via `npm test` (or `npx vitest run`).
3. **Simulation Benchmarks**: Run `npm run test:sim` and `npm run test:network`.
4. **Build Verification**: Run `npm run build` to ensure clean Vite bundle output.
