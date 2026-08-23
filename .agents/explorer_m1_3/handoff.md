# Milestone 1 Investigation & Specification Report: Web Audio Pre-Processing & Voice Isolation Pipeline (R3)

**Author**: Explorer 3 (Web Audio Pre-Processing & Testing Specialist)  
**Milestone**: Milestone 1 (Web Audio Pre-Processing & Voice Isolation Pipeline - R3)  
**Date**: 2026-08-22T20:55:00Z  
**Project Root**: `/home/sagnik/teamwork_projects/secure_voice`  
**Working Directory**: `/home/sagnik/teamwork_projects/secure_voice/.agents/explorer_m1_3`  
**Target Files Analyzed**:
- `PROJECT.md` & `.agents/ORIGINAL_REQUEST.md`
- `src/utils/audio.js`
- `src/hooks/useCallSession.js`
- `src/components/AudioSettingsModal.jsx`
- `src/components/CallAudioDeviceSwitcher.jsx`
- `src/components/AudioVisualizer.jsx`
- `src/hooks/useAudioDevices.js`
- `src/test/audio.test.js` & `src/test/setup.js`

---

## 1. Observation

Direct inspection of the codebase, existing call session hooks, visualizer components, and test files revealed the following concrete observations:

### 1.1 Requirements & Contract Specifications (`PROJECT.md` & `ORIGINAL_REQUEST.md`)
1. **`ORIGINAL_REQUEST.md` (§R3)** dictates:
   - "Web Audio Pre-Processing & Voice Isolation (Microphone audio pre-processing pipeline removing rumble, ambient noise, clipping)."
2. **`PROJECT.md` (§Architecture Core Layers, §Milestones M1, and §Interface Contracts)** mandates:
   - **6-Stage Web Audio Pre-Processing Pipeline**:
     - **Stage 1 (Rumble Cut)**: 80Hz 2nd-order Butterworth Highpass (`BiquadFilterNode`, `type: 'highpass'`, $f=80\text{ Hz}$, $Q=0.7071$).
     - **Stage 2 (Voice Presence Boost)**: 2.8kHz Voice Presence Peaking Boost (`BiquadFilterNode`, `type: 'peaking'`, $f=2800\text{ Hz}$, gain $=+3.0\text{ dB}$, $Q=1.0 - 1.2$).
     - **Stage 3 (Hiss Cut)**: 4.2kHz Lowpass Hiss Cut (`BiquadFilterNode`, `type: 'lowpass'`, $f=4200\text{ Hz}$, $Q=0.7071$).
     - **Stage 4 (Downward RMS Noise Gate)**: Downward RMS Noise Gate ($-46\text{ dBFS}$ default threshold, $0.02$ floor attenuation, $10\text{ ms}$ attack, $50-80\text{ ms}$ hold, $150\text{ ms}$ release) implemented via `GainNode` and `AnalyserNode` sidechain envelope detection.
     - **Stage 5 (Dynamics Compressor)**: Dynamics Compressor ($-18\text{ dB}$ threshold, $4:1$ ratio, $12\text{ dB}$ knee, $3\text{ ms}$ attack, $150-200\text{ ms}$ release).
     - **Stage 6 (Makeup Gain)**: $1.2\times$ ($+1.58\text{ dB}$) Makeup Gain (`GainNode`, gain $=1.2$).
     - **Destination**: `MediaStreamAudioDestinationNode` (`dest.stream`).
   - **Interface Contract**:
     ```javascript
     export function createDenoisePipeline(stream, options = {}) {
       // Returns: {
       //   processedStream: MediaStream,
       //   audioCtx: AudioContext,
       //   nodes: { source, highPass, presenceEQ, hissCut, noiseGateGain, compressor, makeupGain, dest, analyser },
       //   setNoiseGateEnabled: (bool) => void,
       //   setNoiseGateThreshold: (db) => void,
       //   cleanup: () => void
       // }
     }
     export function stopMediaStream(stream, audioCtx, nodes) {
       // Safely stops tracks, disconnects audio nodes, closes AudioContext
     }
     ```

### 1.2 Callers and Consumers Inspection

