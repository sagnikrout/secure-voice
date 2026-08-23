# Milestone 1 Investigation Report: Web Audio Pre-Processing & Voice Isolation Pipeline (R3)

**Author**: Explorer 2 (Web Audio & Testing Specialist)  
**Milestone**: M1 (Web Audio Pre-Processing & Voice Isolation Pipeline - R3)  
**Target Files**: `src/utils/audio.js`, `src/test/setup.js`, `src/hooks/useCallSession.js`, `src/test/audio.test.js`

---

## 1. Observation

Direct code inspection of the existing implementation revealed the following concrete findings:

### 1.1 Web Audio Pre-Processing Pipeline (`src/utils/audio.js`)
- **Current Pipeline Structure (Lines 45–87)**:
  - `createDenoisePipeline(stream)` only instantiates 2 audio nodes: an 80Hz Highpass `BiquadFilterNode` and a `DynamicsCompressorNode` (configured at threshold -50dB, ratio 12, knee 40, attack 0.005s, release 0.25s).
  - **Missing Stages**:
    1. **Voice Presence Peaking Boost**: No 2.8kHz +3dB peaking EQ filter (`BiquadFilterNode`, type `peaking`, freq 2800Hz, gain +3dB, Q 1.0) specified in `PROJECT.md` §Core Layer 1.
    2. **Lowpass Hiss Cut**: No 4.2kHz lowpass filter (`BiquadFilterNode`, type `lowpass`, freq 4200Hz, Q 0.707) to strip high-frequency noise before Opus encoding.
    3. **Downward RMS Noise Gate**: No dedicated `GainNode` + envelope follower or sidechain energy detector to gate out background noise at -46 dBFS.
    4. **Makeup Gain**: No post-compression 1.2x (+1.58 dB) `GainNode` to restore nominal voice level.
  - **Interface Contract Mismatch (`PROJECT.md` §Interface Contracts vs `src/utils/audio.js`)**:
    - `PROJECT.md` specifies `createDenoisePipeline(stream, options = {})` returning `{ processedStream, audioCtx, nodes: { source, highPass, presenceEQ, hissCut, noiseGateGain, compressor, makeupGain, dest }, setNoiseGateEnabled(bool), setNoiseGateThreshold(db), cleanup() }`.
    - `src/utils/audio.js` currently accepts only `stream` and returns `{ processedStream, audioCtx, nodes: { source, highPass, compressor, dest } }` without dynamic control functions or cleanup handler.
    - `stopMediaStream(stream)` in `src/utils/audio.js` (line 277) does not accept `(stream, audioCtx, nodes)` as specified in `PROJECT.md` line 63.

### 1.2 Web Audio Node Parameter Scheduling & Glitch Prevention (`src/utils/audio.js`)
- In Web Audio API, dynamic parameter changes (e.g. opening/closing the noise gate or changing filter gains) require glitch-free scheduling:
  - Using `setTargetAtTime(target, startTime, timeConstant)` provides smooth first-order exponential transitions avoiding audio clicks/pops (zipper noise).
  - To prevent state transition conflicts when gating toggles rapidly, `cancelScheduledValues(currentTime)` followed by an anchoring `setValueAtTime(gain.value, currentTime)` is required before `setTargetAtTime(target, currentTime, timeConstant)`.
  - `exponentialRampToValueAtTime` cannot ramp to zero (throws `RangeError` per W3C Web Audio spec); `setTargetAtTime` is required when targeting 0.0 floor.

### 1.3 jsdom & Web Audio API Mocks (`src/test/setup.js`)
- `MockAudioContext` in `src/test/setup.js` (lines 34–108) is missing several node methods and properties that cause runtime errors when the full 6-stage pipeline and tests are executed:
  1. `createGain()` lacks `gain.setTargetAtTime`, `gain.cancelScheduledValues`, `gain.linearRampToValueAtTime`, `gain.value`, and `node.disconnect`.
  2. `createBiquadFilter()` lacks `gain` AudioParam (`setValueAtTime`), `Q` AudioParam, and `node.disconnect`.
  3. `createAnalyser()` lacks `getByteTimeDomainData`, `getFloatTimeDomainData`, `smoothingTimeConstant`, and `node.disconnect`.
  4. `createDynamicsCompressor()`, `createMediaStreamSource()`, and `createDelay()` lack `node.disconnect`.

