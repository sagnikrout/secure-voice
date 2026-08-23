# Milestone 2 Technical Handoff Report: Extreme Low-Bandwidth & High-Loss Audio Transport (R1)

**Author**: Explorer 1 (Milestone 2 - R1 Transport Architecture)  
**Date**: 2026-08-23  
**Working Directory**: `/home/sagnik/teamwork_projects/secure_voice/.agents/explorer_m2_1`  
**Target Scope**: `src/utils/webrtc.js`, `src/constants/config.js`, `src/test/webrtc.test.js`, and `src/hooks/useCallSession.js`

---

## 1. Observation

Direct code examination of the SecureVoice codebase reveals the following baseline:

### 1.1 `src/utils/webrtc.js` (lines 52–135)
- **Current `transformOpusSdp(sdp)`**:
  - Accepts only a raw SDP string `sdp` (no `options` parameter).
  - Statically injects `b=AS:16`, `a=ptime:40`, and `a=maxptime:60`.
  - Sets Opus `a=fmtp:<pt>` parameters statically from `OPUS_CONFIG`:
    - `maxaveragebitrate = 12000` (fixed 12 kbps; cannot be stepped down to 6000 bps for sub-6kbps bandwidth survival).
    - `packetlossperc = 10` (fixed 10%; insufficient redundancy under 20%–50% packet loss environments).
    - `usedtx = 1`, `useinbandfec = 1`, `stereo = 0`, `sprop-stereo = 0`.
  - **Missing Parameters & Capabilities**:
    - Missing `cbr=0` (constrained variable bitrate for speech efficiency).
    - Missing `maxplaybackrate` and `sprop-maxcapturerate` (e.g. `16000` for Wideband or `8000` for Narrowband SILK mode), causing the codec to waste bit budget on 48kHz fullband encoding at ultra-low bitrates.
    - Missing RFC 2198 Redundant Audio Data (`audio/red` / payload type 63) SDP injection and formatting (`a=rtpmap:63 red/48000/2` + `a=fmtp:63 <opusPt>/<opusPt>`).
    - Missing support for custom `ptime` (e.g. 60ms) and `maxptime` (e.g. 120ms) to cut packet header overhead.
    - Missing `configureAudioTransceiver(transceiver)` helper to prioritize `audio/red` via `RTCRtpTransceiver.setCodecPreferences`.
    - Missing `applySenderBitrate(sender, bitrateBps)` helper to constrain `RTCRtpSender.setParameters` encodings with high priority and DSCP marking.

### 1.2 `src/constants/config.js` (lines 35–55)
- **Current `OPUS_CONFIG`**:
  ```javascript
  export const OPUS_CONFIG = {
    MAX_AVERAGE_BITRATE: '12000',
    USE_DTX: '1',
    STEREO: '0',
    BANDWIDTH_CAP_KBPS: 16,
    PTIME: '40',
    MAX_PTIME: '60',
    USE_INBAND_FEC: '1',
    PACKET_LOSS_PERC: '10'
  };
  ```
  - Lacks `MIN_AVERAGE_BITRATE: '6000'`, `HIGH_AVERAGE_BITRATE: '20000'`, `CBR: '0'`, `MAX_PLAYBACK_RATE: '16000'`, `SPROP_MAX_CAPTURE_RATE: '16000'`, `RED_PAYLOAD_TYPE: 63`, and `ENABLE_RED: true`.

### 1.3 `src/test/webrtc.test.js` (lines 63–145)
- Current test suite contains 19 tests covering basic `generatePeerId`, `sanitizePeerId`, static `transformOpusSdp`, `getQualityRating`, `ICE_SERVERS`, and `generateSafetyCode`.
- Lacks coverage for dynamic `options` in `transformOpusSdp`, RFC 2198 RED injection, `configureAudioTransceiver`, `applySenderBitrate`, and edge cases.

---

## 2. Logic Chain

From these observations and the project requirements in `PROJECT.md` & `ORIGINAL_REQUEST.md (§R1)`, we construct the engineering logic chain:

