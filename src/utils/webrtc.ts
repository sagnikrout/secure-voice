/**
 * WebRTC SDP Transformation, Network Scoring & Security Utilities
 */
import { ICE_SERVERS, PEER_ID_ALPHABET, OPUS_CONFIG } from '../constants/config';
import { formatPeerId, sanitizePeerId } from './formatters';

export { ICE_SERVERS, formatPeerId, sanitizePeerId };

/**
 * Generate cryptographically secure uppercase alphanumeric ID with rejection sampling
 * @param {number} [length=9]
 * @returns {string} Formatted peer ID (e.g. ABC-DEF-GHI)
 */
export function generatePeerId(length = 9) {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('SecureVoice requires a secure context (HTTPS) with crypto.getRandomValues support.');
  }

  let result = '';
  const alphabetLength = PEER_ID_ALPHABET.length;
  // Largest multiple of alphabetLength <= 256
  const maxValidByte = 256 - (256 % alphabetLength);
  
  while (result.length < length) {
    const randomBytes = new Uint8Array(length * 2);
    crypto.getRandomValues(randomBytes);
    
    for (let i = 0; i < randomBytes.length && result.length < length; i++) {
      const byte = randomBytes[i];
      if (byte < maxValidByte) {
        result += PEER_ID_ALPHABET[byte % alphabetLength];
      }
    }
  }

  return formatPeerId(result);
}

/**
 * Transform SDP to enforce low-bandwidth, high-resilience Opus & RFC 2198 RED parameters:
 * - maxaveragebitrate: 6000 to 24000 bps (configurable down to 6000 bps)
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
 * @param {number|string|boolean} [options.useInbandFec] - Alias for fec
 * @param {number|string} [options.packetLossPerc] - Expected packet loss percentage (10-50)
 * @param {number|string} [options.packetlossperc] - Alias for packetLossPerc
 * @param {number|string} [options.packetLossPercentage] - Alias for packetLossPerc
 * @param {number|string|boolean} [options.dtx] - DTX flag ('1' or '0')
 * @param {number|string|boolean} [options.usedtx] - Alias for dtx
 * @param {number|string|boolean} [options.useDtx] - Alias for dtx
 * @param {number|string|boolean} [options.cbr] - CBR flag ('0' for VBR, '1' for CBR)
 * @param {number|string} [options.maxPlaybackRate] - Max playback rate in Hz (e.g. 8000, 16000)
 * @param {number|string} [options.maxplaybackrate] - Alias for maxPlaybackRate
 * @param {number|string} [options.spropMaxCaptureRate] - Sprop max capture rate in Hz
 * @param {number|string} [options.spropmaxcapturerate] - Alias for spropMaxCaptureRate
 * @param {number|string|boolean} [options.stereo] - Stereo flag ('0' for mono)
 * @param {number|string} [options.ptime] - Packetization time in ms (e.g. 40, 60)
 * @param {number|string} [options.maxptime] - Max packetization time in ms (e.g. 60, 120)
 * @param {number|string} [options.maxPtime] - Alias for maxptime
 * @param {number} [options.bandwidthCapKbps] - SDP b=AS bandwidth cap in kbps (e.g. 8, 16)
 * @param {number} [options.bandwidth] - Alias for bandwidthCapKbps
 * @param {number} [options.bAs] - Alias for bandwidthCapKbps
 * @param {boolean} [options.enableRed=true] - Whether to inject/enable RFC 2198 RED
 * @param {number|string} [options.redPayloadType] - Custom dynamic payload type for RED
 * @returns {string} Munged SDP string
 */
/**
 * Sanitize SDP string to strip non-printable characters and malformed control bytes
 */
export function sanitizeSdp(sdp: string): string {
  if (!sdp || typeof sdp !== 'string') return '';
  return sdp.replace(/[^\x20-\x7E\r\n]/g, '').trim();
}

