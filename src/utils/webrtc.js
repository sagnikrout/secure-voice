/**
 * WebRTC SDP Transformation & Network Utilities
 */

// Production ICE Servers (Google STUN + OpenRelay TURN Fallback)
export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

const PEER_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Disambiguated 32-char charset (no 0/O, 1/I)

/**
 * Generate cryptographically secure 6-character uppercase alphanumeric ID
 */
export function generatePeerId(length = 6) {
  let result = '';
  const alphabetLength = PEER_ID_ALPHABET.length;

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);
    for (let i = 0; i < length; i++) {
      result += PEER_ID_ALPHABET[randomBytes[i] % alphabetLength];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += PEER_ID_ALPHABET.charAt(Math.floor(Math.random() * alphabetLength));
    }
  }

  return result;
}

/**
 * Sanitize user input for Peer IDs
 */
export function sanitizePeerId(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
}

/**
 * Transform SDP to force Opus codec low-bandwidth parameters:
 * - maxaveragebitrate = 12000 (12 kbps)
 * - usedtx = 1 (discontinuous transmission / silence suppression)
 * - stereo = 0, sprop-stereo = 0 (mono voice optimization)
 * - b=AS:16 (bandwidth cap 16 kbps)
 */
export function transformOpusSdp(sdp) {
  if (!sdp || typeof sdp !== 'string') return sdp;

  // Support both \r\n and \n line breaks
  const isCrlf = sdp.includes('\r\n');
  const delimiter = isCrlf ? '\r\n' : '\n';
  const lines = sdp.split(delimiter);
  const modifiedLines = [];
  let isAudio = false;
  let bandwidthAdded = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.startsWith('m=')) {
      isAudio = line.startsWith('m=audio');
      bandwidthAdded = false;
    }

    // Insert bandwidth constraint right after c= line in audio section
    if (isAudio && !bandwidthAdded && line.startsWith('c=')) {
      modifiedLines.push(line);
      modifiedLines.push('b=AS:16');
      bandwidthAdded = true;
      continue;
    }

    if (isAudio && !bandwidthAdded && line.startsWith('a=')) {
      modifiedLines.push('b=AS:16');
      bandwidthAdded = true;
    }

    if (isAudio && line.startsWith('a=fmtp:')) {
      const match = line.match(/^(a=fmtp:\d+)\s+(.*)$/);
      if (match) {
        const prefix = match[1];
        const paramsStr = match[2];
        const paramMap = new Map();

        paramsStr.split(';').forEach(p => {
          const [k, v] = p.trim().split('=');
          if (k) paramMap.set(k.trim(), v === undefined ? '1' : v.trim());
        });

        // Set low-bandwidth Opus params
        paramMap.set('maxaveragebitrate', '12000');
        paramMap.set('usedtx', '1');
        paramMap.set('stereo', '0');
        paramMap.set('sprop-stereo', '0');

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
 */
export function getQualityRating(rttSeconds) {
  const rtt = Number(rttSeconds);
  if (isNaN(rtt) || rtt < 0) return 'good';
  if (rtt < 0.15) return 'good'; // < 150ms
  if (rtt < 0.40) return 'fair'; // 150ms - 400ms
  return 'poor'; // >= 400ms
}
