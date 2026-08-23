/**
 * Network Quality Telemetry Monitor & Adaptive Bitrate Controller
 * 
 * Provides:
 * - NetworkTelemetryMonitor: 1000ms high-frequency multi-dimensional WebRTC stats sampling.
 * - AdaptiveBitrateController: 5-tier asymmetric hysteresis ladder with EMA smoothing.
 * - applySenderBitrate: Utility to configure RTCRtpSender encoding parameters.
 */

import { LADDER_TIERS, ADAPTATION_CONFIG, TIMINGS } from '../constants/config';
import { applySenderBitrate } from './webrtc';

export { applySenderBitrate };

/**
 * High-Frequency Multi-Dimensional WebRTC Telemetry Monitor
 */
export class NetworkTelemetryMonitor {
  pc: any;
  onSnapshot?: (snapshot: any) => void;
  intervalMs: number;
  minPackets: number;
  timerId: any;
  isRunning: boolean;
  prevStats: {
    timestamp: number;
    packetsLost: number;
    packetsReceived: number;
    concealedSamples: number;
    totalSamplesReceived: number;
    jitterBufferDelay: number;
    jitterBufferEmittedCount: number;
    bytesReceived: number;
    bytesSent: number;
  };

  constructor(pc: any, onSnapshot?: (snapshot: any) => void, options: any = {}) {
    this.pc = pc;
    this.onSnapshot = onSnapshot;
    this.intervalMs = options.intervalMs || TIMINGS.STATS_POLL_INTERVAL_MS || 1000;
    this.minPackets = options.minPackets !== undefined ? options.minPackets : (ADAPTATION_CONFIG.SAMPLE_WINDOW_MIN_PACKETS || 8);
    this.timerId = null;
    this.isRunning = false;

    // Previous sample baseline for delta computation
    this.prevStats = {
      timestamp: 0,
      packetsLost: 0,
      packetsReceived: 0,
      concealedSamples: 0,
      totalSamplesReceived: 0,
      jitterBufferDelay: 0,
      jitterBufferEmittedCount: 0,
      bytesReceived: 0,
      bytesSent: 0
    };
  }

  /**
   * Start periodic stats polling
   * @param {number} [intervalMs] - Optional override interval
   */
  start(intervalMs?: number) {
    if (intervalMs) {
      this.intervalMs = intervalMs;
    }
    if (this.isRunning && this.timerId) {
      return;
    }
    this.isRunning = true;
    this.timerId = setInterval(() => {
      this.sample();
    }, this.intervalMs);
  }

