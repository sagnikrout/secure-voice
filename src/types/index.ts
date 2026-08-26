/**
 * SecureVoice Core Telecom & Network Type Definitions
 */

export interface OpusConfig {
  MAX_AVERAGE_BITRATE: string;
  MIN_AVERAGE_BITRATE: string;
  HIGH_AVERAGE_BITRATE: string;
  USE_DTX: string;
  USE_INBAND_FEC: string;
  PACKET_LOSS_PERC: string;
  STEREO: string;
  CBR: string;
  MAX_PLAYBACK_RATE: string;
  SPROP_MAX_CAPTURE_RATE: string;
  BANDWIDTH_CAP_KBPS: number;
  PTIME: string;
  MAX_PTIME: string;
  RED_PAYLOAD_TYPE: number;
  ENABLE_RED: boolean;
}

export interface LadderTier {
  id: number;
  name: string;
  label: string;
  maxBitrateBps: number;
  bandwidthCapKbps: number;
  ptimeMs: number;
  maxPtimeMs: number;
  fecPacketLossPerc: number;
  maxPlaybackRate: number;
  lossThreshold: number;
  rttThresholdMs: number;
  jitterThresholdMs: number;
  concealmentThreshold: number;
}

export interface TelemetrySnapshot {
  timestamp: number;
  rttMs: number | null;
  rttSeconds: number | null;
  inboundLossRate: number;
  outboundLossRate: number;
  effectiveLossRate: number;
  jitterMs: number;
  avgJitterBufferDelayMs: number;
  concealmentRatio: number;
  audioLevel: number;
  candidateType: string;
  protocol: string;
  availableOutgoingBitrate: number | null;
  totalPacketsLost: number;
  totalPacketsReceived: number;
  bytesReceived: number;
  bytesSent: number;
  packetsSent: number;
}

export interface AdaptiveBitrateEvaluation {
  currentTier: LadderTier;
  targetBitrateBps: number;
  tierChanged: boolean;
  reason: string;
  consecutiveHealthyTicks: number;
}

export interface IceReconnectConfig {
  MAX_RETRY_ATTEMPTS: number;
  BACKOFF_DELAYS_MS: number[];
  GRACE_PERIOD_MS: number;
  TOTAL_WATCHDOG_TIMEOUT_MS: number;
}

export interface DenoisePipelineNodes {
  source: MediaStreamAudioSourceNode;
  highPass: BiquadFilterNode;
  presenceEQ: BiquadFilterNode;
  hissCut: BiquadFilterNode;
  noiseGateGain: GainNode;
  analyser: AnalyserNode;
  gateAnalyser: AnalyserNode;
  compressor: DynamicsCompressorNode;
  makeupGain: GainNode;
  dest: MediaStreamAudioDestinationNode;
}

export interface DenoisePipelineResult {
  processedStream: MediaStream;
  audioCtx: AudioContext | null;
  nodes: DenoisePipelineNodes | null;
  cleanup: () => void;
}

export interface CallHistoryItem {
  id: string;
  peerId: string;
  timestamp: number;
  direction?: 'incoming' | 'outgoing';
  duration?: number;
}

export interface AudioResourceManagerStats {
  trackedContexts: number;
  trackedNodes: number;
  trackedStreams: number;
  trackedTracks: number;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface IceFailureRecord {
  timestamp: number;
  reason: string;
  stackTrace?: string;
  attempt?: number;
}

export interface CircuitBreakerOptions {
  circuitBreakerThreshold?: number;
  circuitBreakerResetTime?: number;
  failureWindowMs?: number;
}

export interface PacketPacerMetrics {
  bufferOccupancy?: number;
  rtt?: number;
  loss?: number;
  jitter?: number;
  concealmentRatio?: number;
}

export interface StructuredLogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'ok';
  event: string;
  sessionId?: string;
  peerId?: string;
  data?: Record<string, any>;
  msg?: string;
}

export interface StructuredLoggerOptions {
  maxEntries?: number;
  persistKey?: string;
  enableSessionStorage?: boolean;
  onLog?: (entry: StructuredLogEntry) => void;
}

export interface ExtendedLadderTier extends LadderTier {
  codec?: 'opus' | 'silk' | 'celt';
  mode?: 'celt-only' | 'silk-only' | 'hybrid' | 'wideband';
  description?: string;
  targetLossMax?: number;
}

export interface AuditoryToneConfig {
  frequency: number | number[];
  durationMs: number;
  intervalMs?: number;
  type?: OscillatorType;
  gain?: number;
}

export type CallAudioCue = 'ringing' | 'connected' | 'disconnected' | 'busy' | 'reconnecting' | 'verified';

export type CodecType = 'opus' | 'lyra';

export type CodecPreference = 'auto' | 'lyra' | 'opus';

export type LyraBitrate = 3200 | 6000 | 9200;

export interface LyraConfig {
  DEFAULT_BITRATE: LyraBitrate;
  SAMPLE_RATE: number;
  FRAME_SIZE_SAMPLES: number;
  FRAME_DURATION_MS: number;
  MODEL_PATH: string;
  HEADER_BYTE_MAGIC: number;
  SUPPORTED_BITRATES: LyraBitrate[];
  BYTES_PER_FRAME: Record<LyraBitrate, number>;
}

export interface LyraStats {
  activeCodec: CodecType;
  bitrateBps: number;
  framesEncoded: number;
  framesDecoded: number;
  plcFramesSynthesized: number;
  rawBandwidthKbps: number;
  simdSupported: boolean;
  workerActive: boolean;
}

export interface LyraWorkerMessage {
  type: 'init' | 'encode' | 'decode' | 'plc' | 'set_bitrate' | 'reset';
  payload?: any;
  seq?: number;
}

export interface LyraWorkerResponse {
  type: 'init_done' | 'encoded_frame' | 'decoded_pcm' | 'plc_pcm' | 'error';
  payload?: any;
  seq?: number;
  error?: string;
}
