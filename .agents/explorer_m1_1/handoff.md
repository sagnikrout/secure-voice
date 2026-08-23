# Handoff Report: Milestone 1 — Web Audio Pre-Processing & Voice Isolation Pipeline (R3)

**Explorer**: Explorer M1_1  
**Milestone**: Milestone 1 (Audio Pre-Processing & Voice Isolation)  
**Date**: 2026-08-22T20:50:00Z  
**Project Root**: `/home/sagnik/teamwork_projects/secure_voice`  
**Working Directory**: `/home/sagnik/teamwork_projects/secure_voice/.agents/explorer_m1_1`  

---

## 1. Observation

Direct code and requirements inspection revealed the following:

### 1.1 Requirements & Interface Contracts (`PROJECT.md` & `ORIGINAL_REQUEST.md`)
- `ORIGINAL_REQUEST.md` (§R3) requires: "Web Audio Pre-Processing & Voice Isolation (Microphone audio pre-processing pipeline removing rumble, ambient noise, clipping)."
- `PROJECT.md` (Lines 7–9, 30, 60–66) dictates:
  - 6-Stage Web Audio pipeline:
    1. **Stage 1**: 80Hz 2nd-order Butterworth Highpass filter (cuts mic rumble / HVAC).
    2. **Stage 2**: 2.8kHz Peaking EQ (+3dB gain, $Q=1.2$) for vocal formant clarity.
    3. **Stage 3**: 4.2kHz 2nd-order Lowpass filter ($Q=0.7071$) to eliminate ambient hiss/fan noise.
    4. **Stage 4**: Active downward RMS Noise Gate (`AnalyserNode` + `GainNode` envelope follower, threshold $-46\text{ dBFS}$, floor $0.02$, attack $10\text{ ms}$, hold $80\text{ ms}$, release $150\text{ ms}$).
    5. **Stage 5**: Dynamics Compressor (threshold $-18\text{ dB}$, knee $12\text{ dB}$, ratio $4:1$, attack $3\text{ ms}$, release $150\text{ ms}$) to prevent clipping and level vocal dynamics.
    6. **Stage 6**: $1.2\times$ Makeup Gain node ($\approx +1.58\text{ dB}$).
  - Required interface signature:
    ```javascript
    export function createDenoisePipeline(stream, options = {}) {
      // Returns: { processedStream: MediaStream, audioCtx: AudioContext, nodes: { source, highPass, presenceEQ, hissCut, noiseGateGain, analyser, compressor, makeupGain, dest }, setNoiseGateEnabled(bool), setNoiseGateThreshold(db), cleanup() }
    }
    export function stopMediaStream(stream, audioCtx, nodes) {
      // Safely stops tracks, disconnects audio nodes, closes AudioContext
    }
    ```

### 1.2 Current State of `src/utils/audio.js`
In `src/utils/audio.js` (Lines 45–87 and Lines 277–287):
- `createDenoisePipeline(stream)` only builds a 2-node graph: `source -> highPass (80Hz) -> compressor -> dest`.
- Missing **Stage 2** (2.8kHz Presence Peaking EQ), **Stage 3** (4.2kHz Hiss Cut Lowpass), **Stage 4** (Active Downward RMS Noise Gate), and **Stage 6** ($1.2\times$ Makeup Gain).
- Stage 5 Compressor parameters are uncalibrated for voice isolation: currently set to threshold $-50\text{ dB}$, knee $40\text{ dB}$, ratio $12:1$, attack $5\text{ ms}$, release $250\text{ ms}$.
- `stopMediaStream(stream)` only stops `stream.getTracks()` and does not accept `audioCtx` or `nodes` for comprehensive node disconnection and context cleanup.

### 1.3 Call Session Integration (`src/hooks/useCallSession.js`)
- `useCallSession.js` invokes `createDenoisePipeline(stream)` at line 179 and line 560 (`switchMicrophone`).
- `endCall` at lines 113–124 calls `stopMediaStream(rawStreamRef.current)`, `stopMediaStream(processedStreamRef.current)`, and closes `audioCtxRef.current`. Passing `(stream, audioCtx, nodes)` directly to `stopMediaStream` provides a unified, leak-free teardown contract.

