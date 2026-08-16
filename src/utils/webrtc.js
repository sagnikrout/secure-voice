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
 * Transform SDP to enforce Opus low-bandwidth and high-resilience packetization:
 * - maxaveragebitrate = 12000 (12 kbps)
 * - usedtx = 1 (discontinuous transmission / silence suppression)
 * - useinbandfec = 1 (Opus in-band forward error correction)
 * - packetlossperc = 10 (target packet loss handling)
 * - stereo = 0, sprop-stereo = 0 (mono voice optimization)
 * - b=AS:16 (bandwidth cap 16 kbps)
 * - a=ptime:40 / a=maxptime:60 (reduced header packetization)
 * 
 * @param {string} sdp - Raw SDP string
 * @returns {string} Munged SDP string
 */
export function transformOpusSdp(sdp) {
  if (!sdp || typeof sdp !== 'string') return sdp;

  const isCrlf = sdp.includes('\r\n');
  const delimiter = isCrlf ? '\r\n' : '\n';
  const lines = sdp.split(delimiter);
  const modifiedLines = [];
  
  let inAudioMedia = false;
  let bandwidthAdded = false;
  let opusPayloadType = null;

  // First pass: extract the Opus payload type number from a=rtpmap line
  for (const line of lines) {
    if (line.startsWith('m=audio')) {
      inAudioMedia = true;
    } else if (line.startsWith('m=')) {
      inAudioMedia = false;
    }
    if (inAudioMedia && line.startsWith('a=rtpmap:')) {
      const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
      if (match) {
        opusPayloadType = match[1];
      }
    }
  }

  inAudioMedia = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.startsWith('m=')) {
      inAudioMedia = line.startsWith('m=audio');
      bandwidthAdded = false;
    }

    // Insert b=AS bandwidth cap and ptime before the first a= attribute line in audio media section
    if (inAudioMedia && !bandwidthAdded && line.startsWith('a=')) {
      modifiedLines.push(`b=AS:${OPUS_CONFIG.BANDWIDTH_CAP_KBPS}`);
      if (OPUS_CONFIG.PTIME) {
        modifiedLines.push(`a=ptime:${OPUS_CONFIG.PTIME}`);
      }
      if (OPUS_CONFIG.MAX_PTIME) {
        modifiedLines.push(`a=maxptime:${OPUS_CONFIG.MAX_PTIME}`);
      }
      bandwidthAdded = true;
    }

    // Modify the a=fmtp line corresponding to Opus payload type
    if (inAudioMedia && opusPayloadType && line.startsWith(`a=fmtp:${opusPayloadType}`)) {
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

        // Apply low-bandwidth, mono voice, and FEC parameters
        paramMap.set('maxaveragebitrate', OPUS_CONFIG.MAX_AVERAGE_BITRATE);
        paramMap.set('usedtx', OPUS_CONFIG.USE_DTX);
        paramMap.set('useinbandfec', OPUS_CONFIG.USE_INBAND_FEC || '1');
        paramMap.set('packetlossperc', OPUS_CONFIG.PACKET_LOSS_PERC || '10');
        paramMap.set('stereo', OPUS_CONFIG.STEREO);
        paramMap.set('sprop-stereo', OPUS_CONFIG.STEREO);

        const newParams = Array.from(paramMap.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join(';');

        line = `${prefix} ${newParams}`;
      }
    }

    modifiedLines.push(line);
  }

  return modifiedLines.join(delimiter);
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
  if (!localSdp || !remoteSdp) return null;
  
  const extractFingerprint = (sdp) => {
    const match = sdp.match(/a=fingerprint:sha-256\s+([A-F0-9:]+)/i);
    return match ? match[1] : '';
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
  
  // Extract 24 bits to form a 5-digit number
  const num = (hashArray[0] << 16) | (hashArray[1] << 8) | hashArray[2];
  return String(num % 100000).padStart(5, '0');
}