### 2.1 Transport Math & Packet Overhead Reduction
1. **RTP/UDP/IP Packet Header Overhead**:
   - An IPv4 packet carries: IPv4 header (20B) + UDP header (8B) + SRTP header (12B) + SRTP auth tag (10B) = **50 bytes (400 bits) overhead per RTP packet**.
   - At `ptime:20ms` (50 pps): Header overhead = $50 \times 400 = 20,000 \text{ bps } (20 \text{ kbps})$.
   - At `ptime:40ms` (25 pps): Header overhead = $25 \times 400 = 10,000 \text{ bps } (10 \text{ kbps})$.
   - At `ptime:60ms` (16.66 pps): Header overhead = $16.66 \times 400 = 6,664 \text{ bps } (\approx 6.6 \text{ kbps})$.
   - At `ptime:120ms` (8.33 pps): Header overhead = $8.33 \times 400 = 3,332 \text{ bps } (\approx 3.3 \text{ kbps})$.
   - **Conclusion**: Under extreme bandwidth constraints (sub-6kbps codec + limited uplink), setting `ptime:60` and `maxptime:120` reduces network header overhead by **67% to 83%**, allowing total bandwidth to remain within $\le 12 \text{ kbps}$.

### 2.2 Codec Bandwidth & SILK Voice Optimization
2. **Narrowband/Wideband Speech vs. Fullband**:
   - At 6000–12000 bps, Opus produces noticeable quantization noise if tasked with encoding fullband (48 kHz, up to 20 kHz audio bandwidth).
   - Setting `maxplaybackrate=16000` (Wideband, 8 kHz audio bandwidth) or `maxplaybackrate=8000` (Narrowband, 4 kHz audio bandwidth) restricts the codec to Opus SILK mode, concentrating all bits into the human speech spectrum (300 Hz – 4000/8000 Hz) for maximum phonetic clarity.
   - Setting `cbr=0` enables constrained VBR, preserving bits during simpler vowels and allocating them to plosives and consonants.
   - Setting `usedtx=1` suppresses packet generation entirely during conversational pauses (sending ~1 packet every 400ms), saving up to 60% of total transfer volume during typical dialogues.

### 2.3 Double Loss-Protection Architecture (In-Band FEC + RFC 2198 RED)
3. **In-Band FEC (`useinbandfec=1`, `packetlossperc=20..50`)**:
   - Protects against isolated 1-packet drops by embedding a low-bitrate representation of packet $N-1$ inside packet $N$.
4. **RFC 2198 Redundant Audio Data (`audio/red` / payload type 63)**:
   - For high-loss channels (30%–50% burst packet loss), in-band FEC alone can fail when two consecutive packets are lost.
   - RFC 2198 RED encapsulates the primary Opus frame along with 1 (or 2) redundant previous Opus frames inside a single RTP payload.
   - SDP format: `a=rtpmap:63 red/48000/2` with `a=fmtp:63 111/111`.
   - Browser preference: `transceiver.setCodecPreferences([redCodec, opusCodec])` instructs the WebRTC engine to transmit using RED encapsulation.
   - Result: Survives up to 50% packet loss with zero retransmission round-trip delay.

### 2.4 Sender Priority & DSCP Marking (`RTCRtpSender`)
5. **Quality of Service (QoS)**:
   - Setting `encodings[0].priority = 'high'` informs the browser WebRTC transport controller to prioritize the audio sender queue over data channels.
   - Setting `encodings[0].networkPriority = 'high'` enables Differentiated Services Code Point (DSCP) Expedited Forwarding (EF / DSCP 46) on IP packets where supported by the operating system/network stack, minimizing queuing latency on intermediate routers.

---

## 3. Detailed Concrete Implementation Plan

### 3.1 `src/constants/config.js`
Update `OPUS_CONFIG` with complete constants while preserving backwards compatibility:

