# Milestone 2 Review Report: Extreme Low-Bandwidth & High-Loss Audio Transport (R1)

**Reviewer**: Reviewer 1 (`reviewer_m2_1`)  
**Target Scope**: Milestone 2 (`src/constants/config.js`, `src/utils/webrtc.js`, `src/test/webrtc.test.js`, `src/test/setup.js`)  
**Verdict**: **APPROVE**  
**Date**: 2026-08-23  

---

## 1. Observation

### 1.1 Direct Code Inspection
1. **`src/constants/config.js`**:
   - `OPUS_CONFIG` contains full, robust constants for low-bandwidth operation:
     - `MAX_AVERAGE_BITRATE: '12000'`, `MIN_AVERAGE_BITRATE: '6000'`, `HIGH_AVERAGE_BITRATE: '20000'`
     - `USE_DTX: '1'`, `USE_INBAND_FEC: '1'`, `PACKET_LOSS_PERC: '20'`
     - `STEREO: '0'`, `CBR: '0'`
     - `MAX_PLAYBACK_RATE: '16000'`, `SPROP_MAX_CAPTURE_RATE: '16000'`
     - `BANDWIDTH_CAP_KBPS: 16`, `PTIME: '60'`, `MAX_PTIME: '120'`
     - `RED_PAYLOAD_TYPE: 63`, `ENABLE_RED: true`
   - `BITRATE_ADAPTATION` constants define thresholds for dynamic adaptation.

2. **`src/utils/webrtc.js`**:
   - `transformOpusSdp(sdp, options)`:
     - Parses SDP into sections by `m=` lines.
     - Locates Opus dynamic payload type and existing RED payload type if present.
     - Formats `m=audio` format list to prioritize RED (payload type 63 or custom) immediately preceding Opus.
     - Inserts `b=AS:<bandwidthCap>`, `a=ptime:<ptime>`, and `a=maxptime:<maxptime>` strictly before `a=rtpmap` and `a=fmtp` lines, adhering to RFC 4566 line ordering.
     - Dynamically injects `a=rtpmap:<redPt> red/48000/2` and `a=fmtp:<redPt> <opusPt>/<opusPt>`.
     - Injects and mutates Opus parameters (`maxaveragebitrate`, `useinbandfec`, `usedtx`, `packetlossperc`, `cbr`, `stereo`, `sprop-stereo`, `maxplaybackrate`, `sprop-maxcapturerate`).
     - Detects and preserves line delimiters (`\r\n` CRLF vs `\n` LF).
     - Handles non-string/falsy SDP, non-audio sections, non-Opus codecs, and SDPs without existing `a=fmtp`.
   - `configureAudioTransceiver(transceiver)`:
     - Queries `RTCRtpReceiver.getCapabilities('audio')`.
     - Reorders codecs into `[redCodec, opusCodec, ...others]`.
     - Gracefully falls back to `[opusCodec, ...others]` if `audio/red` is not available.
     - Handles case-insensitive MIME matching (`audio/opus`, `AUDIO/OPUS`, `audio/red`).
     - Returns `false` cleanly on missing transceiver, unsupported platform APIs, or thrown exceptions.
   - `applySenderBitrate(sender, bitrateBps, priority)`:
     - Validates and clamps `bitrateBps` to range `[6000, 32000]`.
     - Updates `encodings[0].maxBitrate`, `priority = 'high'`, and `networkPriority = 'high'` (DSCP marking).
     - Calls `await sender.setParameters(params)` while preserving secondary encoding attributes.
     - Returns `true` on success and `false` on any exception or invalid state.

3. **`src/test/setup.js`**:
   - Implements WebRTC mock for `window.RTCRtpReceiver.getCapabilities('audio')` returning `audio/opus`, `audio/red`, `audio/telephone-event`, and `audio/PCMU`.

4. **`src/test/webrtc.test.js`**:
   - Comprehensive suite with 48 unit tests covering:
     - `generatePeerId` (5 tests)
     - `sanitizePeerId` (2 tests)
     - `transformOpusSdp` core & default parameters (3 tests)
     - `transformOpusSdp` dynamic options & bitrate tuning (4 tests)
     - `transformOpusSdp` RFC 2198 RED injection mechanics (4 tests)
     - `transformOpusSdp` formatting, line delimiters & edge cases (8 tests)
     - `configureAudioTransceiver` codec preference ordering (7 tests)
     - `applySenderBitrate` sender encoding parameters & priority marking (7 tests)
     - `getQualityRating` (4 tests)
     - `ICE_SERVERS` (1 test)
     - `generateSafetyCode & Security Invariants` (3 tests)

