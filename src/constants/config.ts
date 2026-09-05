import { ExtendedLadderTier } from '../types';

export const APP_NAME = 'SecureVoice';
export const APP_VERSION = 'v3.6.3';

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
      username: (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TURN_USERNAME) || 'openrelayproject',
      credential: (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TURN_CREDENTIAL) || 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TURN_USERNAME) || 'openrelayproject',
      credential: (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TURN_CREDENTIAL) || 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TURN_USERNAME) || 'openrelayproject',
      credential: (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TURN_CREDENTIAL) || 'openrelayproject'
    }
  ]
};

// Character set for generating readable 9-character Peer IDs (omits confusing 0/O, 1/I, L)
export const PEER_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Opus Codec & Packetization Constraints (Highest Quality-per-Bit Wideband Engine)
export const OPUS_CONFIG = {
  MAX_AVERAGE_BITRATE: '14000', // 14 kbps Pareto optimal bitrate (Wideband HD at ~1.5 KB/s)
  MIN_AVERAGE_BITRATE: '3200',  // 3.2 kbps ultra-survival bandwidth floor
  HIGH_AVERAGE_BITRATE: '18000', // 18 kbps maximum ceiling
  USE_DTX: '1',                 // Discontinuous Transmission (saves ~50% bandwidth during pauses)
  USE_INBAND_FEC: '1',          // Opus In-band Forward Error Correction
  PACKET_LOSS_PERC: '20',       // Expected packet loss target for FEC tuning
  STEREO: '0',                  // Mono voice optimization (1 channel)
  CBR: '0',                     // Variable Bit Rate (VBR) for maximum acoustic efficiency
  MAX_PLAYBACK_RATE: '16000',   // 16 kHz Wideband HD limit (reproduces crisp consonants & vocal warmth)
  SPROP_MAX_CAPTURE_RATE: '16000', // Capture rate matching playback rate
  BANDWIDTH_CAP_KBPS: 18,       // SDP b=AS session bandwidth constraint
  PTIME: '40',                  // 40ms packetization (reduces IP/RTP packet header overhead by 50%)
  MAX_PTIME: '60',              // 60ms maximum acceptable packetization time
  RED_PAYLOAD_TYPE: 63,         // RFC 2198 RED dynamic payload type
  ENABLE_RED: true              // RFC 2198 RED redundancy enabled by default
};

// Google Lyra v2 Neural Speech Codec Configuration (SoundStream / LyraGAN Architecture)
export const LYRA_CONFIG = {
  DEFAULT_BITRATE: 3200 as const,      // 3.2 kbps default (8 bytes per 20ms frame -> ~0.84 kB/s total network rate)
  SAMPLE_RATE: 16000,                  // 16 kHz speech domain
  FRAME_SIZE_SAMPLES: 320,             // 20ms at 16 kHz (320 samples per frame)
  FRAME_DURATION_MS: 20,               // 20ms frame duration
  MODEL_PATH: '/models/lyra/',         // Path to quantized weights & WASM assets
  HEADER_BYTE_MAGIC: 0x4C,             // ASCII 'L' identifier for Lyra frames in RTP payloads
  SUPPORTED_BITRATES: [3200, 6000, 9200] as const,
  BYTES_PER_FRAME: {
    3200: 8,                           // 8 bytes per 20ms = 3.2 kbps
    6000: 15,                          // 15 bytes per 20ms = 6.0 kbps
    9200: 23                           // 23 bytes per 20ms = 9.2 kbps
  } as const
};

// Codec crossover — tuned for throttled mobile (Jio post-cap, 64 kbps ceiling).
// Lyra v2 is the primary codec. Opus only activates on consistently clean links.
// The 14 kbps threshold keeps Lyra engaged across the full throttled range.
export const CODEC_CROSSOVER_CONFIG = {
  CROSSOVER_BITRATE_BPS: 14000,           // 14 kbps boundary — Lyra below, Opus above
  DOWNGRADE_TO_LYRA_LOSS_THRESHOLD: 0.05, // > 5% packet loss → stay/return to Lyra
  DOWNGRADE_TO_LYRA_RTT_MS: 380,          // > 380ms RTT → stay/return to Lyra
  DOWNGRADE_TO_LYRA_JITTER_MS: 65,        // > 65ms jitter → stay/return to Lyra
  UPGRADE_TO_OPUS_CONSECUTIVE_TICKS: 8,   // 8 consecutive healthy ticks (8s) before Opus
  UPGRADE_TO_OPUS_MAX_LOSS: 0.01,         // < 1% loss sustained before Opus elevation
  UPGRADE_TO_OPUS_MAX_RTT_MS: 180,        // < 180ms RTT sustained before Opus elevation
  UPGRADE_TO_OPUS_MAX_JITTER_MS: 30       // < 30ms jitter sustained before Opus elevation
};

