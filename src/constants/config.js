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

// Character set for generating readable 9-character Peer IDs (omits confusing 0/O, 1/I, L)
export const PEER_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Opus Codec & Packetization Constraints
export const OPUS_CONFIG = {
  MAX_AVERAGE_BITRATE: '12000', // 12 kbps default target bitrate for mono voice
  MIN_AVERAGE_BITRATE: '6000',  // 6 kbps extreme low-bandwidth floor
  HIGH_AVERAGE_BITRATE: '20000', // 20 kbps high-quality ceiling
  USE_DTX: '1',                 // Discontinuous Transmission (silence suppression)
  USE_INBAND_FEC: '1',          // Opus In-band Forward Error Correction
  PACKET_LOSS_PERC: '20',       // Expected packet loss target for FEC tuning (10-50%)
  STEREO: '0',                  // Mono voice optimization (1 channel)
  CBR: '0',                     // Constrained VBR (0 = VBR, 1 = CBR)
  MAX_PLAYBACK_RATE: '16000',   // 16 kHz Wideband limit (focuses bit budget on voice)
  SPROP_MAX_CAPTURE_RATE: '16000', // Capture rate matching playback rate
  BANDWIDTH_CAP_KBPS: 16,       // SDP b=AS session bandwidth constraint
  PTIME: '60',                  // Default 60ms packetization (reduces header overhead by 67%)
  MAX_PTIME: '120',             // 120ms maximum acceptable packetization time
  RED_PAYLOAD_TYPE: 63,         // RFC 2198 RED dynamic payload type
  ENABLE_RED: true              // RFC 2198 RED redundancy enabled by default
};

// 5-Tier Adaptive Bitrate Ladder Configuration
export const LADDER_TIERS = [
  {
    id: 0,
    name: 'HQ',
    label: 'High Quality',
    maxBitrateBps: 20000,
    bandwidthCapKbps: 24,
    ptimeMs: 40,
    maxPtimeMs: 60,
    fecPacketLossPerc: 10,
    maxPlaybackRate: 16000,
    lossThreshold: 0.02,          // < 2% loss
    rttThresholdMs: 150,          // < 150ms RTT
    jitterThresholdMs: 30,        // < 30ms jitter
    concealmentThreshold: 0.01    // < 1% concealment
  },
  {
    id: 1,
    name: 'STD',
    label: 'Standard Voice',
    maxBitrateBps: 14000,
    bandwidthCapKbps: 18,
    ptimeMs: 40,
    maxPtimeMs: 60,
    fecPacketLossPerc: 15,
    maxPlaybackRate: 16000,
    lossThreshold: 0.06,          // 2% - 6% loss
    rttThresholdMs: 300,          // 150ms - 300ms RTT
    jitterThresholdMs: 60,        // 30ms - 60ms jitter
    concealmentThreshold: 0.03    // 1% - 3% concealment
  },
  {
    id: 2,
    name: 'LB',
    label: 'Low Bandwidth',
    maxBitrateBps: 10000,
    bandwidthCapKbps: 14,
    ptimeMs: 60,
    maxPtimeMs: 120,
    fecPacketLossPerc: 25,
    maxPlaybackRate: 16000,
    lossThreshold: 0.12,          // 6% - 12% loss
    rttThresholdMs: 500,          // 300ms - 500ms RTT
    jitterThresholdMs: 100,       // 60ms - 100ms jitter
    concealmentThreshold: 0.07    // 3% - 7% concealment
  },
  {
    id: 3,
    name: 'HL',
    label: 'High Loss Resilience',
    maxBitrateBps: 7500,
    bandwidthCapKbps: 10,
    ptimeMs: 60,
    maxPtimeMs: 120,
    fecPacketLossPerc: 40,
    maxPlaybackRate: 16000,
    lossThreshold: 0.25,          // 12% - 25% loss
    rttThresholdMs: 800,          // 500ms - 800ms RTT
    jitterThresholdMs: 180,       // 100ms - 180ms jitter
    concealmentThreshold: 0.15    // 7% - 15% concealment
  },
  {
    id: 4,
    name: 'EXT',
    label: 'Extreme Survival Mode',
    maxBitrateBps: 6000,
    bandwidthCapKbps: 8,
    ptimeMs: 60,
    maxPtimeMs: 120,
    fecPacketLossPerc: 50,
    maxPlaybackRate: 8000,        // Narrowband SILK focus
    lossThreshold: 1.0,           // > 25% loss
    rttThresholdMs: 99999,        // > 800ms RTT
    jitterThresholdMs: 99999,     // > 180ms jitter
    concealmentThreshold: 1.0     // > 15% concealment
  }
];

