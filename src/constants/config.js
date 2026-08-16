/**
 * Application Constants & Configuration
 */

// WebRTC ICE Servers Configuration (Google STUN + OpenRelay TURN Fallback)
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

// Character set for generating readable 6-character Peer IDs (omits confusing 0/O, 1/I)
export const PEER_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Opus Codec & Packetization Constraints
export const OPUS_CONFIG = {
  MAX_AVERAGE_BITRATE: '12000', // 12 kbps
  USE_DTX: '1',                 // Silence suppression enabled
  STEREO: '0',                  // Mono voice optimization
  BANDWIDTH_CAP_KBPS: 16,       // SDP b=AS constraint
  PTIME: '40',                  // 40ms packetization reduces header overhead by 50%
  MAX_PTIME: '60',              // Maximum acceptable packetization time
  USE_INBAND_FEC: '1',          // Opus Forward Error Correction
  PACKET_LOSS_PERC: '10'        // Expected packet loss target for FEC
};

// Dynamic Bitrate Adaptation Thresholds
export const BITRATE_ADAPTATION = {
  HIGH_LOSS_THRESHOLD: 0.12,    // 12% packet loss -> emergency drop to 6kbps
  MID_LOSS_THRESHOLD: 0.05,     // 5% packet loss -> step down to 8kbps
  RECOVERY_LOSS_THRESHOLD: 0.01,// < 1% packet loss -> restore to 16kbps
  MIN_BITRATE_BPS: 6000,
  MID_BITRATE_BPS: 8000,
  MAX_BITRATE_BPS: 16000
};

// Timing Constants (in milliseconds)
export const TIMINGS = {
  OUTGOING_CALL_TIMEOUT_MS: 30000, // 30s no-answer timeout
  INCOMING_CALL_TIMEOUT_MS: 45000, // 45s ringing timeout
  STATS_POLL_INTERVAL_MS: 3000,    // 3s WebRTC RTT and Packet Loss polling
  RATE_LIMIT_WINDOW_MS: 5000,      // 5s rate limit between incoming calls from same peer
  MAX_RETRY_ATTEMPTS: 5,           // Max ID collision retry count
  MAX_LOG_ENTRIES: 50,             // Max entries in activity log
  MAX_RECENT_CALLS: 10             // Max stored recent contacts
};

// UI Status Display Mappings
export const STATUS_LABELS = {
  connecting: 'Connecting...',
  ready: 'Ready',
  calling: 'Calling...',
  'in-call': 'In Call',
  reconnecting: 'Reconnecting...',
  busy: 'User Busy',
  error: 'Error'
};

// Quality Ratings based on Round Trip Time (seconds)
export const QUALITY_BADGES = {
  good: '🟢 Good',
  fair: '🟡 Fair',
  poor: '🔴 Poor'
};

// LocalStorage Keys
export const STORAGE_KEYS = {
  THEME: 'secure_voice_theme',
  RECENT_CALLS: 'secure_voice_recent_calls',
  PREFERRED_INPUT: 'securevoice_preferred_input_id',
  PREFERRED_OUTPUT: 'securevoice_output_mode'
};