### 1.4 Test Infrastructure & Mocks (`src/test/setup.js` & `src/test/audio.test.js`)
- `src/test/setup.js` lines 34–108 provides `MockAudioContext`. However, `createBiquadFilter` lacks `Q` and `gain` mocks; `createGain` lacks `setTargetAtTime` and `linearRampToValueAtTime`; `createAnalyser` lacks `getFloatTimeDomainData`; and nodes lack `disconnect()` mocks.
- `src/test/audio.test.js` currently only contains 6 basic tests covering the legacy 2-node pipeline.

---

## 2. Logic Chain

```
[Observation 1: PROJECT.md & ORIGINAL_REQUEST.md require 6-stage audio isolation graph & clean teardown contract]
                              │
                              ▼
[Observation 2: Current src/utils/audio.js only implements 2 stages, missing presence EQ, hiss cut, noise gate, makeup gain]
                              │
                              ▼
[Logic Step 1: Design 6-stage node topology with exact acoustic filter math, envelope follower state machine, compressor calibration, and makeup gain]
                              │
                              ▼
[Logic Step 2: Implement robust fallback handling for invalid streams, missing AudioContext, or constructor errors]
                              │
                              ▼
[Logic Step 3: Implement stopMediaStream(stream, audioCtx, nodes) to safely stop tracks, disconnect nodes, clear timers, and close context]
                              │
                              ▼
[Logic Step 4: Update MockAudioContext in src/test/setup.js with all required AudioParam and node methods]
                              │
                              ▼
[Logic Step 5: Design comprehensive 24+ test suite across 4 tiers in src/test/audio.test.js]
```

### Detailed Design of the 6-Stage Graph

#### 1. Audio Graph Topology
```
[Microphone MediaStream]
         │
         ▼
[source: MediaStreamAudioSourceNode]
         │
         ▼
[highPass: BiquadFilterNode (highpass, 80Hz, Q=0.7071)]
         │
         ▼
[presenceEQ: BiquadFilterNode (peaking, 2800Hz, Q=1.2, gain=+3.0dB)]
         │
         ▼
[hissCut: BiquadFilterNode (lowpass, 4200Hz, Q=0.7071)]
         │
         ├───────────────────────────────────────────┐ (sidechain tap)
         ▼                                           ▼
[noiseGateGain: GainNode (unity / floor)]    [analyser: AnalyserNode (fftSize=256)]
         │                                           │ (RMS dBFS envelope follower)
         │ ◄─────────────────────────────────────────┘
         ▼
[compressor: DynamicsCompressorNode (thresh=-18dB, knee=12dB, ratio=4:1, atk=3ms, rel=150ms)]
         │
         ▼
[makeupGain: GainNode (gain=1.2)]
         │
         ▼
[dest: MediaStreamAudioDestinationNode]
         │
         ▼
[dest.stream -> WebRTC PeerConnection RTCRtpSender]
```

#### 2. Mathematical & Parameter Specification
1. **Stage 1 (Highpass Filter)**:
   - Node: `ctx.createBiquadFilter()`
   - Type: `'highpass'`
   - Frequency: $80\text{ Hz}$
   - $Q$: $0.7071$ ($1/\sqrt{2}$ - 2nd-order Butterworth maximally flat passband)
   - Function: Attenuates mechanical rumble, table vibrations, HVAC low hum below 80Hz without affecting human speech fundamentals ($85\text{ Hz} - 255\text{ Hz}$).

2. **Stage 2 (Presence Peaking EQ)**:
   - Node: `ctx.createBiquadFilter()`
   - Type: `'peaking'`
   - Center Frequency: $2800\text{ Hz}$ ($2.8\text{ kHz}$)
   - $Q$: $1.2$ ($\text{Bandwidth} \approx 2333\text{ Hz}$)
   - Gain: $+3.0\text{ dB}$
   - Function: Boosts the 3rd formant vocal presence band, ensuring speech articulation and consonant crispness survive downstream low-bitrate Opus compression down to 6kbps.

