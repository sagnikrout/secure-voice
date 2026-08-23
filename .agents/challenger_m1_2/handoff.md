# Milestone 1 Adversarial Challenge Report (Challenger 2)

**Challenger**: Challenger 2 (Empirical Challenger)  
**Milestone**: Milestone 1 (Web Audio Pre-Processing & Voice Isolation Pipeline - R3)  
**Verdict**: **REQUEST_CHANGES**  
**Date**: 2026-08-23T02:37:00Z  
**Project Root**: `/home/sagnik/teamwork_projects/secure_voice`  
**Working Directory**: `/home/sagnik/teamwork_projects/secure_voice/.agents/challenger_m1_2`  

---

## 1. Observation

Direct adversarial stress testing and code inspection of `src/utils/audio.js` revealed 7 concrete, reproducible failure modes in error isolation, teardown resilience, and Web Audio API constructor exception handling.

### 1.1 Verbatim Test Failures

Running `npx vitest run src/test/audioAdversarial.test.js` yielded the following 7 test failures:

```
FAIL  src/test/audioAdversarial.test.js > Adversarial & Stress Testing: Web Audio Pipeline (Milestone 1) > Stream & Track Pathologies & Teardown Attacks > handles stream tracks whose stop() throws without crashing or leaking remaining tracks
AssertionError: expected true to be false // Object.is equality
- Expected: false
+ Received: true
 ❯ src/test/audioAdversarial.test.js:47:30
     47|       expect(track1.enabled).toBe(false);

FAIL  src/test/audioAdversarial.test.js > Adversarial & Stress Testing: Web Audio Pipeline (Milestone 1) > Stream & Track Pathologies & Teardown Attacks > continues disconnecting nodes when nodes.cleanup() throws
AssertionError: expected "spy" to be called at least once
 ❯ src/test/audioAdversarial.test.js:185:32
    185|       expect(node1.disconnect).toHaveBeenCalled();

FAIL  src/test/audioAdversarial.test.js > Adversarial & Stress Testing: Web Audio Pipeline (Milestone 1) > Web Audio API Fault Injection & Error Recovery > gracefully handles AudioContext constructor throwing in getAudioContext
AssertionError: expected [Function] to not throw an error but 'Error: QuotaExceededError: Cannot create more AudioContexts' was thrown
- Expected: undefined
+ Received: "Error: QuotaExceededError: Cannot create more AudioContexts"
 ❯ src/test/audioAdversarial.test.js:201:45

FAIL  src/test/audioAdversarial.test.js > Adversarial & Stress Testing: Web Audio Pipeline (Milestone 1) > Noise Gate Signal Processing & Boundary Attacks > handles NaN gateFloor or gateThreshold in initial options without passing NaN to AudioParam
AssertionError: expected true to be false // Object.is equality
- Expected: false
+ Received: true
 ❯ src/test/audioAdversarial.test.js:469:41
    469|       expect(Number.isNaN(floorPassed)).toBe(false);

FAIL  src/test/audioAdversarial.test.js > Adversarial & Stress Testing: Web Audio Pipeline (Milestone 1) > Noise Gate Signal Processing & Boundary Attacks > handles analyser throwing during tick evaluation without crashing timer thread
AssertionError: expected [Function] to not throw an error but 'Error: Underlying Web Audio DSP thread lost' was thrown
- Expected: undefined
+ Received: "Error: Underlying Web Audio DSP thread lost"
 ❯ src/test/audioAdversarial.test.js:542:52

FAIL  src/test/audioAdversarial.test.js > Adversarial & Stress Testing: Web Audio Pipeline (Milestone 1) > Loopback, Ringtone & Audio Device Routing Adversarial Tests > createMicLoopbackTest handles exception inside onLevel callback cleanly
AssertionError: expected [Function] to not throw an error but 'Error: UI rendering exception in VU meter' was thrown
- Expected: undefined
+ Received: "Error: UI rendering exception in VU meter"
 ❯ src/test/audioAdversarial.test.js:578:53

FAIL  src/test/audioAdversarial.test.js > Adversarial & Stress Testing: Web Audio Pipeline (Milestone 1) > Loopback, Ringtone & Audio Device Routing Adversarial Tests > createMicLoopbackTest handles analyser exception inside tick callback cleanly
AssertionError: expected [Function] to not throw an error but 'Error: Hardware analyser node error' was thrown
- Expected: undefined
+ Received: "Error: Hardware analyser node error"
 ❯ src/test/audioAdversarial.test.js:602:55
```