### 1.4 Lifecycle, Resource Leaks & Dangling Timers (`src/hooks/useCallSession.js`)
- **Fast Microphone Switching Race Conditions (`switchMicrophone`, lines 538–609)**:
  - `switchMicrophone` has no concurrency lock. If a user quickly switches between devices (e.g. in `AudioSettingsModal`), multiple asynchronous `getUserMedia` and `replaceTrack` operations overlap.
  - If a call terminates (`endCall()`) while `switchMicrophone` is awaiting `getUserMedia` or `replaceTrack`, the completion of `switchMicrophone` attaches the new stream and leaves an orphaned `AudioContext` and active hardware microphone track running indefinitely after call hangup.
  - The pipeline cleanup callback (`pipeline.cleanup()`) is never called when replacing the audio pipeline.
- **Unmanaged Timers in Call Session**:
  - Line 386: `setTimeout(() => callbacksRef.current.onStatusChange?.('ready'), 3500)` in `call.on('close')` is not stored in a ref and not cleared in `endCall()` or on unmount.
  - If `createDenoisePipeline` uses an internal timer for RMS envelope detection, it must be cleared via `pipeline.cleanup()` in `endCall()`.

---

## 2. Logic Chain

1. **Audio Pre-Processing Fidelity**:
   - WebRTC Opus low-bitrate encoding (sub-6kbps to 12kbps) heavily degrades if low-frequency rumble (<80Hz) or high-frequency hiss (>4.2kHz) consumes bitrate.
   - Boosting 2.8kHz voice presence formants (+3dB, Q=1.0) improves speech intelligibility under lossy conditions.
   - A downward noise gate (threshold -46 dBFS, attack 10ms, release 150ms, hold 50ms) suppresses ambient noise during speech pauses, allowing Opus DTX (Discontinuous Transmission) to drop bandwidth consumption to near-zero.
   - Adding a 1.2x (+1.58 dB) makeup gain compensates for the -18dB 4:1 compression attenuation, driving nominal transmit levels into the WebRTC transceiver.

2. **DSP Scheduling Mechanism**:
   - AnalyserNode sidechain tapped after the 4.2kHz filter computes RMS energy:
     $\text{RMS} = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} x[i]^2}$
     $\text{dBFS} = 20 \log_{10}(\max(\text{RMS}, 10^{-5}))$
   - When RMS $\ge$ threshold: gate opens to target gain `1.0` with $\tau_{\text{attack}} = 0.010\text{s}$.
   - When RMS $<$ threshold (after 50ms hold): gate closes to target gain `0.0` with $\tau_{\text{release}} = 0.150\text{s}$.
   - The scheduling pattern `cancelScheduledValues` $\to$ `setValueAtTime(gain.value, now)` $\to$ `setTargetAtTime(target, now, timeConstant)` guarantees pop-free operation.

3. **Test Infrastructure Hardening**:
   - Enhancing `src/test/setup.js` with a comprehensive `createMockAudioParam` helper ensures that any node parameter manipulation (`setValueAtTime`, `setTargetAtTime`, `cancelScheduledValues`, `linearRampToValueAtTime`) succeeds in jsdom test runs.
   - Providing mock implementations for `getByteTimeDomainData` / `getFloatTimeDomainData` and `disconnect` on all nodes allows full pipeline lifecycle tests in Vitest.

4. **Resource Management & Concurrency**:
   - Adding an `isSwitchingMicRef` guard and post-await call state checks (`if (!isInCallRef.current) { cleanup(); return; }`) eliminates orphaned stream/context leaks during fast mic switching or call teardown.
   - Managing all timers via refs ensures 100% clean teardown on `endCall()` and component unmount.

---

## 3. Caveats

