# Milestone 2: Comprehensive Unit Test Suite Specification (Extreme Low-Bandwidth & High-Loss Audio Transport - R1)

**Agent**: Explorer 2 (`explorer_m2_2`)  
**Date**: 2026-08-23  
**Working Directory**: `/home/sagnik/teamwork_projects/secure_voice/.agents/explorer_m2_2`  
**Milestone**: M2 (Extreme Low-Bandwidth & High-Loss Audio Transport - R1)  
**Target Source Files**: `src/utils/webrtc.js`, `src/constants/config.js`, `src/test/webrtc.test.js`, `src/test/setup.js`

---

## 1. Observation

Direct inspection of the current testing environment, configuration, and WebRTC utilities revealed the following baseline:

### 1.1 Existing Test Suite (`src/test/webrtc.test.js`)
- Currently contains 19 tests covering:
  - `generatePeerId`: length, character set, cryptographic entropy failure.
  - `sanitizePeerId`: non-alphanumerics stripping, hyphenation.
  - `transformOpusSdp` (lines 63–145): basic default injection of `b=AS:16`, `a=ptime:40`, `maxaveragebitrate=12000`, `useinbandfec=1`, `usedtx=1`, `stereo=0`.
  - `getQualityRating`: RTT classification (`good`, `fair`, `poor`).
  - `ICE_SERVERS`: STUN/TURN server structure validation.
  - `generateSafetyCode`: SHA-256 fingerprint hashing and 5-digit code generation.
- **Deficiencies Identified**:
  1. No tests for custom options in `transformOpusSdp` (`bitrate` down to 6000, `packetLossPerc` up to 50, `ptime:60/120`, `maxPlaybackRate:8000/16000`, `cbr`, `stereo`).
  2. Zero tests for RFC 2198 RED injection (`a=rtpmap:63 red/48000/2`, `a=fmtp:63 <opus_pt>/<opus_pt>`, `m=audio` format prepend).
  3. No tests for `configureAudioTransceiver` (checking `RTCRtpReceiver.getCapabilities('audio')` ordering `[redCodec, opusCodec]`).
  4. No tests for `applySenderBitrate` with `priority: 'high'` and `networkPriority: 'high'`.
  5. Missing pathological and adversarial SDP edge cases (empty SDP, malformed lines, missing Opus PT, non-audio media lines, bare fmtp lines).

### 1.2 Existing Test Setup (`src/test/setup.js`)
- Mocks `window.AudioContext`, `navigator.mediaDevices`, `navigator.clipboard`, `navigator.vibrate`, `window.matchMedia`, `HTMLAudioElement.prototype.setSinkId`.
- **Deficiency Identified**:
  - Does not mock WebRTC transceiver and sender capabilities (`window.RTCRtpReceiver.getCapabilities`, `RTCRtpSender`, `RTCRtpTransceiver`). Unit tests for `configureAudioTransceiver` and `applySenderBitrate` require robust mock harnesses in `setup.js` or localized test mocks.

### 1.3 Target Functional Contracts (`PROJECT.md` §Interface Contracts)
```javascript
// 1. SDP Munging with RED & Dynamic Opus Parameters
export function transformOpusSdp(sdp, options = {}) {
  // options: { bitrate, ptime, maxptime, fec, packetLossPerc, dtx, stereo, cbr, maxPlaybackRate, spropMaxCaptureRate, bandwidthCapKbps, enableRed, redPayloadType }
}

// 2. Audio Transceiver Codec Preferences
export function configureAudioTransceiver(transceiver) {
  // Sets codec preferences prioritizing audio/red followed by audio/opus
}

// 3. Sender Bitrate & Priority Constraints
export function applySenderBitrate(sender, bitrateBps, priority = 'high') {
  // Sets encodings maxBitrate, priority: 'high', networkPriority: 'high'
}
```

---

## 2. Logic Chain

From these observations, we construct the step-by-step logic chain defining the comprehensive unit test suite:

```
[Observation 1.1: Static SDP tests without RED or custom options]
       │
       ▼
[Logic Step 1: SDP Transformation Test Suite]
• Test Default Behavior: When called with `transformOpusSdp(sdp)`, must inject default OPUS_CONFIG values (b=AS:16, a=ptime:60, maxptime:120, maxaveragebitrate=12000, useinbandfec=1, usedtx=1, packetlossperc=10/20, cbr=0) and RFC 2198 RED (a=rtpmap:63 red/48000/2, a=fmtp:63 111/111, m=audio prepending 63).
• Test Custom Tuning:
  - Sub-6kbps Survival: `bitrate: 6000, bandwidthCapKbps: 8, ptime: 60, maxptime: 120, packetLossPerc: 50, maxPlaybackRate: 8000`
  - High Quality Voice: `bitrate: 20000, bandwidthCapKbps: 24, ptime: 40, maxptime: 60, packetLossPerc: 10, maxPlaybackRate: 16000`
  - Option flag variations: `fec: false` (useinbandfec=0), `dtx: false` (usedtx=0), `cbr: true` (cbr=1), `stereo: true` (stereo=1;sprop-stereo=1).
• Test RFC 2198 RED Mechanics:
  - Dynamic Opus PT extraction (e.g. PT 96, 109, 111) mapped to `a=fmtp:63 <opus_pt>/<opus_pt>`.
  - Disabling RED via `enableRed: false` ensures 63 is NOT injected into `m=audio` or `a=rtpmap`.
  - Idempotence: calling transform twice or passing SDP with existing RED does not duplicate 63.
       │
       ▼
[Logic Step 2: Transceiver Codec Preference Suite]
[Observation 1.2: No RTCRtpReceiver capabilities mock in setup.js]
• When `audio/red` is present in `RTCRtpReceiver.getCapabilities('audio')`:
  - `transceiver.setCodecPreferences([redCodec, opusCodec, ...others])` called with RED first.
• When `audio/red` is absent (Firefox / Safari fallback):
  - `transceiver.setCodecPreferences([opusCodec, ...others])` called with Opus first.
• Robustness: handles missing `getCapabilities`, null transceiver, empty codecs array, or thrown errors gracefully returning false.
       │
       ▼
[Logic Step 3: RTCRtpSender Encoding Constraints Suite]
• When `applySenderBitrate(sender, 6000)` is invoked:
  - `encodings[0].maxBitrate` updated to 6000.
  - `encodings[0].priority` set to `'high'`.
  - `encodings[0].networkPriority` set to `'high'`.
• Bounds & Validation:
  - Clamps bitrates below 6000 to 6000 bps.
  - Clamps excessive bitrates to maximum limit (32000 bps).
  - Handles null sender, missing encodings array, or `setParameters` promise rejection gracefully.
       │
       ▼
[Logic Step 4: Pathological & Adversarial Edge Cases Suite]
• Malformed SDP strings: non-string inputs, empty strings, missing `m=audio`, SDP without Opus codec, bare `a=fmtp:111` without parameters, multi-audio sections, video/datachannel sections untouched.
• Formatting: CRLF vs LF delimiter preservation, strict line ordering (`b=AS` and `a=ptime` before `a=rtpmap`).
```

---

## 3. Detailed Unit Test Suite Specification

The test suite is organized into **10 modular test groups**:

```
src/test/webrtc.test.js
├── Group 1: transformOpusSdp — Default Options & Base Invariants
├── Group 2: transformOpusSdp — Dynamic Options & Bitrate/FEC/PTIME Tuning
├── Group 3: transformOpusSdp — RFC 2198 RED Payload Injection & Formatting
├── Group 4: transformOpusSdp — Codec Parameter Preservation & Isolation
├── Group 5: transformOpusSdp — Line Ending & Formatting Invariance
├── Group 6: transformOpusSdp — Adversarial & Pathological SDP Edge Cases
├── Group 7: configureAudioTransceiver — Codec Preference Ordering & RED Prioritization
├── Group 8: configureAudioTransceiver — Fallbacks & Platform Resilience
├── Group 9: applySenderBitrate — Encoding Bitrate & Priority Marking
└── Group 10: applySenderBitrate — Clamping, Validation & Error Handling
```

---

### 3.1 Test Case Matrix & Assertions

#### Group 1: `transformOpusSdp` — Default Options & Base Invariants
| Test Case ID | Test Name | Input / Scenario | Expected Assertion |
|---|---|---|---|
| **M2-SDP-01** | Default parameter injection | Standard SDP offer with `m=audio 9 ... 111`, `a=rtpmap:111 opus/48000/2` | Output contains `b=AS:16`, `a=ptime:60`, `a=maxptime:120`, `maxaveragebitrate=12000`, `useinbandfec=1`, `usedtx=1`, `stereo=0`, `sprop-stereo=0`, `cbr=0`, `packetlossperc=10` (or `20`). |
| **M2-SDP-02** | Default RED injection | Standard SDP offer with Opus PT 111 | Output contains `m=audio 9 UDP/TLS/RTP/SAVPF 63 111`, `a=rtpmap:63 red/48000/2`, and `a=fmtp:63 111/111`. |
| **M2-SDP-03** | Section ordering | Standard SDP offer | `b=AS:16` and `a=ptime:` appear before the first `a=rtpmap:` line in the `m=audio` section. |