// Adaptive Bitrate Controller Tuning
export const ADAPTATION_CONFIG = {
  EMA_ALPHA_LOSS: 0.4,            // Loss smoothing weight (0.4 current, 0.6 history)
  EMA_BETA_RTT: 0.3,              // RTT smoothing weight (0.3 current, 0.7 history)
  EMA_GAMMA_JITTER: 0.3,          // Jitter smoothing weight
  EMA_DELTA_CONCEALMENT: 0.3,     // Concealment smoothing weight
  DOWNGRADE_TICKS_REQUIRED: 1,    // 1 tick (1000ms) for immediate downgrade
  UPGRADE_TICKS_REQUIRED: 4,      // 4 consecutive healthy ticks (4000ms) for upgrade
  UPGRADE_COOLDOWN_MS: 3000,      // 3s minimum interval between upward adjustments
  SAMPLE_WINDOW_MIN_PACKETS: 8    // Minimum packets in tick to evaluate loss
};

// Seamless ICE Reconnect Configuration
export const ICE_RECONNECT_CONFIG = {
  MAX_RETRY_ATTEMPTS: 5,
  BACKOFF_DELAYS_MS: [1000, 2000, 4000, 6000, 8000], // Total backoff ~21s
  GRACE_PERIOD_MS: 1500,                              // 1.5s grace before ICE restart
  TOTAL_WATCHDOG_TIMEOUT_MS: 25000                   // 25s total reconnect timeout
};

// Dynamic Bitrate Adaptation Legacy Thresholds (maintained for backwards compatibility)
export const BITRATE_ADAPTATION = {
  HIGH_LOSS_THRESHOLD: 0.12,    // ≥12% packet loss → emergency drop to 6kbps
  MID_LOSS_THRESHOLD: 0.05,     // ≥5% packet loss → step down to 8kbps
  RECOVERY_LOSS_THRESHOLD: 0.01,// <1% packet loss & RTT <200ms → restore to 16kbps
  MIN_BITRATE_BPS: 6000,        // Minimum bitrate (6 kbps)
  MID_BITRATE_BPS: 8000,        // Mid-tier bitrate (8 kbps)
  MAX_BITRATE_BPS: 16000        // Maximum bitrate (16 kbps)
};

// Timing Constants (in milliseconds) - Optimized for low-bandwidth and high-latency networks
export const TIMINGS = {
  OUTGOING_CALL_TIMEOUT_MS: 30000, // 30s no-answer timeout
  INCOMING_CALL_TIMEOUT_MS: 45000, // 45s ringing timeout before auto-decline
  STATS_POLL_INTERVAL_MS: 1000,    // 1s WebRTC telemetry polling
  RATE_LIMIT_WINDOW_MS: 5000,      // 5s rate limit between incoming calls (spam prevention)
  MAX_RETRY_ATTEMPTS: 5,           // Max peer ID collision retry count
  MAX_LOG_ENTRIES: 50,             // Max entries in activity log (bounded buffer)
  MAX_RECENT_CALLS: 10,            // Max stored recent contacts
  DISCONNECT_WATCHDOG_MS: 25000    // 25s total reconnection watchdog budget
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
  good: '🟢 Good',      // RTT < 150ms
  fair: '🟡 Fair',      // RTT 150-400ms
  poor: '🔴 Poor'       // RTT ≥ 400ms
};

// LocalStorage Keys for persistence
export const STORAGE_KEYS = {
  THEME: 'secure_voice_theme',
  RECENT_CALLS: 'secure_voice_recent_calls',
  PREFERRED_INPUT: 'securevoice_preferred_input_id',
  PREFERRED_OUTPUT: 'securevoice_output_mode'
};