| Caller / Consumer File | Usage Location | Destructured / Referenced Properties | Purpose & Interaction |
|---|---|---|---|
| `src/hooks/useCallSession.js` | Lines 179 & 560 (`acquireMicrophone` & `switchMicrophone`) | `{ processedStream, audioCtx }` | Obtains `processedStream` from hardware mic, stores in `processedStreamRef.current`, transmits via WebRTC `peer.call()` and `RTCRtpSender.replaceTrack()`, manages mute state via `getAudioTracks()[0].enabled`, and closes `audioCtx` on `endCall()`. |
| `src/components/AudioVisualizer.jsx` | Line 19 (`useEffect([stream, isActive])`) | `stream` (passed as `callSession.activeStream`) | Takes `processedStream`, creates a `MediaStreamAudioSourceNode`, connects to `AnalyserNode`, and renders real-time 60fps canvas VU bars. |
| `src/components/AudioSettingsModal.jsx` & `CallAudioDeviceSwitcher.jsx` | `useCallSession.switchMicrophone(deviceId)` | Triggers dynamic mic rebuild | Allows user to switch between hardware mic devices in real-time without dropping the call. |
| `src/utils/audio.js` (`createMicLoopbackTest`) | Lines 182–253 | Independent isolated AudioContext | Pre-call hardware mic loopback test using `delay` (250ms), `gain` (0.4), and `analyser` (VU meter 0.0–1.0) with clean teardown. |
| `src/test/audio.test.js` | Lines 32–52 | `result.processedStream`, `result.audioCtx`, `result.nodes`, `result.nodes.highPass.type` | Unit test assertions verifying pipeline construction and fallback behavior. |

### 1.3 Backwards Compatibility Assessment
1. **Destructuring `{ processedStream, audioCtx }`**:
   - `useCallSession.js` destructs `{ processedStream, audioCtx } = createDenoisePipeline(stream)`. Adding `nodes`, `cleanup`, `setNoiseGateEnabled`, and `setNoiseGateThreshold` preserves 100% backwards compatibility.
2. **Accessing `nodes.highPass` & `nodes.compressor`**:
   - The new `nodes` object contains all legacy properties (`source`, `highPass`, `compressor`, `dest`) along with the new stages (`presenceEQ`, `hissCut`, `noiseGateGain`, `makeupGain`, `analyser`), ensuring zero regressions for any caller inspecting nodes.
3. **Fallback Safe Return**:
   - On `null` or invalid stream, `createDenoisePipeline` must return `{ processedStream: stream, audioCtx: null, nodes: null, cleanup: () => {}, setNoiseGateEnabled: () => {}, setNoiseGateThreshold: () => {} }`. Providing no-op functions prevents runtime `TypeError` if consumers call `result.cleanup()` unconditionally.
4. **`stopMediaStream` Extended Signature**:
   - `stopMediaStream(stream, audioCtx = null, nodes = null)` accepts 1, 2, or 3 arguments. Existing call sites calling `stopMediaStream(stream)` will continue to stop media tracks cleanly without error.

### 1.4 Test Infrastructure Gaps (`src/test/setup.js`)
- `MockAudioContext` in `src/test/setup.js` (lines 34–108) is missing:
  1. `createBiquadFilter`: lacks `Q` AudioParam, `gain` AudioParam, and `disconnect: vi.fn()`.
  2. `createGain`: lacks `setTargetAtTime`, `cancelScheduledValues`, `linearRampToValueAtTime`, and `disconnect: vi.fn()`.
  3. `createDynamicsCompressor`: lacks `disconnect: vi.fn()`.
  4. `createMediaStreamSource` & `createMediaStreamDestination`: lack `disconnect: vi.fn()`.
  5. `createAnalyser`: lacks `getFloatTimeDomainData`, `getByteTimeDomainData`, and `disconnect: vi.fn()`.
  6. `createDelay`: lacks `disconnect: vi.fn()`.

---

## 2. Logic Chain

```
[Observation: PROJECT.md §R3 requires 6-stage voice isolation pipeline, backwards-compatible interface, and clean teardown]
                                │
                                ▼
[Observation: Callers in useCallSession.js, AudioVisualizer.jsx, and audio.test.js rely on processedStream, audioCtx, nodes, and stopMediaStream]
                                │
                                ▼
[Step 1: Verify exact 6-stage audio topology, DSP parameters, and sidechain envelope follower state machine]
                                │
                                ▼
[Step 2: Guarantee backwards compatibility by preserving all legacy return keys and providing safe no-op fallbacks]
                                │
                                ▼
[Step 3: Harden lifecycle in useCallSession.js by tracking pipelineCleanupRef and guarding switchMicrophone concurrency]
                                │
                                ▼
[Step 4: Update MockAudioContext in src/test/setup.js with all required Web Audio node AudioParams and disconnect methods]
                                │
                                ▼
[Step 5: Specify comprehensive, multi-category test assertions for src/test/audio.test.js covering all 6 stages, controls, teardown, fallbacks, and loopback]
```