export function transformOpusSdp(sdp: string, options: any = {}): string {
  if (!sdp || typeof sdp !== 'string') return sdp;

  const opts: any = options && typeof options === 'object' ? options : {};

  // Options normalization with fallbacks to OPUS_CONFIG
  const targetBitrate = String(opts.bitrate ?? opts.maxaveragebitrate ?? OPUS_CONFIG.MAX_AVERAGE_BITRATE ?? '12000');

  const normalizeBool = (val, defaultVal) => {
    if (val === undefined || val === null) return defaultVal;
    if (typeof val === 'boolean') return val ? '1' : '0';
    if (val === '1' || val === 1 || val === 'true') return '1';
    if (val === '0' || val === 0 || val === 'false') return '0';
    return defaultVal;
  };

  const useFec = normalizeBool(opts.fec ?? opts.useinbandfec ?? opts.useInbandFec, OPUS_CONFIG.USE_INBAND_FEC ?? '1');
  const useDtx = normalizeBool(opts.dtx ?? opts.usedtx ?? opts.useDtx, OPUS_CONFIG.USE_DTX ?? '1');
  const cbr = normalizeBool(opts.cbr, OPUS_CONFIG.CBR ?? '0');
  const stereo = normalizeBool(opts.stereo, OPUS_CONFIG.STEREO ?? '0');

  const packetLossPerc = String(opts.packetLossPerc ?? opts.packetlossperc ?? opts.packetLossPercentage ?? OPUS_CONFIG.PACKET_LOSS_PERC ?? '20');
  const maxPlaybackRate = String(opts.maxPlaybackRate ?? opts.maxplaybackrate ?? OPUS_CONFIG.MAX_PLAYBACK_RATE ?? '16000');
  const spropMaxCaptureRate = String(opts.spropMaxCaptureRate ?? opts.spropmaxcapturerate ?? OPUS_CONFIG.SPROP_MAX_CAPTURE_RATE ?? '16000');
  const ptime = opts.ptime !== undefined ? String(opts.ptime) : (OPUS_CONFIG.PTIME ? String(OPUS_CONFIG.PTIME) : '60');
  const maxPtime = opts.maxptime !== undefined ? String(opts.maxptime) : (opts.maxPtime !== undefined ? String(opts.maxPtime) : (OPUS_CONFIG.MAX_PTIME ? String(OPUS_CONFIG.MAX_PTIME) : '120'));
  const bandwidthCap = opts.bandwidthCapKbps ?? opts.bandwidth ?? opts.bAs ?? OPUS_CONFIG.BANDWIDTH_CAP_KBPS ?? 16;
  const enableRed = opts.enableRed !== undefined ? Boolean(opts.enableRed) : (OPUS_CONFIG.ENABLE_RED !== false);
  const customRedPt = opts.redPayloadType ?? OPUS_CONFIG.RED_PAYLOAD_TYPE ?? 63;

  const isCrlf = sdp.includes('\r\n');
  const delimiter = isCrlf ? '\r\n' : '\n';
  const lines = sdp.split(delimiter);

  // Group lines into sections
  const sections = [];
  let currentSection = { isAudio: false, lines: [] };
  sections.push(currentSection);

  for (const line of lines) {
    if (line.startsWith('m=')) {
      currentSection = { isAudio: line.startsWith('m=audio'), lines: [line] };
      sections.push(currentSection);
    } else {
      currentSection.lines.push(line);
    }
  }

  const processedSections = sections.map(section => {
    if (!section.isAudio) {
      return section.lines;
    }

    let opusPayloadType = null;
    let existingRedPt = null;

    for (const line of section.lines) {
      if (line.startsWith('a=rtpmap:')) {
        const opusMatch = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
        if (opusMatch) {
          opusPayloadType = opusMatch[1];
        }
        const redMatch = line.match(/^a=rtpmap:(\d+)\s+red\/48000/i);
        if (redMatch) {
          existingRedPt = redMatch[1];
        }
      }
    }

    if (!opusPayloadType) {
      return section.lines;
    }

    const redPt = String(existingRedPt || customRedPt);

    // Format m=audio line
    let mLine = section.lines[0];
    const mParts = mLine.split(' ');
    const mHeader = mParts.slice(0, 3).join(' ');
    let payloadTypes = mParts.slice(3);

    if (enableRed) {
      payloadTypes = payloadTypes.filter(pt => pt !== redPt);
      const opusIdx = payloadTypes.indexOf(opusPayloadType);
      if (opusIdx !== -1) {
        payloadTypes.splice(opusIdx, 0, redPt);
      } else {
        payloadTypes.unshift(redPt);
      }
    } else {
      payloadTypes = payloadTypes.filter(pt => pt !== redPt);
    }
    mLine = `${mHeader} ${payloadTypes.join(' ')}`;

    // Process attributes
    const filteredLines = [];
    let audioBandwidthInserted = false;
    let opusFmtpFound = false;

    const remainingLines = [];
    for (const line of section.lines.slice(1)) {
      if (line.startsWith('b=AS:') || line.startsWith('b=TIAS:') || line.startsWith('a=ptime:') || line.startsWith('a=maxptime:')) {
        continue;
      }
      if (line.startsWith(`a=rtpmap:${redPt}`) || line.startsWith(`a=fmtp:${redPt}`)) {
        continue;
      }
      remainingLines.push(line);
    }

    for (let i = 0; i < remainingLines.length; i++) {
      const line = remainingLines[i];

      // Insert b=AS and ptime before the first a= line
      if (!audioBandwidthInserted && line.startsWith('a=')) {
        filteredLines.push(`b=AS:${bandwidthCap}`);
        if (ptime) {
          filteredLines.push(`a=ptime:${ptime}`);
        }
        if (maxPtime) {
          filteredLines.push(`a=maxptime:${maxPtime}`);
        }
        audioBandwidthInserted = true;
      }

      // Handle Opus rtpmap line
      if (line.startsWith(`a=rtpmap:${opusPayloadType}`)) {
        filteredLines.push(line);
        if (enableRed) {
          filteredLines.push(`a=rtpmap:${redPt} red/48000/2`);
        }
        continue;
      }

      // Handle Opus fmtp line
      if (line.startsWith(`a=fmtp:${opusPayloadType}`)) {
        opusFmtpFound = true;
        const match = line.match(/^(a=fmtp:\d+)(?:\s+(.*))?$/);
        const prefix = match ? match[1] : `a=fmtp:${opusPayloadType}`;
        const paramsStr = (match && match[2]) ? match[2] : '';
        const paramMap = new Map();

        if (paramsStr) {
          paramsStr.split(';').forEach(p => {
            const [k, v] = p.trim().split('=');
            if (k) paramMap.set(k.trim(), v === undefined ? '1' : v.trim());
          });
        }

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

        filteredLines.push(`${prefix} ${newParams}`);
        if (enableRed) {
          filteredLines.push(`a=fmtp:${redPt} ${opusPayloadType}/${opusPayloadType}`);
        }
        continue;
      }

      filteredLines.push(line);
    }

    if (!audioBandwidthInserted) {
      if (maxPtime) filteredLines.unshift(`a=maxptime:${maxPtime}`);
      if (ptime) filteredLines.unshift(`a=ptime:${ptime}`);
      filteredLines.unshift(`b=AS:${bandwidthCap}`);
    }

    if (!opusFmtpFound) {
      const opusFmtp = `a=fmtp:${opusPayloadType} maxaveragebitrate=${targetBitrate};usedtx=${useDtx};useinbandfec=${useFec};packetlossperc=${packetLossPerc};cbr=${cbr};stereo=${stereo};sprop-stereo=${stereo};maxplaybackrate=${maxPlaybackRate};sprop-maxcapturerate=${spropMaxCaptureRate}`;
      filteredLines.push(opusFmtp);
      if (enableRed) {
        filteredLines.push(`a=fmtp:${redPt} ${opusPayloadType}/${opusPayloadType}`);
      }
    }

    return [mLine, ...filteredLines];
  });

  const allLines = processedSections.flat();
  return allLines.join(delimiter);
}

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
    if (!capabilities || !Array.isArray(capabilities.codecs) || capabilities.codecs.length === 0) {
      return false;
    }

    const codecs = capabilities.codecs;
    const redCodec = codecs.find(c => c && c.mimeType && c.mimeType.toLowerCase() === 'audio/red');
    const opusCodec = codecs.find(c => c && c.mimeType && c.mimeType.toLowerCase() === 'audio/opus');

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
      if (codec && codec !== redCodec && codec !== opusCodec) {
        preferredCodecs.push(codec);
      }
    });

    transceiver.setCodecPreferences(preferredCodecs);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Apply bitrate constraint, sender priority, and DSCP network priority to an RTCRtpSender
 * @param {RTCRtpSender} sender - The audio RTCRtpSender
 * @param {number|string} bitrateBps - Target bitrate in bps (e.g. 6000 to 32000)
 * @param {string} [priority='high'] - Encoding priority ('high', 'medium', 'low')
 * @returns {Promise<boolean>} True if parameters were successfully applied
 */