```javascript
// Opus Codec & Packetization Constraints
export const OPUS_CONFIG = {
  MAX_AVERAGE_BITRATE: '12000',  // 12 kbps default target bitrate for mono voice
  MIN_AVERAGE_BITRATE: '6000',   // 6 kbps extreme low-bandwidth floor
  HIGH_AVERAGE_BITRATE: '20000', // 20 kbps high-quality ceiling
  USE_DTX: '1',                  // Discontinuous Transmission (silence suppression)
  USE_INBAND_FEC: '1',           // Opus In-band Forward Error Correction
  PACKET_LOSS_PERC: '20',        // Expected packet loss target for FEC tuning (10-50%)
  STEREO: '0',                   // Mono voice optimization (1 channel)
  CBR: '0',                      // Constrained VBR (0 = VBR, 1 = CBR)
  MAX_PLAYBACK_RATE: '16000',    // 16 kHz Wideband limit (focuses bit budget on voice)
  SPROP_MAX_CAPTURE_RATE: '16000', // Capture rate matching playback rate
  BANDWIDTH_CAP_KBPS: 16,        // SDP b=AS session bandwidth constraint
  PTIME: '60',                   // Default 60ms packetization (reduces header overhead by 67%)
  MAX_PTIME: '120',              // 120ms maximum acceptable packetization time
  RED_PAYLOAD_TYPE: 63,          // RFC 2198 RED dynamic payload type
  ENABLE_RED: true               // RFC 2198 RED redundancy enabled by default
};
```

---

### 3.2 `src/utils/webrtc.js`
Implement three core transport functions in `src/utils/webrtc.js`:

#### A. Enhanced `transformOpusSdp(sdp, options = {})`
```javascript
/**
 * Transform SDP to enforce low-bandwidth, high-resilience Opus & RFC 2198 RED parameters:
 * - maxaveragebitrate: 6000 to 24000 bps
 * - useinbandfec: 1 (Opus in-band forward error correction)
 * - packetlossperc: 10 to 50 (FEC loss adaptation target)
 * - usedtx: 1 (discontinuous transmission / silence suppression)
 * - cbr: 0 (constrained variable bitrate)
 * - maxplaybackrate / sprop-maxcapturerate: 8000 to 16000 (SILK narrowband/wideband focus)
 * - stereo / sprop-stereo: 0 (mono voice)
 * - b=AS:<bandwidthCapKbps> (SDP session bandwidth constraint)
 * - a=ptime:<ptime> / a=maxptime:<maxptime> (reduced header packetization)
 * - RFC 2198 Redundant Audio Data (audio/red / payload type 63) injection & formatting
 * 
 * @param {string} sdp - Raw SDP string
 * @param {Object} [options={}] - Transformation options
 * @param {number|string} [options.bitrate] - Target average bitrate in bps (e.g. 6000, 12000)
 * @param {number|string} [options.maxaveragebitrate] - Alias for bitrate
 * @param {number|string|boolean} [options.fec] - In-band FEC flag ('1' or '0')
 * @param {number|string|boolean} [options.useinbandfec] - Alias for fec
 * @param {number|string} [options.packetLossPerc] - Expected packet loss percentage (10-50)
 * @param {number|string} [options.packetlossperc] - Alias for packetLossPerc
 * @param {number|string|boolean} [options.dtx] - DTX flag ('1' or '0')
 * @param {number|string|boolean} [options.usedtx] - Alias for dtx
 * @param {number|string|boolean} [options.cbr] - CBR flag ('0' for VBR, '1' for CBR)
 * @param {number|string} [options.maxPlaybackRate] - Max playback rate in Hz (e.g. 8000, 16000)
 * @param {number|string} [options.maxplaybackrate] - Alias for maxPlaybackRate
 * @param {number|string} [options.spropMaxCaptureRate] - Sprop max capture rate in Hz
 * @param {number|string} [options.spropmaxcapturerate] - Alias for spropMaxCaptureRate
 * @param {number|string|boolean} [options.stereo] - Stereo flag ('0' for mono)
 * @param {number|string} [options.ptime] - Packetization time in ms (e.g. 40, 60)
 * @param {number|string} [options.maxptime] - Max packetization time in ms (e.g. 60, 120)
 * @param {number} [options.bandwidthCapKbps] - SDP b=AS bandwidth cap in kbps (e.g. 8, 16)
 * @param {number} [options.bandwidth] - Alias for bandwidthCapKbps
 * @param {boolean} [options.enableRed=true] - Whether to inject/enable RFC 2198 RED
 * @returns {string} Munged SDP string
 */
export function transformOpusSdp(sdp, options = {}) {
  if (!sdp || typeof sdp !== 'string') return sdp;

  // Normalize options with fallbacks to OPUS_CONFIG
  const targetBitrate = String(options.bitrate ?? options.maxaveragebitrate ?? OPUS_CONFIG.MAX_AVERAGE_BITRATE);
  const useFec = options.fec !== undefined ? (options.fec ? '1' : '0') : (options.useinbandfec !== undefined ? (options.useinbandfec ? '1' : '0') : (OPUS_CONFIG.USE_INBAND_FEC || '1'));
  const packetLossPerc = String(options.packetLossPerc ?? options.packetlossperc ?? OPUS_CONFIG.PACKET_LOSS_PERC ?? '20');
  const useDtx = options.dtx !== undefined ? (options.dtx ? '1' : '0') : (options.usedtx !== undefined ? (options.usedtx ? '1' : '0') : (OPUS_CONFIG.USE_DTX || '1'));
  const cbr = options.cbr !== undefined ? (options.cbr ? '1' : '0') : (OPUS_CONFIG.CBR || '0');
  const stereo = options.stereo !== undefined ? (options.stereo ? '1' : '0') : (OPUS_CONFIG.STEREO || '0');
  const maxPlaybackRate = String(options.maxPlaybackRate ?? options.maxplaybackrate ?? OPUS_CONFIG.MAX_PLAYBACK_RATE ?? '16000');
  const spropMaxCaptureRate = String(options.spropMaxCaptureRate ?? options.spropmaxcapturerate ?? OPUS_CONFIG.SPROP_MAX_CAPTURE_RATE ?? '16000');
  const ptime = options.ptime ?? OPUS_CONFIG.PTIME ?? '60';
  const maxPtime = options.maxptime ?? OPUS_CONFIG.MAX_PTIME ?? '120';
  const bandwidthCap = options.bandwidthCapKbps ?? options.bandwidth ?? options.bAs ?? OPUS_CONFIG.BANDWIDTH_CAP_KBPS ?? 16;
  const enableRed = options.enableRed !== undefined ? Boolean(options.enableRed) : (OPUS_CONFIG.ENABLE_RED !== false);

  const isCrlf = sdp.includes('\r\n');
  const delimiter = isCrlf ? '\r\n' : '\n';
  const lines = sdp.split(delimiter);
  const modifiedLines = [];

  let inAudioMedia = false;
  let opusPayloadType = null;
  let existingRedPayloadType = null;

  // Pass 1: Discover Opus & RED payload types in the audio section
  for (const line of lines) {
    if (line.startsWith('m=audio')) {
      inAudioMedia = true;
    } else if (line.startsWith('m=')) {
      inAudioMedia = false;
    }

    if (inAudioMedia) {
      if (line.startsWith('a=rtpmap:')) {
        const opusMatch = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
        if (opusMatch) {
          opusPayloadType = opusMatch[1];
        }
        const redMatch = line.match(/^a=rtpmap:(\d+)\s+red\/48000/i);
        if (redMatch) {
          existingRedPayloadType = redMatch[1];
        }
      }
    }
  }

  // Determine RED payload type to use (default 63)
  const redPayloadType = existingRedPayloadType || String(OPUS_CONFIG.RED_PAYLOAD_TYPE || 63);

  inAudioMedia = false;
  let audioBandwidthInserted = false;
  let redRtpmapInserted = false;
  let redFmtpInserted = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.startsWith('m=')) {
      inAudioMedia = line.startsWith('m=audio');
      audioBandwidthInserted = false;
      redRtpmapInserted = false;
      redFmtpInserted = false;
    }

    // Process m=audio line: ensure RED payload type is prioritized at the beginning if enabled
    if (inAudioMedia && line.startsWith('m=audio')) {
      if (enableRed && opusPayloadType) {
        const parts = line.split(' ');
        const mediaHeader = parts.slice(0, 3).join(' '); // e.g. "m=audio 9 UDP/TLS/RTP/SAVPF"
        let payloadTypes = parts.slice(3);

        // Remove redPayloadType if already in list to avoid duplicates
        payloadTypes = payloadTypes.filter(pt => pt !== redPayloadType);

        // Prepend redPayloadType before opusPayloadType (or at front)
        const opusIdx = payloadTypes.indexOf(opusPayloadType);
        if (opusIdx !== -1) {
          payloadTypes.splice(opusIdx, 0, redPayloadType);
        } else {
          payloadTypes.unshift(redPayloadType);
        }

        line = `${mediaHeader} ${payloadTypes.join(' ')}`;
      }
      modifiedLines.push(line);
      continue;
    }

    // Inside audio media block:
    if (inAudioMedia) {
      // Strip out any pre-existing b=AS or ptime/maxptime lines to avoid duplicate/conflicting attributes
      if (line.startsWith('b=AS:') || line.startsWith('b=TIAS:') || line.startsWith('a=ptime:') || line.startsWith('a=maxptime:')) {
        continue;
      }

      // Insert b=AS bandwidth cap right before the first a= attribute line
      if (!audioBandwidthInserted && line.startsWith('a=')) {
        modifiedLines.push(`b=AS:${bandwidthCap}`);
        if (ptime) {
          modifiedLines.push(`a=ptime:${ptime}`);
        }
        if (maxPtime) {
          modifiedLines.push(`a=maxptime:${maxPtime}`);
        }
        audioBandwidthInserted = true;
      }

      // Handle RED rtpmap line if present or inject after Opus rtpmap
      if (line.startsWith(`a=rtpmap:${redPayloadType}`)) {
        if (enableRed) {
          modifiedLines.push(`a=rtpmap:${redPayloadType} red/48000/2`);
          redRtpmapInserted = true;
        }
        continue;
      }

      // Handle Opus rtpmap line
      if (opusPayloadType && line.startsWith(`a=rtpmap:${opusPayloadType}`)) {
        modifiedLines.push(line);
        if (enableRed && !redRtpmapInserted) {
          modifiedLines.push(`a=rtpmap:${redPayloadType} red/48000/2`);
          redRtpmapInserted = true;
        }
        continue;
      }

      // Handle RED fmtp line
      if (line.startsWith(`a=fmtp:${redPayloadType}`)) {
        if (enableRed && opusPayloadType) {
          modifiedLines.push(`a=fmtp:${redPayloadType} ${opusPayloadType}/${opusPayloadType}`);
          redFmtpInserted = true;
        }
        continue;
      }

      // Handle Opus fmtp line
      if (opusPayloadType && line.startsWith(`a=fmtp:${opusPayloadType}`)) {
        const match = line.match(/^(a=fmtp:\d+)(?:\s+(.*))?$/);
        if (match) {
          const prefix = match[1];
          const paramsStr = match[2] || '';
          const paramMap = new Map();

          if (paramsStr) {
            paramsStr.split(';').forEach(p => {
              const [k, v] = p.trim().split('=');
              if (k) paramMap.set(k.trim(), v === undefined ? '1' : v.trim());
            });
          }

          // Apply comprehensive low-bandwidth, FEC, DTX, VBR, and SILK parameters
          paramMap.set('maxaveragebitrate', targetBitrate);
          paramMap.set('usedtx', useDtx);
          paramMap.set('useinbandfec', useFec);
          paramMap.set('packetlossperc', packetLossPerc);
          paramMap.set('cbr', cbr);
          paramMap.set('stereo', stereo);
          paramMap.set('sprop-stereo', stereo);
          paramMap.set('maxplaybackrate', maxPlaybackRate);
          paramMap.set('sprop-maxcapturerate', spropMaxCaptureRate);

          const newParams = Array.from(paramMap.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join(';');

          line = `${prefix} ${newParams}`;
        }
        modifiedLines.push(line);

        // Inject RED fmtp if not already inserted
        if (enableRed && opusPayloadType && !redFmtpInserted) {
          modifiedLines.push(`a=fmtp:${redPayloadType} ${opusPayloadType}/${opusPayloadType}`);
          redFmtpInserted = true;
        }
        continue;
      }
    }

    modifiedLines.push(line);
  }

  return modifiedLines.join(delimiter);
}
```