### Detailed Design & DSP Math Specification

1. **6-Stage Graph Structure**:
   ```
   [Mic MediaStream]
          │
          ▼
   [source: MediaStreamAudioSourceNode]
          │
          ▼
   [highPass: BiquadFilterNode (highpass, 80Hz, Q=0.7071)]
          │
          ▼
   [presenceEQ: BiquadFilterNode (peaking, 2800Hz, Q=1.0, gain=+3.0dB)]
          │
          ▼
   [hissCut: BiquadFilterNode (lowpass, 4200Hz, Q=0.7071)]
          │
          ├───────────────────────────────────────────┐ (sidechain tap)
          ▼                                           ▼
   [noiseGateGain: GainNode (unity / floor)]    [analyser: AnalyserNode (fftSize=256/512)]
          │                                           │ (RMS dBFS envelope follower)
          │ ◄─────────────────────────────────────────┘
          ▼
   [compressor: DynamicsCompressorNode (thresh=-18dB, knee=12dB, ratio=4:1, atk=3ms, rel=150-200ms)]
          │
          ▼
   [makeupGain: GainNode (gain=1.2 / +1.58dB)]
          │
          ▼
   [dest: MediaStreamAudioDestinationNode]
          │
          ▼
   [dest.stream -> WebRTC PeerConnection RTCRtpSender]
   ```

2. **Noise Gate Scheduling & Pop-Free State Transitions**:
   - Envelope calculation:
     $$\text{RMS} = \sqrt{\frac{1}{N}\sum_{i=0}^{N-1} x[i]^2}, \quad \text{dBFS} = 20\log_{10}(\max(\text{RMS}, 10^{-5}))$$
   - Pop-free scheduling:
     ```javascript
     const audioNow = ctx.currentTime;
     noiseGateGain.gain.cancelScheduledValues(audioNow);
     noiseGateGain.gain.setValueAtTime(noiseGateGain.gain.value, audioNow);
     if (rmsDb >= thresholdDb) {
       noiseGateGain.gain.setTargetAtTime(1.0, audioNow, attackTime); // 10ms
     } else {
       noiseGateGain.gain.setTargetAtTime(gateFloor, audioNow, releaseTime); // 150ms
     }
     ```

---

## 3. Caveats

1. **jsdom Web Audio Mocking Constraints**:
   - jsdom does not run a real DSP audio rendering engine. Unit tests in `src/test/audio.test.js` verify node creation, node types, frequency/gain/Q parameters, connection topology, AudioParam scheduling method invocations (`setValueAtTime`, `setTargetAtTime`, `cancelScheduledValues`), dynamic control states, and clean resource teardown (`disconnect`, `close`).
2. **AudioContext Autoplay Policy in Browsers**:
   - In modern browsers, `new AudioContext()` instantiated before user gesture starts in `'suspended'` state. `createDenoisePipeline` calls `ctx.resume().catch(() => {})`, and `useCallSession` calls `unlockAudioContext()` on user interaction (`acquireMicrophone`).
3. **No Caveats Regarding Backwards Compatibility**:
   - All legacy call sites and returned properties are strictly preserved.

---

## 4. Conclusion & Concrete Code Specifications

### 4.1 Implementation Specification for `src/utils/audio.js`