// 6-Tier 2G/Satellite Survival Ladder Configuration (Constant Latency Profile)
export const LADDER_TIERS = [
  {
    id: 0,
    name: 'HQ',
    label: '2G Stable',
    maxBitrateBps: 8000,
    bandwidthCapKbps: 10,
    ptimeMs: 40,
    maxPtimeMs: 60,
    fecPacketLossPerc: 15,
    maxPlaybackRate: 16000,
    lossThreshold: 0.03,          // < 3% loss
    rttThresholdMs: 250,          // < 250ms RTT
    jitterThresholdMs: 40,        // < 40ms jitter
    concealmentThreshold: 0.02    // < 2% concealment
  },
  {
    id: 1,
    name: 'STD',
    label: '2G Normal',
    maxBitrateBps: 6500,
    bandwidthCapKbps: 8,
    ptimeMs: 40,
    maxPtimeMs: 80,
    fecPacketLossPerc: 20,
    maxPlaybackRate: 16000,
    lossThreshold: 0.08,          // 3% - 8% loss
    rttThresholdMs: 400,          // 250ms - 400ms RTT
    jitterThresholdMs: 70,        // 40ms - 70ms jitter
    concealmentThreshold: 0.05    // 2% - 5% concealment
  },
  {
    id: 2,
    name: 'LB',
    label: '2G Congested',
    maxBitrateBps: 5200,
    bandwidthCapKbps: 7,
    ptimeMs: 60,
    maxPtimeMs: 100,
    fecPacketLossPerc: 30,
    maxPlaybackRate: 16000,
    lossThreshold: 0.15,          // 8% - 15% loss
    rttThresholdMs: 600,          // 400ms - 600ms RTT
    jitterThresholdMs: 120,       // 70ms - 120ms jitter
    concealmentThreshold: 0.08    // 5% - 8% concealment
  },
  {
    id: 3,
    name: 'HL',
    label: '2G High Loss',
    maxBitrateBps: 4500,
    bandwidthCapKbps: 6,
    ptimeMs: 80,
    maxPtimeMs: 120,
    fecPacketLossPerc: 45,
    maxPlaybackRate: 8000,
    lossThreshold: 0.25,          // 15% - 25% loss
    rttThresholdMs: 850,          // 600ms - 850ms RTT
    jitterThresholdMs: 200,       // 120ms - 200ms jitter
    concealmentThreshold: 0.15    // 8% - 15% concealment
  },
  {
    id: 4,
    name: 'EXT',
    label: '2G Survival',
    maxBitrateBps: 3800,
    bandwidthCapKbps: 5,
    ptimeMs: 80,
    maxPtimeMs: 120,
    fecPacketLossPerc: 50,
    maxPlaybackRate: 8000,        // Narrowband SILK focus
    lossThreshold: 0.35,          // 25% - 35% loss
    rttThresholdMs: 1100,         // 850ms - 1100ms RTT
    jitterThresholdMs: 250,       // 200ms - 250ms jitter
    concealmentThreshold: 0.20    // 15% - 20% concealment
  },
  {
    id: 5,
    name: 'ULTRA',
    label: 'Satellite 3.2kbps',
    maxBitrateBps: 3200,
    bandwidthCapKbps: 4,
    ptimeMs: 100,
    maxPtimeMs: 120,
    fecPacketLossPerc: 50,
    maxPlaybackRate: 8000,        // 8kHz SILK narrowband telephone speech
    lossThreshold: 1.0,           // > 35% loss
    rttThresholdMs: 99999,        // > 1100ms RTT
    jitterThresholdMs: 99999,     // > 250ms jitter
    concealmentThreshold: 1.0     // > 20% concealment
  }
];