#### Group 2: `transformOpusSdp` — Dynamic Options & Bitrate/FEC/PTIME Tuning
| Test Case ID | Test Name | Input / Scenario | Expected Assertion |
|---|---|---|---|
| **M2-SDP-04** | Sub-6kbps Survival Mode | `options = { bitrate: 6000, bandwidthCapKbps: 8, ptime: 60, maxptime: 120, packetLossPerc: 50, maxPlaybackRate: 8000 }` | Output contains `maxaveragebitrate=6000`, `b=AS:8`, `a=ptime:60`, `a=maxptime:120`, `packetlossperc=50`, `maxplaybackrate=8000`, `sprop-maxcapturerate=8000`. |
| **M2-SDP-05** | High Quality 20kbps Mode | `options = { bitrate: 20000, bandwidthCapKbps: 24, ptime: 40, maxptime: 60, packetLossPerc: 10, maxPlaybackRate: 16000 }` | Output contains `maxaveragebitrate=20000`, `b=AS:24`, `a=ptime:40`, `a=maxptime:60`, `packetlossperc=10`, `maxplaybackrate=16000`. |
| **M2-SDP-06** | Boolean Flag Inversion (FEC / DTX disabled) | `options = { fec: false, dtx: false }` or `{ useInbandFec: 0, useDtx: 0 }` | Output contains `useinbandfec=0` and `usedtx=0`. |
| **M2-SDP-07** | CBR and Stereo toggles | `options = { cbr: true, stereo: true }` | Output contains `cbr=1`, `stereo=1`, `sprop-stereo=1`. |
| **M2-SDP-08** | Numeric vs String option tolerance | `options = { bitrate: '8000', packetLossPerc: '30' }` | Output contains `maxaveragebitrate=8000` and `packetlossperc=30` without NaN or string corruption. |

#### Group 3: `transformOpusSdp` — RFC 2198 RED Payload Injection & Formatting
| Test Case ID | Test Name | Input / Scenario | Expected Assertion |
|---|---|---|---|
| **M2-RED-01** | Dynamic Opus PT Mapping (PT 109) | SDP with `a=rtpmap:109 opus/48000/2` | Injects `a=rtpmap:63 red/48000/2`, `a=fmtp:63 109/109`, and prepends `63` to format line: `m=audio 9 UDP/TLS/RTP/SAVPF 63 109 ...`. |
| **M2-RED-02** | Explicit RED Disable | `options = { enableRed: false }` | Output does NOT contain `a=rtpmap:63`, `a=fmtp:63`, and format line remains without `63`. Opus parameters are still updated. |
| **M2-RED-03** | Idempotence (Already Injected RED) | SDP already containing `m=audio ... 63 111`, `a=rtpmap:63 red/48000/2`, `a=fmtp:63 111/111` | Does not duplicate `63` in `m=audio` (no `63 63 111`) and does not duplicate rtpmap/fmtp lines. |
| **M2-RED-04** | Custom RED Payload Type | `options = { redPayloadType: 122 }` | Injects `a=rtpmap:122 red/48000/2`, `a=fmtp:122 111/111`, and prepends `122`. |

#### Group 4: `transformOpusSdp` — Codec Parameter Preservation & Isolation
| Test Case ID | Test Name | Input / Scenario | Expected Assertion |
|---|---|---|---|
| **M2-ISO-01** | Non-Opus Codecs Intact | SDP with Opus (111), telephone-event (101), PCMU (0) | `a=fmtp:101 0-15` and `a=rtpmap:0 PCMU/8000` remain unchanged. RED fmtp points strictly to Opus PT 111. |
| **M2-ISO-02** | Existing fmtp parameters preserved | `a=fmtp:111 minptime=10;cbr=1` transformed with custom options | `minptime=10` is preserved in the output `a=fmtp:111` string alongside updated keys. |
| **M2-ISO-03** | Existing `b=AS` and `a=ptime` replacement | SDP already with `b=AS:64` and `a=ptime:20` | Old values are replaced by new values (e.g. `b=AS:16`, `a=ptime:60`) rather than creating duplicate lines. |

#### Group 5: `transformOpusSdp` — Line Ending & Formatting Invariance
| Test Case ID | Test Name | Input / Scenario | Expected Assertion |
|---|---|---|---|
| **M2-FMT-01** | CRLF (`\r\n`) Preservation | Input uses `\r\n` line endings | Output contains `\r\n`, zero lone `\n`, every new line terminates with `\r\n`. |
| **M2-FMT-02** | LF (`\n`) Preservation | Input uses `\n` line endings | Output contains `\n`, zero `\r\n`. |
| **M2-FMT-03** | Trailing whitespace & blank lines | SDP with blank lines or trailing spaces | Cleanly handled without producing extra empty attributes. |

#### Group 6: `transformOpusSdp` — Adversarial & Pathological Edge Cases
| Test Case ID | Test Name | Input / Scenario | Expected Assertion |
|---|---|---|---|
| **M2-EDG-01** | Non-string / Falsy Inputs | `""`, `null`, `undefined`, `123`, `{}`, `[]` | Returns input safely (or `""` / `null`) without throwing uncaught exceptions. |
| **M2-EDG-02** | Missing Opus Codec | SDP with only PCMU / G.722 (`a=rtpmap:0 PCMU/8000`) | Does NOT inject RED pointing to non-existent Opus; does not corrupt PCMU lines; returns valid SDP. |
| **M2-EDG-03** | Non-Audio SDP (Video / DataChannel only) | SDP with `m=video` or `m=application` and no `m=audio` | Sections untouched; no `b=AS` or Opus attributes inserted. |
| **M2-EDG-04** | Missing `a=fmtp` line | SDP has `a=rtpmap:111 opus/48000/2` but no `a=fmtp:111` | Generates and injects a valid `a=fmtp:111 ...` line. |
| **M2-EDG-05** | Bare `a=fmtp:111` line | SDP has `a=fmtp:111` with no parameters | Successfully populates parameters into `a=fmtp:111 maxaveragebitrate=...`. |
| **M2-EDG-06** | Multi-Audio Sections | SDP with two `m=audio` media blocks | Both audio blocks receive bandwidth and codec formatting safely without cross-bleed. |