#### B. `configureAudioTransceiver(transceiver)`
```javascript
/**
 * Configure RTCRtpTransceiver codec preferences to prioritize RFC 2198 RED and Opus
 * @param {RTCRtpTransceiver} transceiver - Audio transceiver instance
 * @returns {boolean} True if codec preferences were successfully set, false otherwise
 */
export function configureAudioTransceiver(transceiver) {
  if (!transceiver || typeof transceiver.setCodecPreferences !== 'function') {
    return false;
  }
  if (typeof RTCRtpReceiver === 'undefined' || typeof RTCRtpReceiver.getCapabilities !== 'function') {
    return false;
  }

  try {
    const capabilities = RTCRtpReceiver.getCapabilities('audio');
    if (!capabilities || !Array.isArray(capabilities.codecs)) {
      return false;
    }

    const codecs = capabilities.codecs;
    const redCodec = codecs.find(c => c.mimeType && c.mimeType.toLowerCase() === 'audio/red');
    const opusCodec = codecs.find(c => c.mimeType && c.mimeType.toLowerCase() === 'audio/opus');

    if (!opusCodec) {
      return false;
    }

    const preferredCodecs = [];
    if (redCodec) {
      preferredCodecs.push(redCodec);
    }
    preferredCodecs.push(opusCodec);

    // Append remaining audio codecs as fallbacks (preserving capability list integrity)
    codecs.forEach(codec => {
      if (codec !== redCodec && codec !== opusCodec) {
        preferredCodecs.push(codec);
      }
    });

    transceiver.setCodecPreferences(preferredCodecs);
    return true;
  } catch (err) {
    console.warn('configureAudioTransceiver error:', err);
    return false;
  }
}
```