// Extended 9-Tier Survival & Wideband Bitrate Ladder
export const EXTENDED_BITRATE_LADDER: ExtendedLadderTier[] = [
  {
    id: 0,
    name: 'ULTRA_LOW',
    label: 'Emergency 1.2kbps',
    maxBitrateBps: 1200,
    bandwidthCapKbps: 3,
    ptimeMs: 120,
    maxPtimeMs: 120,
    fecPacketLossPerc: 50,
    maxPlaybackRate: 8000,
    lossThreshold: 0.70,
    rttThresholdMs: 99999,
    jitterThresholdMs: 99999,
    concealmentThreshold: 0.50,
    codec: 'opus',
    mode: 'celt-only',
    description: 'Emergency survival mode for extreme 2G/Satellite high-loss links (>50% loss)'
  },
  {
    id: 1,
    name: 'EXTREME',
    label: 'Survival 2.4kbps',
    maxBitrateBps: 2400,
    bandwidthCapKbps: 4,
    ptimeMs: 100,
    maxPtimeMs: 120,
    fecPacketLossPerc: 50,
    maxPlaybackRate: 8000,
    lossThreshold: 0.50,
    rttThresholdMs: 1500,
    jitterThresholdMs: 350,
    concealmentThreshold: 0.35,
    codec: 'opus',
    mode: 'silk-only',
    description: 'Extreme packet loss survival profile (35-50% loss)'
  },
  {
    id: 2,
    name: 'ULTRA',
    label: 'Satellite 3.2kbps',
    maxBitrateBps: 3200,
    bandwidthCapKbps: 4,
    ptimeMs: 100,
    maxPtimeMs: 120,
    fecPacketLossPerc: 50,
    maxPlaybackRate: 8000,
    lossThreshold: 0.35,
    rttThresholdMs: 1100,
    jitterThresholdMs: 250,
    concealmentThreshold: 0.20,
    codec: 'opus',
    mode: 'silk-only',
    description: '2G / satellite standard survival tier'
  },
  {
    id: 3,
    name: 'EXT',
    label: '2G Survival 3.8kbps',
    maxBitrateBps: 3800,
    bandwidthCapKbps: 5,
    ptimeMs: 80,
    maxPtimeMs: 120,
    fecPacketLossPerc: 50,
    maxPlaybackRate: 8000,
    lossThreshold: 0.25,
    rttThresholdMs: 850,
    jitterThresholdMs: 200,
    concealmentThreshold: 0.15,
    codec: 'opus',
    mode: 'silk-only',
    description: 'Congested 2G cell edge'
  },
  {
    id: 4,
    name: 'HL',
    label: '2G High Loss 4.5kbps',
    maxBitrateBps: 4500,
    bandwidthCapKbps: 6,
    ptimeMs: 80,
    maxPtimeMs: 120,
    fecPacketLossPerc: 45,
    maxPlaybackRate: 8000,
    lossThreshold: 0.15,
    rttThresholdMs: 600,
    jitterThresholdMs: 120,
    concealmentThreshold: 0.08,
    codec: 'opus',
    mode: 'silk-only',
    description: 'Elevated loss 2G tier'
  },
  {
    id: 5,
    name: 'LB',
    label: '2G Congested 5.2kbps',
    maxBitrateBps: 5200,
    bandwidthCapKbps: 7,
    ptimeMs: 80,
    maxPtimeMs: 120,
    fecPacketLossPerc: 35,
    maxPlaybackRate: 8000,
    lossThreshold: 0.08,
    rttThresholdMs: 400,
    jitterThresholdMs: 70,
    concealmentThreshold: 0.05,
    codec: 'opus',
    mode: 'silk-only',
    description: '2G normal congested link'
  },
  {
    id: 6,
    name: 'STD',
    label: '2G Normal 6.5kbps',
    maxBitrateBps: 6500,
    bandwidthCapKbps: 8,
    ptimeMs: 60,
    maxPtimeMs: 100,
    fecPacketLossPerc: 25,
    maxPlaybackRate: 8000,
    lossThreshold: 0.03,
    rttThresholdMs: 250,
    jitterThresholdMs: 40,
    concealmentThreshold: 0.02,
    codec: 'opus',
    mode: 'silk-only',
    description: 'Standard voice quality'
  },
  {
    id: 7,
    name: 'HQ',
    label: '2G Stable 8.0kbps',
    maxBitrateBps: 8000,
    bandwidthCapKbps: 10,
    ptimeMs: 60,
    maxPtimeMs: 80,
    fecPacketLossPerc: 20,
    maxPlaybackRate: 8000,
    lossThreshold: 0.01,
    rttThresholdMs: 150,
    jitterThresholdMs: 25,
    concealmentThreshold: 0.01,
    codec: 'opus',
    mode: 'silk-only',
    description: 'High quality narrowband voice'
  },
  {
    id: 8,
    name: 'HQ_PLUS',
    label: 'Wideband HD 24kbps',
    maxBitrateBps: 24000,
    bandwidthCapKbps: 28,
    ptimeMs: 40,
    maxPtimeMs: 60,
    fecPacketLossPerc: 10,
    maxPlaybackRate: 16000,
    lossThreshold: 0.005,
    rttThresholdMs: 80,
    jitterThresholdMs: 15,
    concealmentThreshold: 0.005,
    codec: 'opus',
    mode: 'wideband',
    description: 'Premium wideband voice on high-speed broadband / 5G / Wi-Fi links'
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
  PREFERRED_OUTPUT: 'securevoice_output_mode',
  PREFERRED_CODEC: 'securevoice_preferred_codec'
};