1. **Web Audio API Browser Support**: `AudioParam.setTargetAtTime` is standard across all modern browsers (Chrome, Firefox, Safari, Edge, Android WebView).
2. **Capacitor / Mobile Backgrounding**: When the app is in the background on Android, AudioContext execution continues as long as native foreground service and microphone permissions are maintained.
3. **Mock Scope**: jsdom does not calculate actual PCM audio DSP; unit tests will verify graph topology, node properties, scheduling calls, threshold changes, and cleanup invocations.

---

## 4. Conclusion & Proposed Code Solutions

### 4.1 Proposed `src/utils/audio.js` Changes

```javascript
/**
 * 6-Stage Web Audio Pre-Processing & Voice Isolation Pipeline:
 * 1. 80Hz Highpass Rumble Cut (BiquadFilterNode highpass, freq 80Hz, Q 0.707)
 * 2. 2.8kHz Voice Presence Peaking Boost (BiquadFilterNode peaking, freq 2800Hz, gain +3.0dB, Q 1.0)
 * 3. 4.2kHz Lowpass Hiss Cut (BiquadFilterNode lowpass, freq 4200Hz, Q 0.707)
 * 4. Downward RMS Noise Gate (-46 dBFS default) (GainNode + Envelope Follower)
 * 5. Dynamics Compressor (-18dB threshold, 4:1 ratio, 12dB knee, 3ms attack, 200ms release)
 * 6. Makeup Gain (1.2x / +1.58 dB GainNode) -> MediaStreamDestinationNode
 */
export function createDenoisePipeline(stream, options = {}) {
  if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) {
    return {
      processedStream: stream,
      audioCtx: null,
      nodes: null,
      setNoiseGateEnabled: () => {},
      setNoiseGateThreshold: () => {},
      cleanup: () => {}
    };
  }

  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) {
      return {
        processedStream: stream,
        audioCtx: null,
        nodes: null,
        setNoiseGateEnabled: () => {},
        setNoiseGateThreshold: () => {},
        cleanup: () => {}
      };
    }

    const ctx = new AudioCtxClass();
    const source = ctx.createMediaStreamSource(stream);

    // Stage 1: 80Hz Highpass Rumble Cut
    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(80, ctx.currentTime);
    if (highPass.Q) highPass.Q.setValueAtTime(0.707, ctx.currentTime);

    // Stage 2: 2.8kHz Voice Presence Peaking Boost (+3dB)
    const presenceEQ = ctx.createBiquadFilter();
    presenceEQ.type = 'peaking';
    presenceEQ.frequency.setValueAtTime(2800, ctx.currentTime);
    if (presenceEQ.gain) presenceEQ.gain.setValueAtTime(3.0, ctx.currentTime);
    if (presenceEQ.Q) presenceEQ.Q.setValueAtTime(1.0, ctx.currentTime);

    // Stage 3: 4.2kHz Lowpass Hiss Cut
    const hissCut = ctx.createBiquadFilter();
    hissCut.type = 'lowpass';
    hissCut.frequency.setValueAtTime(4200, ctx.currentTime);
    if (hissCut.Q) hissCut.Q.setValueAtTime(0.707, ctx.currentTime);

    // Stage 4: Downward RMS Noise Gate
    const noiseGateGain = ctx.createGain();
    noiseGateGain.gain.setValueAtTime(1.0, ctx.currentTime);

    const gateAnalyser = ctx.createAnalyser();
    gateAnalyser.fftSize = 512;
    gateAnalyser.smoothingTimeConstant = 0.0;

    let noiseGateEnabled = options.noiseGateEnabled !== false;
    let thresholdDb = typeof options.noiseGateThreshold === 'number' ? options.noiseGateThreshold : -46;
    const attackTime = options.attackTime || 0.010;  // 10ms attack
    const releaseTime = options.releaseTime || 0.150; // 150ms release
    const holdTimeMs = options.holdTimeMs || 50;     // 50ms hold

    let isGateOpen = true;
    let lastAboveThresholdTime = Date.now();
    let detectorIntervalId = null;

    const bufferLength = gateAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkNoiseGate = () => {
      if (!noiseGateEnabled) {
        if (!isGateOpen) {
          isGateOpen = true;
          const now = ctx.currentTime;
          noiseGateGain.gain.cancelScheduledValues(now);
          noiseGateGain.gain.setValueAtTime(noiseGateGain.gain.value, now);
          noiseGateGain.gain.setTargetAtTime(1.0, now, attackTime);
        }
        return;
      }

      gateAnalyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        const norm = (dataArray[i] - 128) / 128;
        sumSquares += norm * norm;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);
      const rmsDb = rms > 0.00001 ? 20 * Math.log10(rms) : -100;

      const nowMs = Date.now();
      const audioNow = ctx.currentTime;

      if (rmsDb >= thresholdDb) {
        lastAboveThresholdTime = nowMs;
        if (!isGateOpen) {
          isGateOpen = true;
          noiseGateGain.gain.cancelScheduledValues(audioNow);
          noiseGateGain.gain.setValueAtTime(noiseGateGain.gain.value, audioNow);
          noiseGateGain.gain.setTargetAtTime(1.0, audioNow, attackTime);
        }
      } else {
        if (isGateOpen && (nowMs - lastAboveThresholdTime >= holdTimeMs)) {
          isGateOpen = false;
          noiseGateGain.gain.cancelScheduledValues(audioNow);
          noiseGateGain.gain.setValueAtTime(noiseGateGain.gain.value, audioNow);
          noiseGateGain.gain.setTargetAtTime(0.0, audioNow, releaseTime);
        }
      }
    };

    detectorIntervalId = setInterval(checkNoiseGate, 25);

    // Stage 5: Dynamics Compressor (-18dB, 4:1 ratio)
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, ctx.currentTime);
    compressor.knee.setValueAtTime(12, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.20, ctx.currentTime);

    // Stage 6: Makeup Gain (1.2x / +1.58 dB)
    const makeupGain = ctx.createGain();
    makeupGain.gain.setValueAtTime(1.2, ctx.currentTime);

    // Destination
    const dest = ctx.createMediaStreamDestination();

    // Signal Routing
    source.connect(highPass);
    highPass.connect(presenceEQ);
    presenceEQ.connect(hissCut);
    hissCut.connect(gateAnalyser); // Sidechain tap
    hissCut.connect(noiseGateGain);
    noiseGateGain.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(dest);

    const cleanup = () => {
      if (detectorIntervalId) {
        clearInterval(detectorIntervalId);
        detectorIntervalId = null;
      }
      try { source.disconnect(); } catch (e) {}
      try { highPass.disconnect(); } catch (e) {}
      try { presenceEQ.disconnect(); } catch (e) {}
      try { hissCut.disconnect(); } catch (e) {}
      try { gateAnalyser.disconnect(); } catch (e) {}
      try { noiseGateGain.disconnect(); } catch (e) {}
      try { compressor.disconnect(); } catch (e) {}
      try { makeupGain.disconnect(); } catch (e) {}
      if (ctx && ctx.state !== 'closed') {
        try { ctx.close(); } catch (e) {}
      }
    };

    return {
      processedStream: dest.stream,
      audioCtx: ctx,
      nodes: {
        source,
        highPass,
        presenceEQ,
        hissCut,
        gateAnalyser,
        noiseGateGain,
        compressor,
        makeupGain,
        dest
      },
      setNoiseGateEnabled: (enabled) => {
        noiseGateEnabled = Boolean(enabled);
      },
      setNoiseGateThreshold: (db) => {
        if (typeof db === 'number') thresholdDb = db;
      },
      cleanup
    };
  } catch (err) {
    console.warn('Failed to build Web Audio denoise pipeline, falling back to raw stream:', err);
    return {
      processedStream: stream,
      audioCtx: null,
      nodes: null,
      setNoiseGateEnabled: () => {},
      setNoiseGateThreshold: () => {},
      cleanup: () => {}
    };
  }
}

export function stopMediaStream(stream, audioCtx = null, nodes = null) {
  if (nodes && typeof nodes === 'object') {
    Object.values(nodes).forEach(node => {
      if (node && typeof node.disconnect === 'function') {
        try { node.disconnect(); } catch (e) {}
      }
    });
  }
  if (audioCtx && typeof audioCtx.close === 'function' && audioCtx.state !== 'closed') {
    try { audioCtx.close(); } catch (e) {}
  }
  if (!stream || typeof stream.getTracks !== 'function') return;
  try {
    stream.getTracks().forEach(track => {
      track.stop();
      track.enabled = false;
    });
  } catch (e) {
    console.warn('Error stopping stream tracks:', e);
  }
}
```