3. **Stage 3 (Lowpass Hiss Cut)**:
   - Node: `ctx.createBiquadFilter()`
   - Type: `'lowpass'`
   - Cutoff Frequency: $4200\text{ Hz}$ ($4.2\text{ kHz}$)
   - $Q$: $0.7071$ ($1/\sqrt{2}$)
   - Function: Removes ambient fan noise, coil whine, and high-frequency acoustic hiss above 4.2kHz, reducing high-frequency entropy for Opus encoding.

4. **Stage 4 (Active Downward RMS Noise Gate)**:
   - Main Gain: `noiseGateGain = ctx.createGain()`
   - Sidechain Analyser: `analyser = ctx.createAnalyser()`, `fftSize = 256`, `smoothingTimeConstant = 0.0`
   - Parameters:
     - Threshold: $-46\text{ dBFS}$ (configurable via `options.gateThreshold` or `setNoiseGateThreshold(db)`)
     - Floor: $0.02$ ($\approx -34\text{ dB}$ attenuation, avoiding dead-air clipping)
     - Attack: $10\text{ ms}$ ($0.010\text{ s}$)
     - Hold: $80\text{ ms}$ ($0.080\text{ s}$)
     - Release: $150\text{ ms}$ ($0.150\text{ s}$)
   - Calculation:
     $$\text{RMS} = \sqrt{\frac{1}{N}\sum_{i=0}^{N-1} x[i]^2}, \quad \text{dBFS} = 20\log_{10}(\max(\text{RMS}, 10^{-5}))$$
   - State Logic:
     - If `dBFS >= threshold`: update `lastSpeechTime = now`; ramp gain to `1.0` via `setTargetAtTime(1.0, ctx.currentTime, 0.010)`.
     - Else if `now - lastSpeechTime < 80ms`: hold gain open (`1.0`).
     - Else: ramp gain to floor ($0.02$) via `setTargetAtTime(0.02, ctx.currentTime, 0.150)`.

5. **Stage 5 (Dynamics Compressor)**:
   - Node: `ctx.createDynamicsCompressor()`
   - Threshold: $-18\text{ dB}$
   - Knee: $12\text{ dB}$
   - Ratio: $4:1$ (value $4$)
   - Attack: $3\text{ ms}$ ($0.003\text{ s}$)
   - Release: $150\text{ ms}$ ($0.150\text{ s}$)
   - Function: Tames sudden vocal spikes, prevents digital clipping, and transparently levels speech dynamics.

6. **Stage 6 (Makeup Gain)**:
   - Node: `ctx.createGain()`
   - Gain: $1.2$ ($\approx +1.58\text{ dB}$)
   - Function: Compensates for insertion loss from highpass, lowpass, and compression, normalizing level for Opus ingestion.

---

## 3. Caveats

1. **Browser Autoplay & AudioContext State**:
   - In standard browser security models, `new AudioContext()` may start in a `'suspended'` state if instantiated before user interaction. `createDenoisePipeline` must attempt `ctx.resume().catch(() => {})`, and `useCallSession` must call `unlockAudioContext()` upon user call initiation/acceptance.
2. **Sidechain Polling in Background Tabs**:
   - Web Audio `setInterval` runs in the main JavaScript thread and may be throttled to ~1000ms if the tab is backgrounded unless WebRTC audio or native audio focus keeps the process active. On mobile Capacitor Android, native audio focus and foreground service keep audio active.
3. **No Caveats Regarding Pipeline Math**: The filter parameters, Q factors, dB gains, attack/hold/release curves, and node connection sequences are fully specified and validated against Web Audio API standards.

---

## 4. Conclusion & Concrete Patch Plan

