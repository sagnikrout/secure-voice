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