  /**
   * Stop stats polling
   */
  stop() {
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Perform a single telemetry sample
   * @returns {Promise<Object|null>} Snapshot object
   */
  async sample() {
    if (!this.pc || typeof this.pc.getStats !== 'function') {
      return null;
    }

    try {
      const stats = await this.pc.getStats();
      const now = Date.now();

      let rttMs = null;
      let availableOutgoingBitrate = null;
      let candidateType = 'host';
      let protocol = 'udp';

      let currentPacketsLost = 0;
      let currentPacketsReceived = 0;
      let jitterMs = 0;
      let currentJitterBufferDelay = 0;
      let currentJitterBufferEmittedCount = 0;
      let currentConcealedSamples = 0;
      let currentTotalSamplesReceived = 0;
      let audioLevel = 0;
      let bytesReceived = 0;

      let outboundLossRate = 0;
      let remoteRttMs = null;
      let remoteJitterMs = 0;

      let bytesSent = 0;
      let packetsSent = 0;

      if (stats && typeof stats.forEach === 'function') {
        stats.forEach(report => {
          if (!report) return;

          // 1. Candidate Pair (RTT, available bandwidth)
          if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated)) {
            if (report.currentRoundTripTime !== undefined && report.currentRoundTripTime !== null && !isNaN(report.currentRoundTripTime)) {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }
            if (report.availableOutgoingBitrate) {
              availableOutgoingBitrate = report.availableOutgoingBitrate;
            }
          }

          // 2. Candidate Type & Protocol
          if (report.type === 'remote-candidate' || report.type === 'local-candidate') {
            if (report.candidateType) candidateType = report.candidateType;
            if (report.protocol) protocol = report.protocol.toLowerCase();
          }

          // 3. Inbound RTP (Downlink audio)
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            currentPacketsLost = Number(report.packetsLost) || 0;
            currentPacketsReceived = Number(report.packetsReceived) || 0;
            bytesReceived = Number(report.bytesReceived) || 0;
            if (report.jitter !== undefined && report.jitter !== null && !isNaN(report.jitter)) {
              jitterMs = Math.round(report.jitter * 1000);
            }
            if (report.jitterBufferDelay !== undefined && report.jitterBufferDelay !== null) {
              currentJitterBufferDelay = Number(report.jitterBufferDelay) || 0;
            }
            if (report.jitterBufferEmittedCount !== undefined && report.jitterBufferEmittedCount !== null) {
              currentJitterBufferEmittedCount = Number(report.jitterBufferEmittedCount) || 0;
            }
            currentConcealedSamples = Number(report.concealedSamples) || 0;
            currentTotalSamplesReceived = Number(report.totalSamplesReceived) || 0;
            if (report.audioLevel !== undefined && report.audioLevel !== null && !isNaN(report.audioLevel)) {
              audioLevel = report.audioLevel;
            }
          }

          // 4. Outbound RTP (Uplink audio)
          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            bytesSent = Number(report.bytesSent) || 0;
            packetsSent = Number(report.packetsSent) || 0;
          }

          // 5. Remote Inbound RTP (RTCP Receiver Reports - Uplink loss from remote peer)
          if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
            if (report.fractionLost !== undefined && report.fractionLost !== null && !isNaN(report.fractionLost)) {
              outboundLossRate = Math.max(0, Math.min(1.0, report.fractionLost / 256));
            }
            if (report.roundTripTime !== undefined && report.roundTripTime !== null && !isNaN(report.roundTripTime)) {
              remoteRttMs = Math.round(report.roundTripTime * 1000);
            }
            if (report.jitter !== undefined && report.jitter !== null && !isNaN(report.jitter)) {
              remoteJitterMs = Math.round(report.jitter * 1000);
            }
          }
        });
      }

      // Compute interval deltas with rollover/reset safety
      let deltaLost = 0;
      let deltaReceived = 0;
      if (currentPacketsLost < this.prevStats.packetsLost || currentPacketsReceived < this.prevStats.packetsReceived) {
        // Counter reset / rollover occurred
        deltaLost = 0;
        deltaReceived = 0;
      } else {
        deltaLost = Math.max(0, currentPacketsLost - this.prevStats.packetsLost);
        deltaReceived = Math.max(0, currentPacketsReceived - this.prevStats.packetsReceived);
      }

      const totalPackets = deltaLost + deltaReceived;
      const inboundLossRate = totalPackets >= this.minPackets
        ? Math.max(0, Math.min(1.0, deltaLost / totalPackets))
        : 0;

      // Concealment ratio calculation
      let deltaConcealed = 0;
      let deltaSamples = 0;
      if (currentTotalSamplesReceived < this.prevStats.totalSamplesReceived) {
        deltaConcealed = 0;
        deltaSamples = 0;
      } else {
        deltaConcealed = Math.max(0, currentConcealedSamples - this.prevStats.concealedSamples);
        deltaSamples = Math.max(0, currentTotalSamplesReceived - this.prevStats.totalSamplesReceived);
      }
      const concealmentRatio = deltaSamples > 0
        ? Math.max(0, Math.min(1.0, deltaConcealed / deltaSamples))
        : 0;

      // Average jitter buffer delay in milliseconds
      let avgJitterBufferDelayMs = 0;
      const deltaDelay = Math.max(0, currentJitterBufferDelay - this.prevStats.jitterBufferDelay);
      const deltaEmitted = Math.max(0, currentJitterBufferEmittedCount - this.prevStats.jitterBufferEmittedCount);
      if (deltaEmitted > 0) {
        avgJitterBufferDelayMs = Math.round((deltaDelay / deltaEmitted) * 1000);
      } else if (currentJitterBufferEmittedCount > 0) {
        avgJitterBufferDelayMs = Math.round((currentJitterBufferDelay / currentJitterBufferEmittedCount) * 1000);
      }

      // Update baseline stats for next interval
      this.prevStats = {
        timestamp: now,
        packetsLost: currentPacketsLost,
        packetsReceived: currentPacketsReceived,
        concealedSamples: currentConcealedSamples,
        totalSamplesReceived: currentTotalSamplesReceived,
        jitterBufferDelay: currentJitterBufferDelay,
        jitterBufferEmittedCount: currentJitterBufferEmittedCount,
        bytesReceived,
        bytesSent
      };

      const finalRttMs = Number.isFinite(rttMs) ? rttMs : (Number.isFinite(remoteRttMs) ? remoteRttMs : 0);
      const finalInboundLoss = Number.isFinite(inboundLossRate) ? Math.max(0, Math.min(1.0, inboundLossRate)) : 0;
      const finalOutboundLoss = Number.isFinite(outboundLossRate) ? Math.max(0, Math.min(1.0, outboundLossRate)) : 0;
      const effectiveLossRate = Math.max(finalInboundLoss, finalOutboundLoss);
      const finalJitterMs = Number.isFinite(jitterMs) ? Math.max(0, jitterMs) : (Number.isFinite(remoteJitterMs) ? Math.max(0, remoteJitterMs) : 0);
      const finalDelayMs = Number.isFinite(avgJitterBufferDelayMs) ? Math.max(0, avgJitterBufferDelayMs) : 0;
      const finalConcealment = Number.isFinite(concealmentRatio) ? Math.max(0, Math.min(1.0, concealmentRatio)) : 0;
      const finalAudioLevel = Number.isFinite(audioLevel) ? Math.max(0, Math.min(1.0, audioLevel)) : 0;

      const snapshot = {
        timestamp: now,
        rttMs: finalRttMs,
        rttSeconds: finalRttMs / 1000,
        inboundLossRate: finalInboundLoss,
        outboundLossRate: finalOutboundLoss,
        effectiveLossRate,
        jitterMs: finalJitterMs,
        avgJitterBufferDelayMs: finalDelayMs,
        concealmentRatio: finalConcealment,
        audioLevel: finalAudioLevel,
        candidateType,
        protocol,
        availableOutgoingBitrate,
        totalPacketsLost: currentPacketsLost,
        totalPacketsReceived: currentPacketsReceived,
        bytesReceived,
        bytesSent,
        packetsSent
      };

      if (typeof this.onSnapshot === 'function') {
        try {
          this.onSnapshot(snapshot);
        } catch (callbackErr) {
          console.warn('NetworkTelemetryMonitor callback error:', callbackErr);
        }
      }

      return snapshot;
    } catch (err) {
      console.warn('NetworkTelemetryMonitor sample error:', err);
      return null;
    }
  }
}