### 1.2 Exact Code Defects in `src/utils/audio.js`

1. **`stopMediaStream` Track Stopping Failure Propagation (`src/utils/audio.js:514-531`)**:
   ```javascript
   const tracks = typeof stream.getTracks === 'function' ? stream.getTracks() : [];
   tracks.forEach(track => {
     if (track && typeof track.stop === 'function') {
       track.stop(); // If this throws, execution escapes to catch (e)
     }
     if (track) {
       track.enabled = false; // Never reached for this track!
     }
   });
   // Subsequent tracks in `tracks` are NEVER stopped or disabled!
   ```

2. **`stopMediaStream` Node Disconnection Cascade Abort (`src/utils/audio.js:538-552`)**:
   ```javascript
   if (nodes) {
     try {
       if (typeof nodes.cleanup === 'function') {
         nodes.cleanup(); // If this throws, execution escapes to catch (e)
       }
       const nodeList = Array.isArray(nodes) ? nodes : Object.values(nodes);
       nodeList.forEach(node => { // NEVER executed if nodes.cleanup() throws!
         if (node && typeof node.disconnect === 'function') {
           try { node.disconnect(); } catch (e) {}
         }
       });
     } catch (e) {
       console.warn('Error disconnecting audio nodes:', e);
     }
   }
   ```

3. **`getAudioContext()` Unhandled `new AudioCtxClass()` Exception (`src/utils/audio.js:15`)**:
   ```javascript
   if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
     const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
     if (!AudioCtxClass) return null;
     globalAudioCtx = new AudioCtxClass(); // If QuotaExceededError or hardware busy, throws unhandled!
   }
   ```

4. **`createDenoisePipeline` Option Parsing Allows `NaN` to Pollute AudioParams (`src/utils/audio.js:133-136`)**:
   ```javascript
   const gateFloor = typeof options.gateFloor === 'number' ? options.gateFloor : 0.02;
   // Because typeof NaN === 'number', if options.gateFloor = NaN, gateFloor is NaN.
   // This leads to noiseGateGain.gain.setTargetAtTime(NaN, ...) which corrupts DSP state.
   ```

5. **`evaluateNoiseGate` Unhandled DSP / Tick Exception (`src/utils/audio.js:145-221`)**:
   - `gateIntervalId = setInterval(evaluateNoiseGate, 16);` has no `try / catch` inside `evaluateNoiseGate`.
   - Any throw from `analyser.getFloatTimeDomainData` or `gain.setTargetAtTime` escapes directly into the timer loop, unhandled.

6. **`createMicLoopbackTest` Unhandled Interval Exception (`src/utils/audio.js:453-463`)**:
   - `setInterval(..., 50)` calls `analyser.getByteFrequencyData(dataArray)` and `onLevel?.(normalized)` without a `try / catch` wrapper.
   - Any exception thrown by UI renderers in `onLevel` causes the 50ms interval to throw into the browser event loop repeatedly without terminating.

---

## 2. Logic Chain

