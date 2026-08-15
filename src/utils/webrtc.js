/**
 * WebRTC SDP Transformation & Network Utilities
 */

// Production ICE Servers (STUN & Turn fallback options)
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

/**
 * Generate clean 6-character uppercase alphanumeric ID
 */
export function generatePeerId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit confusing 0/O, 1/I
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Transform SDP to force Opus codec low-bandwidth parameters:
 * - maxaveragebitrate = 12000 (12 kbps)
 * - usedtx = 1 (discontinuous transmission / silence suppression)
 * - b=AS:16 (bandwidth cap 16 kbps)
 */
export function transformOpusSdp(sdp) {
  if (!sdp) return sdp;

  const lines = sdp.split('\r\n');
  const modifiedLines = [];
  let isAudio = false;
  let bandwidthAdded = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.startsWith('m=')) {
      isAudio = line.startsWith('m=audio');
      bandwidthAdded = false;
    }

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

  return modifiedLines.join('\r\n');
}

/**
 * Classify network connection quality by round-trip time (RTT in seconds)
 */
export function getQualityRating(rttSeconds) {
  if (rttSeconds === null || rttSeconds === undefined) return 'good';
  if (rttSeconds < 0.15) return 'good'; // < 150ms
  if (rttSeconds < 0.40) return 'fair'; // 150ms - 400ms
  return 'poor'; // > 400ms
}