### 4.2 Proposed `src/test/setup.js` Mock Enhancements

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
      release: createMockAudioParam(0.20),
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
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createAnalyser() {
    return {
      fftSize: 64,
      frequencyBinCount: 32,
      smoothingTimeConstant: 0.8,
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

### 4.3 Proposed `src/hooks/useCallSession.js` Lifecycle Hardening

1. Track `pipelineCleanupRef`:
   ```javascript
   const pipelineCleanupRef = useRef(null);
   const isSwitchingMicRef = useRef(false);
   const busyTimeoutRef = useRef(null);
   const isInCallRef = useRef(false);
   ```
2. In `acquireMicrophone`:
   ```javascript
   const { processedStream, audioCtx, cleanup } = createDenoisePipeline(stream);
   processedStreamRef.current = processedStream;
   audioCtxRef.current = audioCtx;
   pipelineCleanupRef.current = cleanup;
   ```
3. In `endCall`:
   ```javascript
   if (pipelineCleanupRef.current) {
     pipelineCleanupRef.current();
     pipelineCleanupRef.current = null;
   }
   if (busyTimeoutRef.current) {
     clearTimeout(busyTimeoutRef.current);
     busyTimeoutRef.current = null;
   }
   stopMediaStream(rawStreamRef.current, audioCtxRef.current);
   stopMediaStream(processedStreamRef.current);
   ```
4. In `switchMicrophone`:
   ```javascript
   if (isSwitchingMicRef.current) return false;
   isSwitchingMicRef.current = true;
   try {
     const newStream = await navigator.mediaDevices.getUserMedia(...);
     // Guard: if call was dropped during async getUserMedia
     if (!isInCallRef.current || !callRef.current) {
       stopMediaStream(newStream);
       return false;
     }
     const { processedStream, audioCtx, cleanup } = createDenoisePipeline(newStream);
     // ... swap tracks ...
     // Clean old pipeline
     if (pipelineCleanupRef.current) pipelineCleanupRef.current();
     stopMediaStream(rawStreamRef.current);
     
     rawStreamRef.current = newStream;
     processedStreamRef.current = processedStream;
     audioCtxRef.current = audioCtx;
     pipelineCleanupRef.current = cleanup;
     return true;
   } finally {
     isSwitchingMicRef.current = false;
   }
   ```

---

## 5. Verification Method

To verify these findings and implementations:
1. **Unit Tests (`src/test/audio.test.js`)**:
   - Verify all 6 stages are instantiated with specified frequencies and parameters:
     - `highPass`: type `'highpass'`, frequency `80Hz`.
     - `presenceEQ`: type `'peaking'`, frequency `2800Hz`, gain `3dB`, Q `1.0`.
     - `hissCut`: type `'lowpass'`, frequency `4200Hz`, Q `0.707`.
     - `noiseGateGain`: `GainNode` with `setTargetAtTime` scheduling.
     - `compressor`: threshold `-18dB`, ratio `4`, attack `0.003s`, release `0.20s`.
     - `makeupGain`: `GainNode` with gain `1.2`.
   - Verify `setNoiseGateEnabled` and `setNoiseGateThreshold` dynamically alter state.
   - Verify `cleanup()` disconnects all nodes and stops intervals.
2. **Lifecycle Tests**:
   - Rapidly invoke `switchMicrophone` sequentially and concurrently; assert zero unclosed AudioContext instances and zero unstopped tracks.
   - Trigger `endCall()` mid-switch; assert replacement stream is stopped immediately.
3. **Execution**:
   - Run Vitest suite: `npm test` or `npx vitest run src/test/audio.test.js`.