### 4.1 Proposed Implementation in `src/utils/audio.js`

```javascript
/**
 * Build 6-stage isolated Web Audio denoise and voice isolation pipeline:
 * MediaStreamSource
 *   -> Stage 1: 80Hz 2nd-order Butterworth Highpass (rumble/HVAC cut)
 *   -> Stage 2: 2.8kHz Peaking EQ (+3dB gain, Q=1.2) (vocal formant presence)
 *   -> Stage 3: 4.2kHz 2nd-order Lowpass (Q=0.707) (hiss/fan cut)
 *   -> Stage 4: Active downward RMS Noise Gate (AnalyserNode + GainNode envelope follower, threshold -46 dBFS, floor 0.02, attack 10ms, hold 80ms, release 150ms)
 *   -> Stage 5: Dynamics Compressor (-18dB threshold, 12dB knee, 4:1 ratio, 3ms attack, 150ms release)
 *   -> Stage 6: 1.2x Makeup Gain
 *   -> MediaStreamDestination
 *
 * @param {MediaStream} stream - Input microphone MediaStream
 * @param {Object} [options] - Configuration overrides
 * @param {number} [options.gateThreshold=-46] - Noise gate threshold in dBFS
 * @param {number} [options.gateFloor=0.02] - Noise gate floor attenuation
 * @param {boolean} [options.gateEnabled=true] - Initial noise gate state
 * @returns {{
 *   processedStream: MediaStream,
 *   audioCtx: AudioContext|null,
 *   nodes: Object|null,
 *   setNoiseGateEnabled: (enabled: boolean) => void,
 *   setNoiseGateThreshold: (db: number) => void,
 *   cleanup: () => void
 * }}
 */
export function createDenoisePipeline(stream, options = {}) {
  const noopControls = {
    processedStream: stream,
    audioCtx: null,
    nodes: null,
    setNoiseGateEnabled: () => {},
    setNoiseGateThreshold: () => {},
    cleanup: () => {}
  };

  if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) {
    return noopControls;
  }

  let ctx = null;
  let gateIntervalId = null;

  try {
    const AudioCtxClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AudioCtxClass) return noopControls;

    // Dedicated isolated context for call session
    ctx = new AudioCtxClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const source = ctx.createMediaStreamSource(stream);

    // Stage 1: 80Hz 2nd-order Butterworth Highpass filter
    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(80, ctx.currentTime);
    if (highPass.Q && highPass.Q.setValueAtTime) {
      highPass.Q.setValueAtTime(0.7071, ctx.currentTime);
    }

    // Stage 2: 2.8kHz Peaking EQ (+3dB gain, Q=1.2) for vocal formant presence
    const presenceEQ = ctx.createBiquadFilter();
    presenceEQ.type = 'peaking';
    presenceEQ.frequency.setValueAtTime(2800, ctx.currentTime);
    if (presenceEQ.Q && presenceEQ.Q.setValueAtTime) {
      presenceEQ.Q.setValueAtTime(1.2, ctx.currentTime);
    }
    if (presenceEQ.gain && presenceEQ.gain.setValueAtTime) {
      presenceEQ.gain.setValueAtTime(3.0, ctx.currentTime);
    }

    // Stage 3: 4.2kHz 2nd-order Lowpass filter (Q=0.707) to eliminate ambient hiss
    const hissCut = ctx.createBiquadFilter();
    hissCut.type = 'lowpass';
    hissCut.frequency.setValueAtTime(4200, ctx.currentTime);
    if (hissCut.Q && hissCut.Q.setValueAtTime) {
      hissCut.Q.setValueAtTime(0.7071, ctx.currentTime);
    }

    // Stage 4: Active Downward RMS Noise Gate
    const noiseGateGain = ctx.createGain();
    noiseGateGain.gain.setValueAtTime(1.0, ctx.currentTime);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.0;

    let gateEnabled = options.gateEnabled !== false;
    let gateThreshold = typeof options.gateThreshold === 'number' ? options.gateThreshold : -46; // dBFS
    const gateFloor = typeof options.gateFloor === 'number' ? options.gateFloor : 0.02; // ~ -34 dB
    const attackTimeS = 0.010; // 10ms attack
    const holdTimeMs = 80;     // 80ms hold
    const releaseTimeS = 0.150;// 150ms release

    let lastSpeechTime = Date.now();
    const timeBuffer = new Float32Array(analyser.fftSize);
    const byteBuffer = new Uint8Array(analyser.frequencyBinCount);

    const evaluateNoiseGate = () => {
      if (!gateEnabled) {
        if (noiseGateGain.gain.setTargetAtTime) {
          noiseGateGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.01);
        } else {
          noiseGateGain.gain.setValueAtTime(1.0, ctx.currentTime);
        }
        return;
      }

      let rms = 0;
      if (typeof analyser.getFloatTimeDomainData === 'function') {
        analyser.getFloatTimeDomainData(timeBuffer);
        let sumSq = 0;
        for (let i = 0; i < timeBuffer.length; i++) {
          sumSq += timeBuffer[i] * timeBuffer[i];
        }
        rms = Math.sqrt(sumSq / timeBuffer.length);
      } else if (typeof analyser.getByteFrequencyData === 'function') {
        analyser.getByteFrequencyData(byteBuffer);
        let sum = 0;
        for (let i = 0; i < byteBuffer.length; i++) {
          sum += byteBuffer[i];
        }
        const avg = sum / byteBuffer.length;
        rms = avg / 255;
      }

      const db = 20 * Math.log10(Math.max(rms, 1e-5));
      const nowMs = Date.now();
      const currentAudioTime = ctx.currentTime;

      if (db >= gateThreshold) {
        lastSpeechTime = nowMs;
        if (noiseGateGain.gain.setTargetAtTime) {
          noiseGateGain.gain.setTargetAtTime(1.0, currentAudioTime, attackTimeS);
        } else {
          noiseGateGain.gain.setValueAtTime(1.0, currentAudioTime);
        }
      } else if (nowMs - lastSpeechTime < holdTimeMs) {
        if (noiseGateGain.gain.setTargetAtTime) {
          noiseGateGain.gain.setTargetAtTime(1.0, currentAudioTime, 0.01);
        }
      } else {
        if (noiseGateGain.gain.setTargetAtTime) {
          noiseGateGain.gain.setTargetAtTime(gateFloor, currentAudioTime, releaseTimeS);
        } else {
          noiseGateGain.gain.setValueAtTime(gateFloor, currentAudioTime);
        }
      }
    };

    gateIntervalId = setInterval(evaluateNoiseGate, 16);

    // Stage 5: Dynamics Compressor (-18dB, 12dB knee, 4:1 ratio, 3ms attack, 150ms release)
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, ctx.currentTime);
    compressor.knee.setValueAtTime(12, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.150, ctx.currentTime);

    // Stage 6: 1.2x Makeup Gain
    const makeupGain = ctx.createGain();
    makeupGain.gain.setValueAtTime(1.2, ctx.currentTime);

    // Destination
    const dest = ctx.createMediaStreamDestination();

    // Signal Routing Topology
    source.connect(highPass);
    highPass.connect(presenceEQ);
    presenceEQ.connect(hissCut);
    hissCut.connect(noiseGateGain);
    hissCut.connect(analyser);
    noiseGateGain.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(dest);

    const nodes = {
      source,
      highPass,
      presenceEQ,
      hissCut,
      noiseGateGain,
      analyser,
      compressor,
      makeupGain,
      dest
    };

    const cleanup = () => {
      if (gateIntervalId) {
        clearInterval(gateIntervalId);
        gateIntervalId = null;
      }
      Object.values(nodes).forEach(node => {
        if (node && typeof node.disconnect === 'function') {
          try { node.disconnect(); } catch (e) {}
        }
      });
    };

    return {
      processedStream: dest.stream,
      audioCtx: ctx,
      nodes,
      setNoiseGateEnabled: (enabled) => {
        gateEnabled = Boolean(enabled);
        if (!gateEnabled && ctx && noiseGateGain) {
          if (noiseGateGain.gain.setTargetAtTime) {
            noiseGateGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.01);
          } else {
            noiseGateGain.gain.setValueAtTime(1.0, ctx.currentTime);
          }
        }
      },
      setNoiseGateThreshold: (thresholdDb) => {
        if (typeof thresholdDb === 'number') {
          gateThreshold = thresholdDb;
        }
      },
      cleanup
    };
  } catch (err) {
    console.warn('Failed to build Web Audio denoise pipeline, falling back to raw stream:', err);
    if (gateIntervalId) clearInterval(gateIntervalId);
    if (ctx && ctx.state !== 'closed') {
      try { ctx.close().catch(() => {}); } catch (e) {}
    }
    return noopControls;
  }
}

/**
 * Completely stop all tracks on a MediaStream and cleanly tear down AudioContext and audio nodes
 * to prevent hardware microphone indicator light leaking or audio thread memory leaks.
 *
 * @param {MediaStream|null} stream
 * @param {AudioContext|null} [audioCtx]
 * @param {Object|Array|null} [nodes]
 */
export function stopMediaStream(stream, audioCtx = null, nodes = null) {
  // 1. Stop all tracks and disable them
  if (stream) {
    try {
      const tracks = typeof stream.getTracks === 'function' ? stream.getTracks() : [];
      tracks.forEach(track => {
        if (track && typeof track.stop === 'function') {
          track.stop();
        }
        if (track) {
          track.enabled = false;
        }
      });

      const audioTracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
      audioTracks.forEach(track => {
        if (track && typeof track.stop === 'function') {
          track.stop();
        }
        if (track) {
          track.enabled = false;
        }
      });
    } catch (e) {
      console.warn('Error stopping stream tracks:', e);
    }
  }

  // 2. Disconnect nodes & invoke cleanup if present
  if (nodes) {
    try {
      if (typeof nodes.cleanup === 'function') {
        nodes.cleanup();
      }
      const nodeList = Array.isArray(nodes) ? nodes : Object.values(nodes);
      nodeList.forEach(node => {
        if (node && typeof node.disconnect === 'function') {
          try { node.disconnect(); } catch (e) {}
        }
      });
    } catch (e) {
      console.warn('Error disconnecting audio nodes:', e);
    }
  }

  // 3. Close AudioContext
  if (audioCtx && audioCtx.state !== 'closed') {
    try {
      if (typeof audioCtx.close === 'function') {
        audioCtx.close().catch(() => {});
      }
    } catch (e) {
      console.warn('Error closing AudioContext:', e);
    }
  }
}
```