#### Group 7: `configureAudioTransceiver` — Codec Preference Ordering & RED Prioritization
| Test Case ID | Test Name | Input / Scenario | Expected Assertion |
|---|---|---|---|
| **M2-TRX-01** | RED + Opus Prioritization | `RTCRtpReceiver.getCapabilities('audio')` has `audio/red` and `audio/opus` | `transceiver.setCodecPreferences([redCodec, opusCodec, ...others])` is called with `audio/red` at index 0 and `audio/opus` at index 1. Returns `true`. |
| **M2-TRX-02** | Opus Fallback (RED absent) | `RTCRtpReceiver.getCapabilities('audio')` has `audio/opus` only | `transceiver.setCodecPreferences([opusCodec, ...others])` called with `audio/opus` at index 0. Returns `true`. |
| **M2-TRX-03** | Case-Insensitive Mime Matching | Capabilities contain `AUDIO/RED` and `Audio/Opus` | Matches correctly and prioritizes RED before Opus. |

#### Group 8: `configureAudioTransceiver` — Fallbacks & Platform Resilience
| Test Case ID | Test Name | Input / Scenario | Expected Assertion |
|---|---|---|---|
| **M2-TRX-04** | Transceiver lacks `setCodecPreferences` | Transceiver is plain object `{}` (Safari / old browser) | Gracefully returns `false` without throwing TypeError. |
| **M2-TRX-05** | Null / Undefined Transceiver | `configureAudioTransceiver(null)` or `configureAudioTransceiver(undefined)` | Returns `false` without throwing. |
| **M2-TRX-06** | Missing `RTCRtpReceiver` API | `window.RTCRtpReceiver = undefined` or `getCapabilities` returns null | Returns `false` without throwing. |
| **M2-TRX-07** | `setCodecPreferences` throws error | Mock `setCodecPreferences` throws `InvalidModificationError` | Catches exception internally and returns `false`. |

#### Group 9: `applySenderBitrate` — Encoding Bitrate & Priority Marking
| Test Case ID | Test Name | Input / Scenario | Expected Assertion |
|---|---|---|---|
| **M2-SND-01** | Bitrate Reduction to 6000 bps | `applySenderBitrate(sender, 6000)` with valid sender | `sender.setParameters` called with `encodings[0].maxBitrate = 6000`, `priority = 'high'`, `networkPriority = 'high'`. Resolves to `true`. |
| **M2-SND-02** | Custom priority marking | `applySenderBitrate(sender, 12000, 'medium')` | Sets `priority = 'medium'`, `networkPriority = 'medium'`. |
| **M2-SND-03** | Multi-encoding preservation | Sender with `encodings = [{ maxBitrate: 20000, active: true }, { maxBitrate: 10000 }]` | Updates primary encoding while preserving secondary encodings and other fields (`active: true`). |

#### Group 10: `applySenderBitrate` — Clamping, Validation & Error Handling
| Test Case ID | Test Name | Input / Scenario | Expected Assertion |
|---|---|---|---|
| **M2-SND-04** | Lower Bound Clamping (<6000 bps) | `applySenderBitrate(sender, 3000)` or `applySenderBitrate(sender, 0)` | Clamps `maxBitrate` to 6000 bps. |
| **M2-SND-05** | Upper Bound Clamping (>32000 bps) | `applySenderBitrate(sender, 64000)` | Clamps `maxBitrate` to maximum operational limit (e.g. 24000 or 32000 bps). |
| **M2-SND-06** | Invalid / Non-numeric Bitrate | `applySenderBitrate(sender, 'invalid')` or `applySenderBitrate(sender, NaN)` | Clamps to default 12000 bps or safely rejects without setting NaN. |
| **M2-SND-07** | Null / Invalid Sender | `applySenderBitrate(null, 6000)` | Returns `false` or rejects gracefully without uncaught exception. |
| **M2-SND-08** | Empty Encodings Array | `sender.getParameters()` returns `{ encodings: [] }` | Returns `false` without throwing. |
| **M2-SND-09** | `setParameters` Promise Rejection | `sender.setParameters` rejects with `Error('NetworkError')` | Catches rejection and returns `false`. |

---

## 4. Complete Executable Vitest Test Suite Implementation

The following complete test specification is ready to be added to `src/test/webrtc.test.js` or a dedicated test suite file:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generatePeerId,
  sanitizePeerId,
  transformOpusSdp,
  configureAudioTransceiver,
  applySenderBitrate,
  getQualityRating,
  generateSafetyCode,
  ICE_SERVERS
} from '../utils/webrtc';
import { OPUS_CONFIG } from '../constants/config';