/**
 * 5-Tier Adaptive Bitrate Controller with Asymmetric Hysteresis & EMA Smoothing
 */
export class AdaptiveBitrateController {
  tiers: any[];
  currentTierIndex: number;
  config: any;
  consecutiveHealthyTicks: number;
  lastUpgradeTime: number;
  smoothedLoss: number;
  smoothedRtt: number;
  smoothedJitter: number;
  smoothedConcealment: number;
  initialized: boolean;

  constructor(options: any = {}) {
    this.tiers = options.tiers || LADDER_TIERS;
    this.currentTierIndex = options.initialTierIndex !== undefined ? options.initialTierIndex : 0;
    this.config = { ...ADAPTATION_CONFIG, ...options.config };
    this.consecutiveHealthyTicks = 0;
    this.lastUpgradeTime = 0;

    // EMA smoothed states
    this.smoothedLoss = 0;
    this.smoothedRtt = 0;
    this.smoothedJitter = 0;
    this.smoothedConcealment = 0;
    this.initialized = false;
  }

  /**
   * Get the active tier object
   * @returns {Object}
   */
  getCurrentTier() {
    return this.tiers[this.currentTierIndex] || this.tiers[0];
  }

  /**
   * Evaluate a telemetry snapshot and decide whether to step tier up or down
   * @param {Object} snapshot - Telemetry snapshot from NetworkTelemetryMonitor
   * @returns {Object} Evaluation result
   */
  evaluate(snapshot) {
    if (!snapshot) {
      return {
        tierChanged: false,
        currentTier: this.getCurrentTier(),
        targetBitrateBps: this.getCurrentTier().maxBitrateBps,
        smoothedMetrics: {
          loss: this.smoothedLoss,
          rttMs: this.smoothedRtt,
          jitterMs: this.smoothedJitter,
          concealment: this.smoothedConcealment
        },
        consecutiveHealthyTicks: this.consecutiveHealthyTicks,
        reason: 'stable'
      };
    }

    const loss = Number.isFinite(snapshot.effectiveLossRate) ? Math.max(0, Math.min(1.0, snapshot.effectiveLossRate)) : 0;
    const rtt = Number.isFinite(snapshot.rttMs) ? Math.max(0, snapshot.rttMs) : 0;
    const jitter = Number.isFinite(snapshot.jitterMs) ? Math.max(0, snapshot.jitterMs) : 0;
    const concealment = Number.isFinite(snapshot.concealmentRatio) ? Math.max(0, Math.min(1.0, snapshot.concealmentRatio)) : 0;

    // 1. Initialize or update EMA smoothing
    if (!this.initialized) {
      this.smoothedLoss = loss;
      this.smoothedRtt = rtt;
      this.smoothedJitter = jitter;
      this.smoothedConcealment = concealment;
      this.initialized = true;
    } else {
      this.smoothedLoss = this.config.EMA_ALPHA_LOSS * loss + (1 - this.config.EMA_ALPHA_LOSS) * this.smoothedLoss;
      this.smoothedRtt = this.config.EMA_BETA_RTT * rtt + (1 - this.config.EMA_BETA_RTT) * this.smoothedRtt;
      this.smoothedJitter = this.config.EMA_GAMMA_JITTER * jitter + (1 - this.config.EMA_GAMMA_JITTER) * this.smoothedJitter;
      this.smoothedConcealment = this.config.EMA_DELTA_CONCEALMENT * concealment + (1 - this.config.EMA_DELTA_CONCEALMENT) * this.smoothedConcealment;
    }

    // 2. Determine target tier based on multi-metric worst-case thresholds for smoothed metrics
    let targetTierIndex = this.tiers.length - 1;
    for (let i = 0; i < this.tiers.length; i++) {
      const tier = this.tiers[i];
      if (
        this.smoothedLoss < tier.lossThreshold &&
        this.smoothedRtt < tier.rttThresholdMs &&
        this.smoothedJitter < tier.jitterThresholdMs &&
        this.smoothedConcealment < tier.concealmentThreshold
      ) {
        targetTierIndex = i;
        break;
      }
    }

    // Determine target tier for instantaneous / raw metrics
    let rawTargetTierIndex = this.tiers.length - 1;
    for (let i = 0; i < this.tiers.length; i++) {
      const tier = this.tiers[i];
      if (
        loss < tier.lossThreshold &&
        rtt < tier.rttThresholdMs &&
        jitter < tier.jitterThresholdMs &&
        concealment < tier.concealmentThreshold
      ) {
        rawTargetTierIndex = i;
        break;
      }
    }

    let tierChanged = false;
    const now = Date.now();
    let changeReason = 'stable';

    // 3. Asymmetric Hysteresis State Machine
    if (targetTierIndex > this.currentTierIndex) {
      // FAST 1-TICK DOWNGRADE
      const prevTier = this.getCurrentTier();
      this.currentTierIndex = targetTierIndex;
      this.consecutiveHealthyTicks = 0;
      tierChanged = true;
      changeReason = `Degradation detected (Loss: ${(this.smoothedLoss * 100).toFixed(1)}%, RTT: ${Math.round(this.smoothedRtt)}ms, Jitter: ${Math.round(this.smoothedJitter)}ms) -> Downgraded from ${prevTier.name} to ${this.getCurrentTier().name}`;
    } else if (targetTierIndex < this.currentTierIndex) {
      // Check if instantaneous metrics indicate active degradation
      if (rawTargetTierIndex >= this.currentTierIndex) {
        this.consecutiveHealthyTicks = 0;
      } else {
        // SLOW 4-TICK UPGRADE
        this.consecutiveHealthyTicks += 1;
        const cooldownElapsed = (now - this.lastUpgradeTime) >= this.config.UPGRADE_COOLDOWN_MS;

        if (this.consecutiveHealthyTicks >= this.config.UPGRADE_TICKS_REQUIRED && cooldownElapsed) {
          const prevTier = this.getCurrentTier();
          this.currentTierIndex -= 1; // Step up 1 tier
          this.consecutiveHealthyTicks = 0;
          this.lastUpgradeTime = now;
          tierChanged = true;
          changeReason = `Network recovery sustained for ${this.config.UPGRADE_TICKS_REQUIRED}s -> Upgraded from ${prevTier.name} to ${this.getCurrentTier().name}`;
        }
      }
    } else {
      // Metrics match current tier: reset healthy upgrade count
      this.consecutiveHealthyTicks = 0;
    }

    return {
      tierChanged,
      currentTier: this.getCurrentTier(),
      targetBitrateBps: this.getCurrentTier().maxBitrateBps,
      smoothedMetrics: {
        loss: this.smoothedLoss,
        rttMs: this.smoothedRtt,
        jitterMs: this.smoothedJitter,
        concealment: this.smoothedConcealment
      },
      consecutiveHealthyTicks: this.consecutiveHealthyTicks,
      reason: changeReason
    };
  }

  /**
   * Reset controller state
   * @param {number} [initialTierIndex=0]
   */
  reset(initialTierIndex = 0) {
    this.currentTierIndex = initialTierIndex;
    this.consecutiveHealthyTicks = 0;
    this.lastUpgradeTime = 0;
    this.smoothedLoss = 0;
    this.smoothedRtt = 0;
    this.smoothedJitter = 0;
    this.smoothedConcealment = 0;
    this.initialized = false;
  }
}