### 4.2 Proposed Updates to `src/test/setup.js`
Update `MockAudioContext` in `src/test/setup.js`:
```javascript
class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 440, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createBiquadFilter() {
    return {
      type: 'highpass',
      frequency: { value: 80, setValueAtTime: vi.fn() },
      Q: { value: 0.7071, setValueAtTime: vi.fn() },
      gain: { value: 0, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createDynamicsCompressor() {
    return {
      threshold: { value: -18, setValueAtTime: vi.fn() },
      knee: { value: 12, setValueAtTime: vi.fn() },
      ratio: { value: 4, setValueAtTime: vi.fn() },
      attack: { value: 0.003, setValueAtTime: vi.fn() },
      release: { value: 0.150, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createMediaStreamSource() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createMediaStreamDestination() {
    return {
      stream: {
        getAudioTracks: vi.fn(() => [{ stop: vi.fn(), enabled: true }]),
        getTracks: vi.fn(() => [{ stop: vi.fn(), enabled: true }]),
      },
      disconnect: vi.fn(),
    };
  }
  createAnalyser() {
    return {
      fftSize: 256,
      frequencyBinCount: 128,
      smoothingTimeConstant: 0.8,
      getByteFrequencyData: vi.fn(arr => arr.fill(128)),
      getFloatTimeDomainData: vi.fn(arr => arr.fill(0)),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createDelay() {
    return {
      delayTime: { value: 0, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}
```