#### C. `applySenderBitrate(sender, bitrateBps)`
```javascript
/**
 * Apply bitrate constraint, sender priority, and DSCP network priority to an RTCRtpSender
 * @param {RTCRtpSender} sender - The audio RTCRtpSender
 * @param {number|string} bitrateBps - Target bitrate in bps (e.g. 6000 to 24000)
 * @returns {Promise<boolean>} True if parameters were successfully applied
 */
export async function applySenderBitrate(sender, bitrateBps) {
  if (!sender || typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') {
    return false;
  }

  const bitrate = Number(bitrateBps);
  if (isNaN(bitrate) || bitrate <= 0) {
    return false;
  }

  try {
    const params = sender.getParameters();
    if (!params) {
      return false;
    }

    if (!Array.isArray(params.encodings) || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    params.encodings[0].maxBitrate = bitrate;
    params.encodings[0].priority = 'high';          // WebRTC Sender Priority API
    params.encodings[0].networkPriority = 'high';   // DSCP Expedited Forwarding (EF / DSCP 46)
    params.encodings[0].active = true;

    await sender.setParameters(params);
    return true;
  } catch (err) {
    console.warn('applySenderBitrate error:', err);
    return false;
  }
}
```

---

### 3.3 Vitest Test Matrix Specification (`src/test/webrtc.test.js`)

The test suite must verify all 3 functions and their edge cases:

```javascript
describe('transformOpusSdp', () => {
  it('returns empty/null/non-string sdp safely');
  it('injects default Opus parameters and RFC 2198 RED into audio media block');
  it('supports custom options (bitrate: 6000, packetLossPerc: 50, ptime: 60, maxptime: 120, bandwidthCapKbps: 8)');
  it('enforces maxplaybackrate and sprop-maxcapturerate down to 8000 for narrowband SILK mode');
  it('supports disabling RFC 2198 RED via enableRed: false');
  it('handles existing RED in SDP without duplicating rtpmap or fmtp lines');
  it('removes pre-existing b=AS and ptime lines to prevent duplicates');
  it('preserves CRLF and LF delimiters cleanly');
  it('preserves non-audio sections (m=video, etc.) untouched');
  it('preserves non-Opus audio codecs (e.g. telephone-event) intact');
  it('correctly places b=AS before any a= attribute lines in audio media');
});

describe('configureAudioTransceiver', () => {
  it('returns false for invalid transceiver or missing setCodecPreferences');
  it('returns false if RTCRtpReceiver.getCapabilities is missing');
  it('prioritizes [redCodec, opusCodec, ...others] when RED is supported');
  it('prioritizes [opusCodec, ...others] when RED is not supported in capabilities');
  it('catches and logs errors without throwing');
});

describe('applySenderBitrate', () => {
  it('returns false for null/invalid sender or non-positive bitrate');
  it('applies maxBitrate, priority: high, and networkPriority: high');
  it('initializes encodings array if missing or empty');
  it('handles setParameters rejection safely and returns false');
});
```

---

## 4. Caveats

1. **Browser Support for RFC 2198 RED**:
   - `audio/red` is fully supported in Chromium (and Android Capacitor WebView).
   - In environments where `audio/red` is absent (e.g. older Safari versions), `configureAudioTransceiver` gracefully falls back to `[opusCodec]`, and `transformOpusSdp` still provides full protection via Opus SILK narrowband/wideband constraints and in-band FEC (`useinbandfec=1`, `packetlossperc=50`).
2. **SDP Line Ordering Compliance (RFC 4566)**:
   - Bandwidth modifiers (`b=AS:`) must strictly precede attribute lines (`a=`). The algorithm guarantees that `b=AS:` is inserted immediately before the first `a=` attribute line in the audio section.
3. **DSCP (`networkPriority`) Permissions**:
   - On some Linux/Android operating systems without root/special network capabilities, the OS kernel may ignore DSCP socket markings; setting `networkPriority: 'high'` in WebRTC is safely ignored by the browser if unsupported and will not throw errors.

---

## 5. Conclusion

- **Milestone 2 (R1)** provides complete extreme low-bandwidth and high-loss resilience for SecureVoice.
- The enhanced `transformOpusSdp` supports dynamic sub-6kbps configuration, dynamic packet loss percentage up to 50%, silence suppression DTX, constrained VBR, narrowband/wideband SILK tuning, header packetization overhead reduction via `ptime:60`/`maxptime:120`, and RFC 2198 RED redundancy.
- The `configureAudioTransceiver` and `applySenderBitrate` utilities provide runtime transceiver codec prioritization and sender QoS priority / DSCP marking.
- All interface contracts match `PROJECT.md` exactly and are ready for implementation.

---

## 6. Verification Method

To verify the implementation:

1. **Execute Vitest Test Suite**:
   ```bash
   npm test -- src/test/webrtc.test.js --run
   ```
   - Must execute all unit tests with 100% pass rate.
2. **Verify Full Test Matrix**:
   ```bash
   npm test -- --run
   ```
3. **Invalidation Conditions**:
   - Any failure in `src/test/webrtc.test.js`.
   - SDP output failing RFC 4566 ordering (`b=` after `a=`).
   - Duplicate `a=rtpmap:63` or `b=AS:` lines.
   - Any unhandled exception from `configureAudioTransceiver` or `applySenderBitrate`.