### 1.2 Verification Commands and Tool Outputs
- `npx vitest run src/test/webrtc.test.js`:
  ```
  ✓ src/test/webrtc.test.js (48)
  Test Files  1 passed (1)
       Tests  48 passed (48)
    Duration  1.07s
  ```
- `npm run build`:
  ```
  ✓ 1504 modules transformed.
  dist/index.html                   1.36 kB │ gzip:  0.66 kB
  dist/assets/index-CK17MFa_.css   18.72 kB │ gzip:  4.28 kB
  dist/assets/index-DRumxzA1.js   303.45 kB │ gzip: 91.45 kB
  ✓ built in 1.11s
  ```

### 1.3 Integrity Verification
- Checked for hardcoded test results, facade implementations, shortcut bypasses, or fake mocks: **None found**.
- Genuine SDP line-level parser and serializer with rigorous delimiter and section handling.
- Real capability discovery and parameter application for WebRTC transceivers and senders.

---

## 2. Logic Chain

1. **Protocol & RFC Compliance**:
   - **RFC 4566 (SDP)**: Mandates that bandwidth `b=` lines precede attribute `a=` lines. `transformOpusSdp` inserts `b=AS` and packetization attributes (`a=ptime`, `a=maxptime`) at the top of the media section attributes before any `a=rtpmap` or `a=fmtp` lines.
   - **RFC 2198 (RED)**: Dictates redundancy encapsulation for audio payloads. Injecting `a=rtpmap:63 red/48000/2` and `a=fmtp:63 <opusPt>/<opusPt>` alongside prepending PT 63 in `m=audio` ensures standard WebRTC endpoints negotiate redundant audio encapsulation.
   - **RFC 7587 (Opus in SDP)**: Configures `maxaveragebitrate` down to 6000 bps, `maxplaybackrate=16000` (or 8000 in survival mode), `useinbandfec=1`, `usedtx=1`, `stereo=0`, and `packetlossperc=10..50`. This concentrates all available bit-rate budget on speech intelligibility and enables the decoder to reconstruct packets during burst packet loss.
2. **WebRTC Standard Codec Preference API**:
   - Browser W3C `RTCRtpTransceiver.setCodecPreferences` requires passing an array composed of elements from `RTCRtpReceiver.getCapabilities('audio').codecs`. `configureAudioTransceiver` faithfully selects and reorders these capability objects without mutating or inventing non-standard objects, prioritizing `audio/red` first and `audio/opus` second.
3. **Sender Encoding Clamping & Priority**:
   - `applySenderBitrate` enforces a safe operating floor of 6000 bps and ceiling of 32000 bps, while tagging packets with `priority: 'high'` and `networkPriority: 'high'` for DSCP Expedited Forwarding.
4. **Delimiters and Security Invariants**:
   - Preserves `\r\n` CRLF without corruption.
   - Preserves DTLS fingerprints in session-level and media-level blocks, ensuring `generateSafetyCode` produces identical 5-digit verification codes before and after SDP transformation.

---

## 3. Caveats

1. **OS-Level DSCP Remarking**:
   - `networkPriority: 'high'` signals the browser to set DSCP marks (e.g. Expedited Forwarding 46 / CS6). On certain unprivileged operating systems (e.g. desktop Linux or unrooted Android), the OS kernel may drop or ignore DSCP IP header remarking. The implementation handles this gracefully through standard WebRTC sender parameters without errors.
2. **Milestone 1 Test Suite Notice**:
   - Running full vitest across the entire repo highlighted 2 failing tests in `src/test/audioAdversarialDeep.test.js` relating to Milestone 1 audio pre-processing pipeline noise gate / stream boundary checks. These are strictly within Milestone 1 scope and do not affect or interact with Milestone 2 WebRTC transport utilities.

---

## 4. Conclusion

- **Verdict**: **APPROVE**
- Milestone 2 (Extreme Low-Bandwidth & High-Loss Audio Transport - R1) meets all functional, RFC compliance, and resilience requirements.
- Code quality, error resilience, and edge case coverage are high.
- All 48 unit tests in `src/test/webrtc.test.js` pass cleanly and `npm run build` succeeds with zero errors.

---

## 5. Verification Method

To independently verify this assessment:

1. **Run WebRTC Unit Tests**:
   ```bash
   npx vitest run src/test/webrtc.test.js
   ```
   *Expected*: 48 passed (0 failed).

2. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Expected*: Build completes successfully.

3. **Check RFC 4566 Line Ordering**:
   Verify in tests and output that `b=AS:` and `a=ptime:` lines appear before `a=rtpmap:` and `a=fmtp:` lines in audio media sections.