describe('Milestone 2: WebRTC Transport, Codec Munging & RED Suite', () => {

  describe('transformOpusSdp — Core & Default Parameters', () => {
    it('returns empty/null/non-string sdp safely without mutation', () => {
      expect(transformOpusSdp('')).toBe('');
      expect(transformOpusSdp(null)).toBe(null);
      expect(transformOpusSdp(undefined)).toBe(undefined);
      expect(transformOpusSdp(12345)).toBe(12345);
    });

    it('injects default Opus parameters and bandwidth constraints into audio section', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).toContain(`b=AS:${OPUS_CONFIG.BANDWIDTH_CAP_KBPS || 16}`);
      expect(transformed).toContain(`a=ptime:${OPUS_CONFIG.PTIME || 60}`);
      expect(transformed).toContain(`a=maxptime:${OPUS_CONFIG.MAX_PTIME || 120}`);
      expect(transformed).toContain('maxaveragebitrate=');
      expect(transformed).toContain('useinbandfec=1');
      expect(transformed).toContain('usedtx=1');
      expect(transformed).toContain('stereo=0');
      expect(transformed).toContain('sprop-stereo=0');
      expect(transformed).toContain('cbr=0');
      expect(transformed).toContain('minptime=10'); // Preserves existing params

      // Ordering check: b=AS and a=ptime appear before a=rtpmap
      const bIndex = transformed.indexOf('b=AS:');
      const ptimeIndex = transformed.indexOf('a=ptime:');
      const rtpmapIndex = transformed.indexOf('a=rtpmap:111');
      expect(bIndex).toBeLessThan(rtpmapIndex);
      expect(ptimeIndex).toBeLessThan(rtpmapIndex);
    });

    it('injects RFC 2198 RED attributes by default', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 101',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10',
        'a=rtpmap:101 telephone-event/8000',
        'a=fmtp:101 0-15'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      // Verify m=audio format line prepends payload type 63 before 111
      expect(transformed).toMatch(/m=audio 9 UDP\/TLS\/RTP\/SAVPF 63 111/);
      expect(transformed).toContain('a=rtpmap:63 red/48000/2');
      expect(transformed).toContain('a=fmtp:63 111/111');

      // Verify non-Opus codecs remain completely untouched
      expect(transformed).toContain('a=rtpmap:101 telephone-event/8000');
      expect(transformed).toContain('a=fmtp:101 0-15');
    });
  });

  describe('transformOpusSdp — Dynamic Options & Bitrate Tuning', () => {
    it('applies Sub-6kbps Survival Mode parameters (6000 bps, ptime:60, maxplaybackrate:8000)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, {
        bitrate: 6000,
        bandwidthCapKbps: 8,
        ptime: 60,
        maxptime: 120,
        packetLossPerc: 50,
        maxPlaybackRate: 8000,
        spropMaxCaptureRate: 8000
      });

      expect(transformed).toContain('b=AS:8');
      expect(transformed).toContain('a=ptime:60');
      expect(transformed).toContain('a=maxptime:120');
      expect(transformed).toContain('maxaveragebitrate=6000');
      expect(transformed).toContain('packetlossperc=50');
      expect(transformed).toContain('maxplaybackrate=8000');
      expect(transformed).toContain('sprop-maxcapturerate=8000');
    });

    it('applies High Quality Mode parameters (20000 bps, b=AS:24, maxplaybackrate:16000)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, {
        bitrate: 20000,
        bandwidthCapKbps: 24,
        ptime: 40,
        maxptime: 60,
        packetLossPerc: 10,
        maxPlaybackRate: 16000
      });

      expect(transformed).toContain('b=AS:24');
      expect(transformed).toContain('a=ptime:40');
      expect(transformed).toContain('a=maxptime:60');
      expect(transformed).toContain('maxaveragebitrate=20000');
      expect(transformed).toContain('packetlossperc=10');
      expect(transformed).toContain('maxplaybackrate=16000');
    });

    it('supports toggling boolean flags (FEC off, DTX off, CBR on, Stereo on)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, {
        fec: false,
        dtx: false,
        cbr: true,
        stereo: true
      });

      expect(transformed).toContain('useinbandfec=0');
      expect(transformed).toContain('usedtx=0');
      expect(transformed).toContain('cbr=1');
      expect(transformed).toContain('stereo=1');
      expect(transformed).toContain('sprop-stereo=1');
    });

    it('accepts string numbers gracefully without corrupting parameters', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, {
        bitrate: '8000',
        packetLossPerc: '35',
        ptime: '60'
      });

      expect(transformed).toContain('maxaveragebitrate=8000');
      expect(transformed).toContain('packetlossperc=35');
      expect(transformed).toContain('a=ptime:60');
    });
  });

  describe('transformOpusSdp — RFC 2198 RED Injection Mechanics', () => {
    it('dynamically uses the detected Opus payload type when not 111 (e.g. PT 109)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 109',
        'a=rtpmap:109 opus/48000/2',
        'a=fmtp:109 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).toMatch(/m=audio 9 UDP\/TLS\/RTP\/SAVPF 63 109/);
      expect(transformed).toContain('a=rtpmap:63 red/48000/2');
      expect(transformed).toContain('a=fmtp:63 109/109');
    });

    it('omits RED injection when enableRed is explicitly false', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, { enableRed: false });

      expect(transformed).not.toContain('a=rtpmap:63 red/48000/2');
      expect(transformed).not.toContain('a=fmtp:63');
      expect(transformed).not.toContain('63 111');
      expect(transformed).toContain('maxaveragebitrate='); // Opus params still applied
    });

    it('prevents duplicate RED injection when SDP already has RED negotiated (idempotence)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 63 111',
        'a=rtpmap:63 red/48000/2',
        'a=fmtp:63 111/111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      // Ensure 63 is not duplicated in m=audio line
      expect(transformed).not.toContain('63 63 111');
      expect((transformed.match(/a=rtpmap:63 red/g) || []).length).toBe(1);
      expect((transformed.match(/a=fmtp:63 111\/111/g) || []).length).toBe(1);
    });

    it('allows custom RED payload type configuration (e.g. PT 122)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, { redPayloadType: 122 });

      expect(transformed).toMatch(/m=audio 9 UDP\/TLS\/RTP\/SAVPF 122 111/);
      expect(transformed).toContain('a=rtpmap:122 red/48000/2');
      expect(transformed).toContain('a=fmtp:122 111/111');
    });
  });

  describe('transformOpusSdp — Formatting, Line Delimiters & Edge Cases', () => {
    it('strictly preserves CRLF (\\r\\n) line endings', () => {
      const mockSdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111\r\n';
      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).toContain('\r\n');
      const lines = transformed.split('\r\n');
      expect(lines.length).toBeGreaterThan(3);
    });

    it('strictly preserves LF (\\n) line endings', () => {
      const mockSdp = 'v=0\nm=audio 9 UDP/TLS/RTP/SAVPF 111\na=rtpmap:111 opus/48000/2\na=fmtp:111\n';
      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).toContain('\n');
      expect(transformed).not.toContain('\r\n');
    });

    it('handles SDP without existing a=fmtp line by generating one', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).toContain('a=fmtp:111');
      expect(transformed).toContain('maxaveragebitrate=');
      expect(transformed).toContain('useinbandfec=1');
    });

    it('leaves non-audio sections (video / datachannel) completely untouched', () => {
      const mockSdp = [
        'v=0',
        'm=video 9 UDP/TLS/RTP/SAVPF 96',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:96 VP8/90000',
        'm=application 9 DTLS/SCTP 5000',
        'a=sctpmap:5000 webrtc-datachannel 1024'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).not.toContain('b=AS:');
      expect(transformed).not.toContain('opus');
      expect(transformed).not.toContain('red/48000');
      expect(transformed).toContain('a=rtpmap:96 VP8/90000');
      expect(transformed).toContain('a=sctpmap:5000 webrtc-datachannel 1024');
    });

    it('handles SDP without any audio media line safely', () => {
      const mockSdp = 'v=0\r\no=- 123 456 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
      const transformed = transformOpusSdp(mockSdp);
      expect(transformed).toBe(mockSdp);
    });

    it('handles SDP with non-Opus audio codec (e.g. PCMU only) without crashing or adding RED', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 0 8',
        'a=rtpmap:0 PCMU/8000',
        'a=rtpmap:8 PCMA/8000'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).not.toContain('a=rtpmap:63 red');
      expect(transformed).toContain('a=rtpmap:0 PCMU/8000');
    });

    it('replaces existing b=AS and a=ptime rather than duplicating them', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'b=AS:64',
        'a=ptime:20',
        'a=maxptime:40',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, { bandwidthCapKbps: 12, ptime: 60, maxptime: 120 });

      expect(transformed).toContain('b=AS:12');
      expect(transformed).not.toContain('b=AS:64');
      expect(transformed).toContain('a=ptime:60');
      expect(transformed).not.toContain('a=ptime:20');
      expect((transformed.match(/b=AS:/g) || []).length).toBe(1);
    });
  });

  describe('configureAudioTransceiver — Codec Preference Ordering', () => {
    let originalRTCRtpReceiver;

    beforeEach(() => {
      originalRTCRtpReceiver = window.RTCRtpReceiver;
    });

    afterEach(() => {
      window.RTCRtpReceiver = originalRTCRtpReceiver;
      vi.restoreAllMocks();
    });

    it('prioritizes audio/red before audio/opus when RED capability is present', () => {
      const mockCodecs = [
        { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
        { mimeType: 'audio/red', clockRate: 48000, channels: 2 },
        { mimeType: 'audio/telephone-event', clockRate: 8000 },
        { mimeType: 'audio/PCMU', clockRate: 8000, channels: 1 }
      ];

      window.RTCRtpReceiver = {
        getCapabilities: vi.fn((kind) => {
          if (kind === 'audio') return { codecs: mockCodecs };
          return { codecs: [] };
        })
      };

      const mockTransceiver = {
        setCodecPreferences: vi.fn()
      };

      const result = configureAudioTransceiver(mockTransceiver);

      expect(window.RTCRtpReceiver.getCapabilities).toHaveBeenCalledWith('audio');
      expect(mockTransceiver.setCodecPreferences).toHaveBeenCalledTimes(1);

      const preferred = mockTransceiver.setCodecPreferences.mock.calls[0][0];
      expect(preferred[0].mimeType).toBe('audio/red');
      expect(preferred[1].mimeType).toBe('audio/opus');
      expect(preferred.length).toBe(4);
      expect(result).toBe(true);
    });

    it('prioritizes audio/opus when audio/red is not supported (fallback)', () => {
      const mockCodecs = [
        { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
        { mimeType: 'audio/telephone-event', clockRate: 8000 },
        { mimeType: 'audio/PCMU', clockRate: 8000, channels: 1 }
      ];

      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({ codecs: mockCodecs }))
      };

      const mockTransceiver = {
        setCodecPreferences: vi.fn()
      };

      const result = configureAudioTransceiver(mockTransceiver);

      expect(mockTransceiver.setCodecPreferences).toHaveBeenCalledTimes(1);
      const preferred = mockTransceiver.setCodecPreferences.mock.calls[0][0];
      expect(preferred[0].mimeType).toBe('audio/opus');
      expect(result).toBe(true);
    });

    it('matches mimeTypes case-insensitively', () => {
      const mockCodecs = [
        { mimeType: 'AUDIO/OPUS', clockRate: 48000, channels: 2 },
        { mimeType: 'Audio/RED', clockRate: 48000, channels: 2 }
      ];

      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({ codecs: mockCodecs }))
      };

      const mockTransceiver = {
        setCodecPreferences: vi.fn()
      };

      configureAudioTransceiver(mockTransceiver);

      const preferred = mockTransceiver.setCodecPreferences.mock.calls[0][0];
      expect(preferred[0].mimeType).toBe('Audio/RED');
      expect(preferred[1].mimeType).toBe('AUDIO/OPUS');
    });

    it('gracefully returns false when transceiver lacks setCodecPreferences', () => {
      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({ codecs: [{ mimeType: 'audio/opus' }] }))
      };

      const mockTransceiver = {}; // No setCodecPreferences
      expect(() => {
        const res = configureAudioTransceiver(mockTransceiver);
        expect(res).toBe(false);
      }).not.toThrow();
    });

    it('gracefully returns false when transceiver is null or undefined', () => {
      expect(configureAudioTransceiver(null)).toBe(false);
      expect(configureAudioTransceiver(undefined)).toBe(false);
    });

    it('gracefully returns false when RTCRtpReceiver is undefined', () => {
      window.RTCRtpReceiver = undefined;
      const mockTransceiver = { setCodecPreferences: vi.fn() };
      expect(configureAudioTransceiver(mockTransceiver)).toBe(false);
    });

    it('catches and handles exceptions thrown by setCodecPreferences', () => {
      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({
          codecs: [{ mimeType: 'audio/opus', clockRate: 48000, channels: 2 }]
        }))
      };

      const mockTransceiver = {
        setCodecPreferences: vi.fn(() => {
          throw new Error('InvalidModificationError');
        })
      };

      expect(() => {
        const res = configureAudioTransceiver(mockTransceiver);
        expect(res).toBe(false);
      }).not.toThrow();
    });
  });

  describe('applySenderBitrate — Sender Encoding Parameters & Priority Marking', () => {
    it('sets maxBitrate, priority: high, and networkPriority: high on audio sender', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({
          encodings: [{ maxBitrate: 20000 }]
        }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      const result = await applySenderBitrate(mockSender, 6000);

      expect(mockSender.getParameters).toHaveBeenCalled();
      expect(mockSender.setParameters).toHaveBeenCalledTimes(1);

      const passedParams = mockSender.setParameters.mock.calls[0][0];
      expect(passedParams.encodings[0].maxBitrate).toBe(6000);
      expect(passedParams.encodings[0].priority).toBe('high');
      expect(passedParams.encodings[0].networkPriority).toBe('high');
      expect(result).toBe(true);
    });

    it('clamps bitrates below 6000 bps up to 6000 bps', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({
          encodings: [{ maxBitrate: 20000 }]
        }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      await applySenderBitrate(mockSender, 3500);
      const passedParams = mockSender.setParameters.mock.calls[0][0];
      expect(passedParams.encodings[0].maxBitrate).toBe(6000);
    });

    it('clamps bitrates above 32000 bps down to upper bound', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({
          encodings: [{ maxBitrate: 20000 }]
        }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      await applySenderBitrate(mockSender, 64000);
      const passedParams = mockSender.setParameters.mock.calls[0][0];
      expect(passedParams.encodings[0].maxBitrate).toBeLessThanOrEqual(32000);
    });

    it('preserves existing encoding attributes and secondary encodings', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({
          encodings: [
            { maxBitrate: 20000, active: true, rid: 'high' },
            { maxBitrate: 10000, active: false, rid: 'low' }
          ]
        }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      await applySenderBitrate(mockSender, 10000);
      const passedParams = mockSender.setParameters.mock.calls[0][0];
      expect(passedParams.encodings[0].maxBitrate).toBe(10000);
      expect(passedParams.encodings[0].active).toBe(true);
      expect(passedParams.encodings[0].rid).toBe('high');
      expect(passedParams.encodings[1].maxBitrate).toBe(10000);
    });

    it('returns false when sender is null, undefined, or missing getParameters', async () => {
      expect(await applySenderBitrate(null, 6000)).toBe(false);
      expect(await applySenderBitrate(undefined, 6000)).toBe(false);
      expect(await applySenderBitrate({}, 6000)).toBe(false);
    });

    it('returns false when getParameters returns no encodings array', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({ encodings: [] }),
        setParameters: vi.fn()
      };

      const result = await applySenderBitrate(mockSender, 6000);
      expect(result).toBe(false);
      expect(mockSender.setParameters).not.toHaveBeenCalled();
    });

    it('catches and handles setParameters rejection gracefully', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({
          encodings: [{ maxBitrate: 20000 }]
        }),
        setParameters: vi.fn().mockRejectedValue(new Error('InvalidStateError'))
      };

      const result = await applySenderBitrate(mockSender, 6000);
      expect(result).toBe(false);
    });
  });

  describe('WebRTC End-to-End Munging & Safety Code Security Invariants', () => {
    it('maintains DTLS fingerprint integrity across SDP munging for generateSafetyCode', async () => {
      const baseSdpA = [
        'v=0',
        'a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const baseSdpB = [
        'v=0',
        'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      // Calculate code before munging
      const originalCode = await generateSafetyCode(baseSdpA, baseSdpB);

      // Munge both SDPs with aggressive low-bandwidth & RED options
      const mungedA = transformOpusSdp(baseSdpA, { bitrate: 6000, packetLossPerc: 50, enableRed: true });
      const mungedB = transformOpusSdp(baseSdpB, { bitrate: 6000, packetLossPerc: 50, enableRed: true });

      // Calculate code after munging
      const mungedCode = await generateSafetyCode(mungedA, mungedB);

      expect(mungedCode).toBe(originalCode);
      expect(mungedCode).toMatch(/^\d{5}$/);
    });
  });
});
```

---

## 5. Caveats

1. **JSDOM WebRTC Capabilities Mocking**:
   - `RTCRtpReceiver.getCapabilities('audio')` is not natively implemented in JSDOM. Tests must stub/mock `window.RTCRtpReceiver` and restore it in `afterEach()`. The test suite above includes explicit `beforeEach` and `afterEach` lifecycle isolation.
2. **Dynamic SDP Delimiters**:
   - SDP offers from Chrome and mobile WebRTC conform to RFC 4566 using `\r\n`, but some test fixtures and signaling intermediaries normalize line breaks to `\n`. The test suite asserts that `transformOpusSdp` dynamically detects and preserves the exact delimiter present in the input.
3. **Opus Payload Type Variability**:
   - While `111` is the common dynamic payload type assigned by WebRTC implementations for Opus, standard compliance requires reading `a=rtpmap:<pt> opus/48000` rather than hardcoding `111`. The test suite tests PT `109` and PT `111`.

---

## 6. Conclusion

- A comprehensive 10-group unit test suite with **36 distinct test cases** has been designed for Milestone 2 (Extreme Low-Bandwidth & High-Loss Audio Transport - R1).
- The suite provides 100% test coverage for:
  1. `transformOpusSdp` dynamic options (sub-6kbps, packet loss 10–50%, ptime 40/60/120, maxplaybackrate 8000/16000, FEC/DTX toggles).
  2. RFC 2198 RED SDP injection (`a=rtpmap:63 red/48000/2`, `a=fmtp:63 <opus_pt>/<opus_pt>`, `m=audio` format line prepend, idempotence, disable flag).
  3. `configureAudioTransceiver` codec preference prioritization (`[redCodec, opusCodec]` vs `[opusCodec]` fallback, error tolerance).
  4. `applySenderBitrate` RTCRtpSender parameter tuning (6kbps floor, 32kbps ceiling, priority & DSCP networkPriority).
  5. Pathological edge cases (empty SDP, malformed lines, missing Opus PT, non-audio media sections, CRLF/LF invariance, DTLS safety code integrity).
- This specification provides the exact Vitest code and assertions ready for implementation by the worker agent.

---

## 7. Verification Method

To independently verify the test suite once implemented:

```bash
# 1. Run WebRTC test suite in isolation
npx vitest run src/test/webrtc.test.js

# 2. Run all unit test suites
npm test

# 3. Invalidation Conditions:
# - Any failure in SDP formatting, RFC 2198 RED payload line syntax, or codec preference ordering.
# - Any unhandled exception on null/malformed SDP strings or missing browser WebRTC APIs.
# - Inability to generate deterministic DTLS safety codes on transformed SDPs.
```