```javascript
/**
 * Build isolated 6-stage Web Audio denoise and voice isolation pipeline:
 * MediaStreamSource
 *   -> Stage 1: 80Hz 2nd-order Highpass Filter (rumble/HVAC cut)
 *   -> Stage 2: 2.8kHz Peaking EQ (+3dB gain, Q=1.0) (vocal presence boost)
 *   -> Stage 3: 4.2kHz 2nd-order Lowpass Filter (Q=0.707) (hiss/fan cut)
 *   -> Stage 4: Active Downward RMS Noise Gate (-46 dBFS default threshold, 0.02 floor)
 *   -> Stage 5: Dynamics Compressor (-18dB threshold, 12dB knee, 4:1 ratio, 3ms attack, 150ms release)
 *   -> Stage 6: 1.2x Makeup Gain (+1.58 dB)
 *   -> MediaStreamDestination
 *
 * @param {MediaStream} stream - Input microphone MediaStream
 * @param {Object} [options] - Configuration overrides
 * @param {number} [options.gateThreshold=-46] - Noise gate threshold in dBFS
 * @param {number} [options.gateFloor=0.02] - Attenuation floor when gate is closed
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
  const fallbackResult = {
    processedStream: stream,
    audioCtx: null,
    nodes: null,
    setNoiseGateEnabled: () => {},
    setNoiseGateThreshold: () => {},
    cleanup: () => {}
  };

  if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) {
    return fallbackResult;
  }

  let ctx = null;
  let gateIntervalId = null;

  try {
    const AudioCtxClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AudioCtxClass) return fallbackResult;

    ctx = new AudioCtxClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const source = ctx.createMediaStreamSource(stream);

    // Stage 1: 80Hz Highpass Rumble Cut
    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(80, ctx.currentTime);
    if (highPass.Q && highPass.Q.setValueAtTime) {
      highPass.Q.setValueAtTime(0.7071, ctx.currentTime);
    }

    // Stage 2: 2.8kHz Peaking EQ (+3dB Voice Presence)
    const presenceEQ = ctx.createBiquadFilter();
    presenceEQ.type = 'peaking';
    presenceEQ.frequency.setValueAtTime(2800, ctx.currentTime);
    if (presenceEQ.gain && presenceEQ.gain.setValueAtTime) {
      presenceEQ.gain.setValueAtTime(3.0, ctx.currentTime);
    }
    if (presenceEQ.Q && presenceEQ.Q.setValueAtTime) {
      presenceEQ.Q.setValueAtTime(1.0, ctx.currentTime);
    }

    // Stage 3: 4.2kHz Lowpass Hiss Cut
    const hissCut = ctx.createBiquadFilter();
    hissCut.type = 'lowpass';
    hissCut.frequency.setValueAtTime(4200, ctx.currentTime);
    if (hissCut.Q && hissCut.Q.setValueAtTime) {
      hissCut.Q.setValueAtTime(0.7071, ctx.currentTime);
    }

    // Stage 4: Downward RMS Noise Gate
    const noiseGateGain = ctx.createGain();
    noiseGateGain.gain.setValueAtTime(1.0, ctx.currentTime);

    const gateAnalyser = ctx.createAnalyser();
    gateAnalyser.fftSize = 256;
    gateAnalyser.smoothingTimeConstant = 0.0;

    let gateEnabled = options.gateEnabled !== false && options.noiseGateEnabled !== false;
    let gateThreshold = typeof options.gateThreshold === 'number'
      ? options.gateThreshold
      : (typeof options.noiseGateThreshold === 'number' ? options.noiseGateThreshold : -46);
    const gateFloor = typeof options.gateFloor === 'number' ? options.gateFloor : 0.02;
    const attackTime = 0.010;  // 10ms
    const holdTimeMs = 80;     // 80ms
    const releaseTime = 0.150; // 150ms

    let lastSpeechTime = Date.now();
    const timeBuffer = new Float32Array(gateAnalyser.fftSize);
    const byteBuffer = new Uint8Array(gateAnalyser.frequencyBinCount);

    const evaluateNoiseGate = () => {
      if (!gateEnabled) {
        const now = ctx.currentTime;
        if (noiseGateGain.gain.setTargetAtTime) {
          noiseGateGain.gain.setTargetAtTime(1.0, now, 0.01);
        } else {
          noiseGateGain.gain.setValueAtTime(1.0, now);
        }
        return;
      }

      let rms = 0;
      if (typeof gateAnalyser.getFloatTimeDomainData === 'function') {
        gateAnalyser.getFloatTimeDomainData(timeBuffer);
        let sumSq = 0;
        for (let i = 0; i < timeBuffer.length; i++) {
          sumSq += timeBuffer[i] * timeBuffer[i];
        }
        rms = Math.sqrt(sumSq / timeBuffer.length);
      } else if (typeof gateAnalyser.getByteTimeDomainData === 'function') {
        gateAnalyser.getByteTimeDomainData(byteBuffer);
        let sumSq = 0;
        for (let i = 0; i < byteBuffer.length; i++) {
          const norm = (byteBuffer[i] - 128) / 128;
          sumSq += norm * norm;
        }
        rms = Math.sqrt(sumSq / byteBuffer.length);
      } else if (typeof gateAnalyser.getByteFrequencyData === 'function') {
        gateAnalyser.getByteFrequencyData(byteBuffer);
        let sum = 0;
        for (let i = 0; i < byteBuffer.length; i++) {
          sum += byteBuffer[i];
        }
        rms = (sum / byteBuffer.length) / 255;
      }

      const db = 20 * Math.log10(Math.max(rms, 1e-5));
      const nowMs = Date.now();
      const currentAudioTime = ctx.currentTime;

      if (db >= gateThreshold) {
        lastSpeechTime = nowMs;
        if (noiseGateGain.gain.setTargetAtTime) {
          noiseGateGain.gain.setTargetAtTime(1.0, currentAudioTime, attackTime);
        } else {
          noiseGateGain.gain.setValueAtTime(1.0, currentAudioTime);
        }
      } else if (nowMs - lastSpeechTime < holdTimeMs) {
        if (noiseGateGain.gain.setTargetAtTime) {
          noiseGateGain.gain.setTargetAtTime(1.0, currentAudioTime, 0.01);
        }
      } else {
        if (noiseGateGain.gain.setTargetAtTime) {
          noiseGateGain.gain.setTargetAtTime(gateFloor, currentAudioTime, releaseTime);
        } else {
          noiseGateGain.gain.setValueAtTime(gateFloor, currentAudioTime);
        }
      }
    };

    gateIntervalId = setInterval(evaluateNoiseGate, 20);

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

    // Signal Routing Chain
    source.connect(highPass);
    highPass.connect(presenceEQ);
    presenceEQ.connect(hissCut);
    hissCut.connect(noiseGateGain);
    hissCut.connect(gateAnalyser); // Sidechain tap
    noiseGateGain.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(dest);

    const nodes = {
      source,
      highPass,
      presenceEQ,
      hissCut,
      gateAnalyser,
      analyser: gateAnalyser,
      noiseGateGain,
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
      if (ctx && ctx.state !== 'closed') {
        try { ctx.close().catch(() => {}); } catch (e) {}
      }
    };

    return {
      processedStream: dest.stream,
      audioCtx: ctx,
      nodes,
      setNoiseGateEnabled: (enabled) => {
        gateEnabled = Boolean(enabled);
        if (!gateEnabled && ctx && noiseGateGain) {
          const now = ctx.currentTime;
          if (noiseGateGain.gain.setTargetAtTime) {
            noiseGateGain.gain.setTargetAtTime(1.0, now, 0.01);
          } else {
            noiseGateGain.gain.setValueAtTime(1.0, now);
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
    return fallbackResult;
  }
}

/**
 * Safely stops tracks, disconnects audio nodes, closes AudioContext.
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
        if (track && typeof track.stop === 'function') track.stop();
        if (track) track.enabled = false;
      });

      const audioTracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
      audioTracks.forEach(track => {
        if (track && typeof track.stop === 'function') track.stop();
        if (track) track.enabled = false;
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

### 4.2 Mock Specification for `src/test/setup.js`

```javascript
function createMockAudioParam(defaultValue = 0) {
  return {
    value: defaultValue,
    setValueAtTime: vi.fn().mockReturnThis(),
    setTargetAtTime: vi.fn().mockReturnThis(),
    linearRampToValueAtTime: vi.fn().mockReturnThis(),
    exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
    cancelScheduledValues: vi.fn().mockReturnThis()
  };
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = { connect: vi.fn(), disconnect: vi.fn() };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: createMockAudioParam(440),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: createMockAudioParam(1),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createBiquadFilter() {
    return {
      type: 'highpass',
      frequency: createMockAudioParam(80),
      gain: createMockAudioParam(0),
      Q: createMockAudioParam(1),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createDynamicsCompressor() {
    return {
      threshold: createMockAudioParam(-18),
      knee: createMockAudioParam(12),
      ratio: createMockAudioParam(4),
      attack: createMockAudioParam(0.003),
      release: createMockAudioParam(0.150),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createMediaStreamDestination() {
    return {
      stream: {
        getAudioTracks: vi.fn(() => [{ stop: vi.fn(), enabled: true }]),
        getTracks: vi.fn(() => [{ stop: vi.fn(), enabled: true }]),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createAnalyser() {
    return {
      fftSize: 256,
      frequencyBinCount: 128,
      smoothingTimeConstant: 0.0,
      getByteFrequencyData: vi.fn(arr => arr.fill(128)),
      getByteTimeDomainData: vi.fn(arr => arr.fill(128)),
      getFloatTimeDomainData: vi.fn(arr => arr.fill(0)),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createDelay() {
    return {
      delayTime: createMockAudioParam(0.25),
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

### 5.1 Test Specification Matrix for `src/test/audio.test.js`

The updated `src/test/audio.test.js` must contain comprehensive assertions across all functional tiers:

```javascript
describe('Audio Utilities', () => {
  describe('getAudioContext & unlockAudioContext', () => {
    it('returns an AudioContext instance in browser environment');
    it('resumes suspended audio context on unlock');
    it('recreates AudioContext if previous instance is closed');
    it('handles resume failures gracefully without throwing unhandled exceptions');
  });

  describe('createDenoisePipeline - 6-Stage Graph Construction & Properties', () => {
    it('creates all 6 filter stages with accurate node types and properties', () => {
      // 1. highPass: type === 'highpass', freq === 80, Q === 0.7071
      // 2. presenceEQ: type === 'peaking', freq === 2800, gain === 3.0, Q === 1.0
      // 3. hissCut: type === 'lowpass', freq === 4200, Q === 0.7071
      // 4. noiseGateGain: GainNode (gain === 1.0), gateAnalyser: AnalyserNode (fftSize === 256)
      // 5. compressor: threshold === -18, ratio === 4, knee === 12, attack === 0.003, release === 0.150
      // 6. makeupGain: GainNode (gain === 1.2)
      // 7. dest: MediaStreamAudioDestinationNode
    });

    it('connects nodes in correct sequential chain with sidechain analyser tap', () => {
      // source -> highPass -> presenceEQ -> hissCut -> noiseGateGain -> compressor -> makeupGain -> dest
      // hissCut -> gateAnalyser (sidechain tap)
    });
  });

  describe('createDenoisePipeline - Noise Gate Controls & Options', () => {
    it('accepts initial configuration options (gateThreshold, gateFloor, gateEnabled)', () => {
      // Verify options override defaults
    });

    it('dynamically toggles noise gate via setNoiseGateEnabled(false/true)', () => {
      // Calling setNoiseGateEnabled(false) ramps gain to 1.0 (bypass)
    });

    it('dynamically updates threshold via setNoiseGateThreshold(db)', () => {
      // Calling setNoiseGateThreshold(-38) updates threshold state
    });

    it('tolerates non-numeric or invalid threshold arguments without crashing', () => {
      // setNoiseGateThreshold(NaN), setNoiseGateThreshold(null)
    });
  });

  describe('createDenoisePipeline - Teardown & Lifecycle', () => {
    it('cleanup() stops RMS evaluation timer and disconnects all 8 nodes', () => {
      // Verify node.disconnect called on source, highPass, presenceEQ, hissCut, gateAnalyser, noiseGateGain, compressor, makeupGain
      // Verify audioCtx.close called
    });

    it('cleanup() is idempotent and safe to call repeatedly', () => {
      // Double invocation does not throw
    });
  });

  describe('createDenoisePipeline - Fallback & Edge Cases', () => {
    it('falls back cleanly to input stream and noop controls when stream is null or undefined');
    it('falls back cleanly when stream has no audio tracks (empty array)');
    it('falls back cleanly when stream lacks getAudioTracks method');
    it('falls back cleanly when window.AudioContext is undefined');
    it('catches AudioContext constructor exceptions and returns raw stream with no-op controls');
  });

  describe('stopMediaStream', () => {
    it('stops and disables all tracks on MediaStream');
    it('safely disconnects all nodes in nodes dictionary');
    it('safely closes AudioContext if open');
    it('supports 1-arg call stopMediaStream(stream) for backwards compatibility');
    it('tolerates null, undefined, empty objects, and already-closed contexts without throwing');
  });

  describe('createMicLoopbackTest, playRingtone & setAudioOutputDevice', () => {
    it('createMicLoopbackTest configures delay (250ms), gain (0.4), analyser and returns working stop callback');
    it('createMicLoopbackTest cleans up stream and context when stop callback is invoked');
    it('createMicLoopbackTest catches getUserMedia error and frees resources');
    it('playRingtone starts oscillators and vibration, stop callback terminates both');
    it('setAudioOutputDevice calls setSinkId for speaker and earpiece modes');
    it('setAudioOutputDevice safely handles elements without setSinkId or null input');
  });
});
```

### 5.2 Independent Verification Command
1. `npm test` or `npx vitest run src/test/audio.test.js`
2. `npm run build`
3. Invalidation condition: Failure of any of the 6 stages to initialize with correct frequency/gain/Q parameters, missing backwards compatibility keys in the returned object, or uncaught exceptions during stream teardown.