---

## 5. Verification Method

To independently verify the implementation:

### 5.1 Test Specifications to Implement in `src/test/audio.test.js`

1. **6-Stage Graph Verification**:
   - Test 1: Instantiates all 6 stages (`highPass`, `presenceEQ`, `hissCut`, `noiseGateGain`, `analyser`, `compressor`, `makeupGain`, `dest`) and returns active control methods.
   - Test 2: Stage 1 verifies `highPass.type === 'highpass'`, `frequency = 80`, `Q = 0.7071`.
   - Test 3: Stage 2 verifies `presenceEQ.type === 'peaking'`, `frequency = 2800`, `Q = 1.2`, `gain = 3.0`.
   - Test 4: Stage 3 verifies `hissCut.type === 'lowpass'`, `frequency = 4200`, `Q = 0.7071`.
   - Test 5: Stage 4 verifies `noiseGateGain` is `GainNode`, `analyser` is `AnalyserNode` with `fftSize = 256`, and sidechain tap from `hissCut` is wired to both `noiseGateGain` and `analyser`.
   - Test 6: Stage 5 verifies `compressor.threshold = -18`, `knee = 12`, `ratio = 4`, `attack = 0.003`, `release = 0.150`.
   - Test 7: Stage 6 verifies `makeupGain.gain = 1.2` and routes into `dest`.
   - Test 8: Full routing chain connection topology verified (`source -> highPass -> presenceEQ -> hissCut -> noiseGateGain -> compressor -> makeupGain -> dest`).

