# Milestone 2 Adversarial Challenge Report: Extreme Low-Bandwidth & High-Loss Audio Transport (R1)

**Agent**: Challenger M2 (1) (`challenger_m2_1`)  
**Verdict**: `REQUEST_CHANGES`  
**Target Scope**: `src/utils/webrtc.js`, `src/test/webrtc.adversarial.test.js`  
**Interface Contract**: `PROJECT.md` §WebRTC Transport & Codec Layer (R1)  
**Date**: 2026-08-23  

---

## 1. Observation

Adversarial stress testing of `src/utils/webrtc.js` was performed using a dedicated test suite with 26 test cases in `src/test/webrtc.adversarial.test.js`.

Execution Command:
```bash
npx vitest run src/test/webrtc.adversarial.test.js
```

### 1.1 Confirmed Failures / Vulnerabilities

#### Failure 1: Uncaught `TypeError` in `transformOpusSdp` when `options === null`
- **Location**: `src/utils/webrtc.js:81, 85`
- **Verbatim Error**:
  ```
  TypeError: Cannot read properties of null (reading 'bitrate')
    ❯ transformOpusSdp src/utils/webrtc.js:85:33
    ❯ src/test/webrtc.adversarial.test.js:27:18
  ```
- **Code Snippet**:
  ```javascript
  // src/utils/webrtc.js:81
  export function transformOpusSdp(sdp, options = {}) {
    if (!sdp || typeof sdp !== 'string') return sdp;

    // Line 85: If options is explicitly null, default param `options = {}` is bypassed
    const targetBitrate = String(options.bitrate ?? options.maxaveragebitrate ?? OPUS_CONFIG.MAX_AVERAGE_BITRATE ?? '12000');
  ```
- **Reproduction**: Calling `transformOpusSdp(validSdp, null)` throws an uncaught `TypeError`.

#### Failure 2: Uncaught `TypeError` in `generateSafetyCode` on Non-String SDP Parameters
- **Location**: `src/utils/webrtc.js:379-383`
- **Verbatim Error**:
  ```
  TypeError: sdp.match is not a function
    ❯ extractFingerprint src/utils/webrtc.js:382:23
    ❯ Module.generateSafetyCode src/utils/webrtc.js:386:14
    ❯ src/test/webrtc.adversarial.test.js:521:20
  ```
- **Code Snippet**:
  ```javascript
  // src/utils/webrtc.js:379
  export async function generateSafetyCode(localSdp, remoteSdp) {
    if (!localSdp || !remoteSdp) return null;
    
    const extractFingerprint = (sdp) => {
      const match = sdp.match(/a=fingerprint:sha-256\s+([A-F0-9:]+)/i);
      return match ? match[1] : '';
    };
  ```
- **Reproduction**: Calling `generateSafetyCode({ sdp: "..." }, validSdp)` or `generateSafetyCode(12345, validSdp)` throws an uncaught `TypeError` instead of returning `null`.

### 1.2 Confirmed Robust Capabilities
- `configureAudioTransceiver`: Passed all 5 adversarial tests, gracefully handling null receivers, missing capability arrays, corrupted codec objects, and synchronous `setCodecPreferences` errors.
- `applySenderBitrate`: Passed all 6 adversarial tests, correctly clamping bitrates below 6000 bps up to 6000 bps, clamping above 32000 bps down to 32000 bps, handling NaN inputs, catching promise rejections, and surviving rapid concurrent invocations.
- RFC 4566 Line Ordering: Verified that `b=AS` and `a=ptime` strictly precede `a=rtpmap` and `a=fmtp`.
- SDP Performance: 5,000-line candidate SDP munging executed in <200ms without regex catastrophe.

---

## 2. Logic Chain

1. Requirement 3 states: *"Verify that `transformOpusSdp`, `configureAudioTransceiver`, and `applySenderBitrate` handle all adversarial inputs gracefully without throwing uncaught exceptions."*
2. In JavaScript, default parameter values (`options = {}`) only evaluate when the passed argument is `undefined`. When a caller explicitly passes `null` (e.g. from an uninitialized settings object or cleared state), `options` remains `null`.
3. Accessing `options.bitrate` on line 85 without a null-coalescing object fallback (`options || {}` or `const opts = options || {}`) throws `TypeError: Cannot read properties of null (reading 'bitrate')`, crashing the caller during WebRTC negotiation.
4. In `generateSafetyCode`, passing a truthy non-string object (such as an `RTCSessionDescription` instance or malformed signaling payload) bypasses `if (!localSdp || !remoteSdp)` and invokes `sdp.match()`, throwing `TypeError: sdp.match is not a function`.
5. Therefore, both functions violate the contract of handling all adversarial/invalid inputs without throwing uncaught exceptions.

---

## 3. Caveats

- In well-behaved, happy-path calling patterns where `options` is an object or omitted (`undefined`), and string SDPs are provided, `transformOpusSdp` and `generateSafetyCode` function as expected.
- However, defensive programming in real-time WebRTC audio pipelines requires full immunity to unexpected runtime parameter types.

---

## 4. Conclusion

**Verdict**: `REQUEST_CHANGES`

Worker M2 must apply the following minor defensive fixes:

1. In `src/utils/webrtc.js` (`transformOpusSdp`):
   ```javascript
   export function transformOpusSdp(sdp, options = {}) {
     if (!sdp || typeof sdp !== 'string') return sdp;
     const opts = (options && typeof options === 'object') ? options : {};
     const targetBitrate = String(opts.bitrate ?? opts.maxaveragebitrate ?? OPUS_CONFIG.MAX_AVERAGE_BITRATE ?? '12000');
     // ... use opts instead of options throughout
   ```
2. In `src/utils/webrtc.js` (`generateSafetyCode`):
   ```javascript
   export async function generateSafetyCode(localSdp, remoteSdp) {
     if (!localSdp || !remoteSdp || typeof localSdp !== 'string' || typeof remoteSdp !== 'string') return null;
   ```

---

## 5. Verification Method

1. Run the empirical adversarial test suite:
   ```bash
   npx vitest run src/test/webrtc.adversarial.test.js
   ```
   *Expected once fixed*: All 26 tests pass with 0 failures.

2. Run the main WebRTC test suite:
   ```bash
   npx vitest run src/test/webrtc.test.js
   ```
   *Expected*: All 48 tests pass with 0 failures.

3. Run production build:
   ```bash
   npm run build
   ```
   *Expected*: Clean build with 0 warnings/errors.