```
[Requirement: Zero AudioContext leaks, clean track stopping, and production-ready Web Audio pipeline (ORIGINAL_REQUEST §R3 & PROJECT.md)]
                                │
                                ▼
[Empirical Finding 1: In stopMediaStream, if a single audio track throws during track.stop(), all remaining tracks in the stream are skipped, and track.enabled is never set to false. This results in hardware mic recording indicator remaining ON]
                                │
                                ▼
[Empirical Finding 2: In stopMediaStream, if nodes.cleanup() throws, all node disconnections are skipped, leaking Web Audio node graphs]
                                │
                                ▼
[Empirical Finding 3: In getAudioContext, new AudioCtxClass() is unguarded; throws QuotaExceededError instead of gracefully returning null]
                                │
                                ▼
[Empirical Finding 4: In createDenoisePipeline, options.gateFloor and options.gateThreshold allow NaN to propagate into AudioParam scheduling]
                                │
                                ▼
[Empirical Finding 5 & 6: In evaluateNoiseGate and createMicLoopbackTest, setInterval tick callbacks lack try-catch boundaries, emitting unhandled errors into event loop on hardware disconnect or subscriber errors]
                                │
                                ▼
[Conclusion: The pipeline topology and core DSP parameters are mathematically sound, but error-isolation and teardown resilience require remediation to satisfy zero-leak and fault-tolerance criteria]
```

---

## 3. Caveats

- The 6 filter stages themselves (80Hz Highpass $Q=0.7071$, 2.8kHz Peaking $+3\text{dB}$ $Q=1.2$, 4.2kHz Lowpass $Q=0.7071$, $-46\text{ dBFS}$ downward gate, $-18\text{ dB}$ compressor $4:1$, and $1.2\times$ makeup gain) are correctly instantiated and topologically connected in the normal path.
- The standard unit test suite (`src/test/audio.test.js`) passes 29/29 tests when no hardware exceptions occur. The failures occur under adversarial stress conditions (fault injection, hardware exceptions, corrupt options, throwing subscriber callbacks).

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Worker M1 must apply the following 6 targeted fixes in `src/utils/audio.js`:

1. **Isolate Each Track in `stopMediaStream`**:
   Wrap each individual track's `stop()` and `enabled = false` in a dedicated per-track `try-catch` block so that one throwing track cannot block the disposal of other tracks:
   ```javascript
   tracks.forEach(track => {
     if (track) {
       try { if (typeof track.stop === 'function') track.stop(); } catch (e) {}
       try { track.enabled = false; } catch (e) {}
     }
   });
   ```

2. **Isolate `nodes.cleanup()` from `node.disconnect()` in `stopMediaStream`**:
   Execute `nodes.cleanup()` in a separate `try-catch` before disconnecting nodes, and disconnect each node independently.

3. **Guard `new AudioCtxClass()` in `getAudioContext()`**:
   Wrap `new AudioCtxClass()` in `try { ... } catch (e) { return null; }`.

4. **Validate `gateFloor` and `gateThreshold` with `Number.isFinite`**:
   ```javascript
   let gateThreshold = (typeof options.gateThreshold === 'number' && Number.isFinite(options.gateThreshold))
     ? options.gateThreshold
     : ((typeof options.noiseGateThreshold === 'number' && Number.isFinite(options.noiseGateThreshold))
         ? options.noiseGateThreshold
         : -46);
   const gateFloor = (typeof options.gateFloor === 'number' && Number.isFinite(options.gateFloor))
     ? options.gateFloor
     : 0.02;
   ```

5. **Wrap `evaluateNoiseGate` in `try-catch`**:
   Enclose the body of `evaluateNoiseGate` in `try { ... } catch (e) {}` so DSP ticks never throw uncaught errors.

6. **Wrap `createMicLoopbackTest` 50ms interval in `try-catch`**:
   Enclose the timer callback in `try { ... } catch (e) {}`.

---

## 5. Verification Method

To verify the fixes independently:

1. Run the adversarial stress test suite:
   ```bash
   npx vitest run src/test/audioAdversarial.test.js
   ```
   *Expected Output*: 34 passed (100%).

2. Run the unit test suite:
   ```bash
   npx vitest run src/test/audio.test.js
   ```
   *Expected Output*: 29 passed (100%).

3. Run the full Vitest suite:
   ```bash
   npx vitest run
   ```
   *Expected Output*: All test files pass with 0 failures.

4. Run the production build:
   ```bash
   npm run build
   ```
   *Expected Output*: Vite build completes with exit code 0.