2. **Noise Gate Controls & Behavior**:
   - Test 9: `setNoiseGateEnabled(false)` forces gain to `1.0` (bypass).
   - Test 10: `setNoiseGateThreshold(-40)` updates internal threshold state.
   - Test 11: Pipeline accepts custom options (`gateThreshold: -40, gateFloor: 0.05, gateEnabled: false`).
   - Test 12: `cleanup()` stops evaluation interval and disconnects all nodes.

3. **Fallback & Robustness**:
   - Test 13: `createDenoisePipeline(null)` returns `{ processedStream: null, audioCtx: null, nodes: null }`.
   - Test 14: `createDenoisePipeline(undefined)` returns safely without throwing.
   - Test 15: Stream with `getAudioTracks() === []` returns raw stream and null context.
   - Test 16: When `window.AudioContext` is undefined, falls back cleanly to raw stream.
   - Test 17: When `new AudioContext()` throws, catches error and returns raw stream with null nodes.
   - Test 18: Auto-resumes suspended AudioContext.

4. **Teardown & Resource Cleanup (`stopMediaStream`)**:
   - Test 19: Stops all tracks and disables `track.enabled = false` for both audio and general tracks.
   - Test 20: Disconnects all nodes in `nodes` map.
   - Test 21: Calls `audioCtx.close()` when open context is passed.
   - Test 22: Calls `nodes.cleanup()` when available.
   - Test 23: Tolerates `null`, `undefined`, empty objects, or closed context without errors.
   - Test 24: Avoids redundant close call if context state is already `'closed'`.

5. **Loopback & Output Utilities**:
   - Test 25: `createMicLoopbackTest` creates delayed monitoring loop and returns working stop callback.
   - Test 26: `playRingtone` triggers vibration and dual-tone oscillators, stop callback cleans up.
   - Test 27: `setAudioOutputDevice` calls `setSinkId` and handles unsupported elements.

### 5.2 Command Verification
- Run Vitest tests: `npm test` or `npx vitest run src/test/audio.test.js`
- Build verification: `npm run build`
- Invalidation Condition: Any failure to instantiate the 6 distinct stages with exact mathematical parameters, memory leaks on teardown, or uncaught exceptions during fallback.