export async function applySenderBitrate(sender, bitrateBps, priority = 'high') {
  if (!sender || typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') {
    return false;
  }

  let bitrate = Number(bitrateBps);
  if (isNaN(bitrate) || bitrate === null) {
    bitrate = 12000;
  }
  if (bitrate < 3000) {
    bitrate = 3000;
  } else if (bitrate > 32000) {
    bitrate = 32000;
  }

  try {
    const params = sender.getParameters();
    if (!params || !Array.isArray(params.encodings) || params.encodings.length === 0) {
      return false;
    }

    params.encodings[0].maxBitrate = bitrate;
    params.encodings[0].priority = priority;
    params.encodings[0].networkPriority = priority;

    await sender.setParameters(params);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Classify network connection quality by round-trip time (RTT in seconds)
 * @param {number} rttSeconds
 * @returns {'good' | 'fair' | 'poor'}
 */
export function getQualityRating(rttSeconds) {
  const rtt = Number(rttSeconds);
  if (isNaN(rtt) || rtt < 0) return 'good';
  if (rtt < 0.15) return 'good'; // < 150ms
  if (rtt < 0.40) return 'fair'; // 150ms - 400ms
  return 'poor';                 // >= 400ms
}

/**
 * Generate a deterministic 5-digit verbal Safety Code from DTLS-SRTP fingerprints for MITM detection
 * @param {string} localSdp - Local session description
 * @param {string} remoteSdp - Remote session description
 * @returns {Promise<string|null>} 5-digit code string
 */
export async function generateSafetyCode(localSdp, remoteSdp) {
  if (!localSdp || !remoteSdp || typeof localSdp !== 'string' || typeof remoteSdp !== 'string') return null;
  
  const extractFingerprint = (sdp) => {
    const match = sdp.match(/a=fingerprint:\S+\s+([A-F0-9:]+)/i);
    return match ? match[1].toUpperCase().trim() : '';
  };
  
  const f1 = extractFingerprint(localSdp);
  const f2 = extractFingerprint(remoteSdp);
  if (!f1 || !f2) return null;
  
  // Sort fingerprints so both caller and callee produce the identical hash
  const combined = [f1, f2].sort().join('|');
  
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  // Extract 32 bits to form a 6-digit number
  const num = ((hashArray[0] << 24) | (hashArray[1] << 16) | (hashArray[2] << 8) | hashArray[3]) >>> 0;
  return String(num % 1000000).padStart(6, '0');
}
