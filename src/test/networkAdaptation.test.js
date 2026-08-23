import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NetworkTelemetryMonitor,
  AdaptiveBitrateController,
  applySenderBitrate
} from '../utils/networkAdaptation';
import { LADDER_TIERS, ADAPTATION_CONFIG } from '../constants/config';

/**
 * Factory creating a standard WebRTC RTCStatsReport Map
 * @param {Object} [overrides={}]
 * @returns {Map<string, Object>}
 */
export function createMockStatsReport(overrides = {}) {
  const reportMap = new Map();

  const candidatePair = {
    id: 'CP_1',
    type: 'candidate-pair',
    state: overrides.pairState || 'succeeded',
    nominated: true,
    currentRoundTripTime: overrides.rtt !== undefined ? overrides.rtt : 0.045, // 45ms
    availableOutgoingBitrate: overrides.availableOutgoingBitrate || 200000,
    bytesSent: overrides.bytesSent || 15000,
    bytesReceived: overrides.bytesReceived || 15000,
    localCandidateId: 'LC_1',
    remoteCandidateId: 'RC_1'
  };
  reportMap.set('CP_1', candidatePair);

  const localCandidate = {
    id: 'LC_1',
    type: 'local-candidate',
    candidateType: overrides.localCandidateType || 'host',
    protocol: overrides.protocol || 'udp',
    ip: '192.168.1.50',
    port: 54321
  };
  reportMap.set('LC_1', localCandidate);

  const remoteCandidate = {
    id: 'RC_1',
    type: 'remote-candidate',
    candidateType: overrides.remoteCandidateType || 'srflx',
    protocol: overrides.protocol || 'udp',
    ip: '203.0.113.10',
    port: 12345
  };
  reportMap.set('RC_1', remoteCandidate);

  const inboundRtp = {
    id: 'IT_1',
    type: 'inbound-rtp',
    kind: 'audio',
    ssrc: 1234567,
    packetsReceived: overrides.packetsReceived !== undefined ? overrides.packetsReceived : 500,
    packetsLost: overrides.packetsLost !== undefined ? overrides.packetsLost : 2,
    jitter: overrides.jitter !== undefined ? overrides.jitter : 0.005, // 5ms
    jitterBufferDelay: overrides.jitterBufferDelay !== undefined ? overrides.jitterBufferDelay : 1.25,
    jitterBufferEmittedCount: overrides.jitterBufferEmittedCount !== undefined ? overrides.jitterBufferEmittedCount : 50,
    concealedSamples: overrides.concealedSamples !== undefined ? overrides.concealedSamples : 48,
    totalSamplesReceived: overrides.totalSamplesReceived !== undefined ? overrides.totalSamplesReceived : 4800,
    concealmentEvents: overrides.concealmentEvents !== undefined ? overrides.concealmentEvents : 1,
    audioLevel: overrides.audioLevel !== undefined ? overrides.audioLevel : 0.42,
    bytesReceived: overrides.bytesReceived || 15000
  };
  reportMap.set('IT_1', inboundRtp);

  if (overrides.hasRemoteInbound !== false) {
    const remoteInboundRtp = {
      id: 'RIT_1',
      type: 'remote-inbound-rtp',
      kind: 'audio',
      ssrc: 7654321,
      fractionLost: overrides.remoteFractionLost !== undefined ? overrides.remoteFractionLost : 0, // 0-255
      packetsLost: overrides.remotePacketsLost !== undefined ? overrides.remotePacketsLost : 0,
      roundTripTime: overrides.remoteRtt !== undefined ? overrides.remoteRtt : 0.045,
      jitter: overrides.remoteJitter !== undefined ? overrides.remoteJitter : 0.005
    };
    reportMap.set('RIT_1', remoteInboundRtp);
  }

  const outboundRtp = {
    id: 'OT_1',
    type: 'outbound-rtp',
    kind: 'audio',
    ssrc: 7654321,
    bytesSent: overrides.outboundBytesSent || 12000,
    packetsSent: overrides.outboundPacketsSent || 490,
    targetBitrate: overrides.targetBitrate || 14000
  };
  reportMap.set('OT_1', outboundRtp);

  return reportMap;
}

describe('Network Quality Adaptation Engine (src/test/networkAdaptation.test.js)', () => {
  let mockPc;

  beforeEach(() => {
    mockPc = {
      getStats: vi.fn().mockResolvedValue(createMockStatsReport())
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // SUITE 1: RTCStatsReport Parsing & Telemetry Extraction
  // -------------------------------------------------------------
  describe('1. Telemetry Extraction & Metric Computation', () => {
    it('extracts all baseline metrics accurately from full RTCStatsReport', async () => {
      const monitor = new NetworkTelemetryMonitor(mockPc);
      const snapshot = await monitor.sample();

      expect(snapshot).toBeDefined();
      expect(snapshot.rttMs).toBe(45);
      expect(snapshot.rttSeconds).toBe(0.045);
      expect(snapshot.jitterMs).toBe(5);
      expect(snapshot.candidateType).toBe('srflx');
      expect(snapshot.protocol).toBe('udp');
      expect(snapshot.audioLevel).toBe(0.42);
      expect(snapshot.totalPacketsLost).toBe(2);
      expect(snapshot.totalPacketsReceived).toBe(500);
    });

    it('computes differential inbound packet loss rate across consecutive polling ticks', async () => {
      const monitor = new NetworkTelemetryMonitor(mockPc);

      // Tick 1: Baseline sample
      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ packetsLost: 10, packetsReceived: 100 }));
      await monitor.sample();

      // Tick 2: 10 new lost packets, 90 new received packets (deltaLost=10, deltaReceived=90 -> total=100 -> loss=10%)
      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ packetsLost: 20, packetsReceived: 190 }));
      const snapshot2 = await monitor.sample();

      expect(snapshot2.inboundLossRate).toBeCloseTo(0.10, 3);
      expect(snapshot2.effectiveLossRate).toBeCloseTo(0.10, 3);
    });

    it('handles zero-packet intervals gracefully without division by zero (returns 0.0 loss)', async () => {
      const monitor = new NetworkTelemetryMonitor(mockPc);

      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ packetsLost: 10, packetsReceived: 100 }));
      await monitor.sample();

      // No new packets arriving
      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ packetsLost: 10, packetsReceived: 100 }));
      const snapshot = await monitor.sample();

      expect(snapshot.inboundLossRate).toBe(0.0);
    });

    it('handles WebRTC counter rollover or connection resets (negative deltas reset baseline safely)', async () => {
      const monitor = new NetworkTelemetryMonitor(mockPc);

      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ packetsLost: 500, packetsReceived: 10000 }));
      await monitor.sample();

      // Reset occurred on peer connection
      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ packetsLost: 2, packetsReceived: 50 }));
      const snapshot = await monitor.sample();

      expect(snapshot.inboundLossRate).toBe(0.0);
      expect(Number.isNaN(snapshot.inboundLossRate)).toBe(false);
    });

    it('extracts remote-inbound-rtp (RTCP Receiver Report) fractional loss (fractionLost / 256)', async () => {
      const monitor = new NetworkTelemetryMonitor(mockPc);

      // Remote fractionLost = 64 (64/256 = 0.25 -> 25% uplink loss)
      mockPc.getStats.mockResolvedValue(createMockStatsReport({ remoteFractionLost: 64 }));
      const snapshot = await monitor.sample();

      expect(snapshot.outboundLossRate).toBeCloseTo(0.25, 3);
      expect(snapshot.effectiveLossRate).toBeCloseTo(0.25, 3);
    });

    it('computes average jitter buffer delay in milliseconds from cumulative counters', async () => {
      const monitor = new NetworkTelemetryMonitor(mockPc);

      // Tick 1: delay=1.0s, emitted=50 (20ms)
      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ jitterBufferDelay: 1.0, jitterBufferEmittedCount: 50 }));
      await monitor.sample();

      // Tick 2: delay=1.6s, emitted=70 (deltaDelay=0.6s, deltaEmitted=20 -> avgDelay = 30ms)
      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ jitterBufferDelay: 1.6, jitterBufferEmittedCount: 70 }));
      const snapshot = await monitor.sample();

      expect(snapshot.avgJitterBufferDelayMs).toBe(30);
    });

    it('computes sample concealment ratio from delta concealed samples and delta total samples', async () => {
      const monitor = new NetworkTelemetryMonitor(mockPc);

      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ concealedSamples: 100, totalSamplesReceived: 1000 }));
      await monitor.sample();

      // deltaConcealed = 100, deltaTotal = 1000 -> 10%
      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ concealedSamples: 200, totalSamplesReceived: 2000 }));
      const snapshot = await monitor.sample();

      expect(snapshot.concealmentRatio).toBeCloseTo(0.10, 3);
    });

    it('detects transport candidate types (host, srflx, prflx, relay) and protocols (udp, tcp)', async () => {
      const monitor = new NetworkTelemetryMonitor(mockPc);

      mockPc.getStats.mockResolvedValueOnce(createMockStatsReport({ remoteCandidateType: 'relay', protocol: 'tcp' }));
      const snapshot = await monitor.sample();

      expect(snapshot.candidateType).toBe('relay');
      expect(snapshot.protocol).toBe('tcp');
    });
  });

  // -------------------------------------------------------------
  // SUITE 2: NetworkTelemetryMonitor Polling Lifecycle
  // -------------------------------------------------------------
  describe('2. NetworkTelemetryMonitor Polling Lifecycle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts periodic polling at 1000ms intervals and invokes onSnapshot callback', async () => {
      const onSnapshot = vi.fn();
      const monitor = new NetworkTelemetryMonitor(mockPc, onSnapshot, { intervalMs: 1000 });

      monitor.start();
      expect(onSnapshot).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(onSnapshot).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      expect(onSnapshot).toHaveBeenCalledTimes(4);

      monitor.stop();
    });

    it('calling start() multiple times is idempotent without creating duplicate intervals', async () => {
      const onSnapshot = vi.fn();
      const monitor = new NetworkTelemetryMonitor(mockPc, onSnapshot, { intervalMs: 1000 });

      monitor.start();
      monitor.start();
      monitor.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(onSnapshot).toHaveBeenCalledTimes(1);

      monitor.stop();
    });

    it('calling stop() clears intervals and ceases all telemetry polling', async () => {
      const onSnapshot = vi.fn();
      const monitor = new NetworkTelemetryMonitor(mockPc, onSnapshot, { intervalMs: 1000 });

      monitor.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(onSnapshot).toHaveBeenCalledTimes(2);

      monitor.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(onSnapshot).toHaveBeenCalledTimes(2);
    });

    it('handles pc.getStats() promise rejections gracefully without unhandled crashes', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockPc.getStats.mockRejectedValue(new Error('InvalidStateError: PeerConnection closed'));

      const onSnapshot = vi.fn();
      const monitor = new NetworkTelemetryMonitor(mockPc, onSnapshot, { intervalMs: 1000 });

      monitor.start();
      await vi.advanceTimersByTimeAsync(1000);

      expect(onSnapshot).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      monitor.stop();
    });

    it('provides standalone .sample() method for one-off stats queries', async () => {
      const monitor = new NetworkTelemetryMonitor(mockPc);
      const snapshot = await monitor.sample();
      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------
  // SUITE 3: Exponential Moving Average (EMA) Smoothing
  // -------------------------------------------------------------
  describe('3. EMA Smoothing & Glitch Filtering', () => {
    it('calculates Exponential Moving Average accurately for loss (alpha=0.4) and RTT (beta=0.3)', () => {
      const controller = new AdaptiveBitrateController({ initialTierIndex: 0 });

      // Init tick: loss=0, RTT=50ms
      controller.evaluate({ effectiveLossRate: 0, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.smoothedLoss).toBe(0);
      expect(controller.smoothedRtt).toBe(50);

      // Tick 1: loss=10% -> 0.4 * 0.10 + 0.6 * 0 = 0.04 (4%)
      controller.evaluate({ effectiveLossRate: 0.10, rttMs: 100, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.smoothedLoss).toBeCloseTo(0.04, 4);
      expect(controller.smoothedRtt).toBeCloseTo(0.3 * 100 + 0.7 * 50, 4); // 65

      // Tick 2: loss=10% -> 0.4 * 0.10 + 0.6 * 0.04 = 0.064 (6.4%)
      controller.evaluate({ effectiveLossRate: 0.10, rttMs: 100, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.smoothedLoss).toBeCloseTo(0.064, 4);

      // Tick 3: loss=10% -> 0.4 * 0.10 + 0.6 * 0.064 = 0.0784 (7.84%)
      controller.evaluate({ effectiveLossRate: 0.10, rttMs: 100, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.smoothedLoss).toBeCloseTo(0.0784, 4);

      // Tick 4: loss=10% -> 0.4 * 0.10 + 0.6 * 0.0784 = 0.08704 (8.704%)
      controller.evaluate({ effectiveLossRate: 0.10, rttMs: 100, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.smoothedLoss).toBeCloseTo(0.08704, 4);
    });

    it('prevents single-sample transient spikes (glitches) from causing erratic ladder oscillation', () => {
      const controller = new AdaptiveBitrateController({ initialTierIndex: 0 }); // Tier 0 (HQ, loss < 0.02)

      // Start in clean state
      controller.evaluate({ effectiveLossRate: 0.0, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.getCurrentTier().name).toBe('HQ');

      // 1-sample 3% loss spike -> smoothedLoss = 0.4 * 0.03 + 0.6 * 0 = 0.012 (1.2% < 2% threshold)
      const res = controller.evaluate({ effectiveLossRate: 0.03, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });

      expect(res.tierChanged).toBe(false);
      expect(controller.getCurrentTier().name).toBe('HQ');
    });

    it('converges smoothly to new steady-state values during sustained network changes', () => {
      const controller = new AdaptiveBitrateController({ initialTierIndex: 0 });
      controller.evaluate({ effectiveLossRate: 0, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });

      // Sustained loss of 30% over 5 ticks
      controller.evaluate({ effectiveLossRate: 0.30, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.smoothedLoss).toBeCloseTo(0.12, 3);

      controller.evaluate({ effectiveLossRate: 0.30, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.smoothedLoss).toBeCloseTo(0.192, 3);

      controller.evaluate({ effectiveLossRate: 0.30, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.smoothedLoss).toBeCloseTo(0.2352, 3);

      controller.evaluate({ effectiveLossRate: 0.30, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.smoothedLoss).toBeCloseTo(0.26112, 3);

      controller.evaluate({ effectiveLossRate: 0.30, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.smoothedLoss).toBeCloseTo(0.27667, 3);
    });
  });

  // -------------------------------------------------------------
  // SUITE 4: 5-Tier Adaptation Ladder & Asymmetric Hysteresis
  // -------------------------------------------------------------
  describe('4. 5-Tier Adaptation Ladder & Asymmetric Hysteresis', () => {
    it('initializes at High Quality (Tier 0: HQ 20kbps) by default', () => {
      const controller = new AdaptiveBitrateController();
      expect(controller.getCurrentTier().id).toBe(0);
      expect(controller.getCurrentTier().name).toBe('HQ');
      expect(controller.getCurrentTier().maxBitrateBps).toBe(20000);
    });

    it('Fast Downgrade: downgrades immediately by 1 tier on 1st tick of degraded metrics', () => {
      const controller = new AdaptiveBitrateController({ initialTierIndex: 0 }); // Tier 0 (HQ)
      controller.evaluate({ effectiveLossRate: 0, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });

      // Tick: smoothedLoss jumps to 4.5% (exceeds Tier 0 threshold of 2%, fits Tier 1)
      const res = controller.evaluate({ effectiveLossRate: 0.1125, rttMs: 50, jitterMs: 10, concealmentRatio: 0 }); // 0.4 * 0.1125 = 0.045

      expect(res.tierChanged).toBe(true);
      expect(res.currentTier.name).toBe('STD');
      expect(res.currentTier.maxBitrateBps).toBe(14000);
    });

    it('Multi-Tier Emergency Downgrade: drops directly from HQ (Tier 0) to EXT (Tier 4) on catastrophic loss', () => {
      const controller = new AdaptiveBitrateController({ initialTierIndex: 0 });
      controller.evaluate({ effectiveLossRate: 0, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });

      // Catastrophic surge: 70% loss -> smoothedLoss = 28% (> 25% Tier 3 threshold) -> Tier 4 (EXT)
      const res = controller.evaluate({ effectiveLossRate: 0.70, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });

      expect(res.tierChanged).toBe(true);
      expect(res.currentTier.name).toBe('EXT');
      expect(res.currentTier.maxBitrateBps).toBe(6000);
    });

    it('Slow Upgrade: requires 4 consecutive clean ticks (4s) before upgrading by 1 tier', () => {
      const controller = new AdaptiveBitrateController({ initialTierIndex: 4 }); // In Tier 4 (EXT)
      controller.evaluate({ effectiveLossRate: 0.30, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });

      // Channel recovers completely (loss=0, RTT=40, jitter=5)
      const tick1 = controller.evaluate({ effectiveLossRate: 0, rttMs: 40, jitterMs: 5, concealmentRatio: 0 });
      expect(tick1.tierChanged).toBe(false);
      expect(tick1.consecutiveHealthyTicks).toBe(1);
      expect(controller.getCurrentTier().name).toBe('EXT');

      const tick2 = controller.evaluate({ effectiveLossRate: 0, rttMs: 40, jitterMs: 5, concealmentRatio: 0 });
      expect(tick2.tierChanged).toBe(false);
      expect(tick2.consecutiveHealthyTicks).toBe(2);

      const tick3 = controller.evaluate({ effectiveLossRate: 0, rttMs: 40, jitterMs: 5, concealmentRatio: 0 });
      expect(tick3.tierChanged).toBe(false);
      expect(tick3.consecutiveHealthyTicks).toBe(3);

      const tick4 = controller.evaluate({ effectiveLossRate: 0, rttMs: 40, jitterMs: 5, concealmentRatio: 0 });
      expect(tick4.tierChanged).toBe(true);
      expect(tick4.consecutiveHealthyTicks).toBe(0);
      expect(tick4.currentTier.name).toBe('HL'); // Upgraded 1 tier from EXT -> HL (7.5k)
    });

    it('Recovery Reset: any metric degradation during 4-tick recovery window immediately resets recovery count to 0', () => {
      const controller = new AdaptiveBitrateController({ initialTierIndex: 4 });
      controller.evaluate({ effectiveLossRate: 0.30, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });

      // 2 clean ticks
      controller.evaluate({ effectiveLossRate: 0, rttMs: 40, jitterMs: 5, concealmentRatio: 0 });
      controller.evaluate({ effectiveLossRate: 0, rttMs: 40, jitterMs: 5, concealmentRatio: 0 });
      expect(controller.consecutiveHealthyTicks).toBe(2);

      // Degradation spike occurs on tick 3
      controller.evaluate({ effectiveLossRate: 0.40, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });
      expect(controller.consecutiveHealthyTicks).toBe(0);

      // Next clean tick starts counter from 1 again
      controller.evaluate({ effectiveLossRate: 0, rttMs: 40, jitterMs: 5, concealmentRatio: 0 });
      expect(controller.consecutiveHealthyTicks).toBe(1);
      expect(controller.getCurrentTier().name).toBe('EXT');
    });

    it('Multi-Step Sequential Recovery: stepping from EXT (Tier 4) to HQ (Tier 0) requires 16 consecutive clean ticks', () => {
      vi.useFakeTimers();
      const controller = new AdaptiveBitrateController({ initialTierIndex: 4 });
      controller.evaluate({ effectiveLossRate: 0.30, rttMs: 50, jitterMs: 10, concealmentRatio: 0 });

      // Run 16 consecutive clean ticks with time advancing past cooldown
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(4000);
        for (let t = 0; t < 4; t++) {
          controller.evaluate({ effectiveLossRate: 0, rttMs: 40, jitterMs: 5, concealmentRatio: 0 });
        }
      }

      expect(controller.getCurrentTier().name).toBe('HQ');
      expect(controller.getCurrentTier().maxBitrateBps).toBe(20000);
      vi.useRealTimers();
    });

    it('Multi-Metric Dominance: triggers tier downgrade if ANY critical metric exceeds threshold (worst-case rule)', () => {
      const controller = new AdaptiveBitrateController({ initialTierIndex: 0 });

      // Case A: Loss is 0%, but RTT is 650ms (>500ms Tier 3 threshold) -> drops to Tier 3 (HL)
      const resA = controller.evaluate({ effectiveLossRate: 0, rttMs: 650, jitterMs: 10, concealmentRatio: 0 });
      expect(resA.currentTier.name).toBe('HL');

      controller.reset(0);
      // Case B: Loss is 0%, RTT is 50ms, but Jitter is 120ms (>100ms Tier 3 threshold) -> drops to Tier 3 (HL)
      const resB = controller.evaluate({ effectiveLossRate: 0, rttMs: 50, jitterMs: 120, concealmentRatio: 0 });
      expect(resB.currentTier.name).toBe('HL');

      controller.reset(0);
      // Case C: Loss is 0%, RTT is 50ms, Jitter is 5ms, but Concealment is 18% (>15% Tier 4 threshold) -> drops to Tier 4 (EXT)
      const resC = controller.evaluate({ effectiveLossRate: 0, rttMs: 50, jitterMs: 5, concealmentRatio: 0.18 });
      expect(resC.currentTier.name).toBe('EXT');
    });

    it('Remote-Inbound Loss Dominance: uplink congestion reported via RTCP RR triggers sender bitrate downgrade', () => {
      const controller = new AdaptiveBitrateController({ initialTierIndex: 0 });

      // Downlink loss is 0%, but outbound/uplink loss is 30% (effectiveLossRate = 0.30)
      const res = controller.evaluate({
        inboundLossRate: 0.0,
        outboundLossRate: 0.30,
        effectiveLossRate: 0.30,
        rttMs: 50,
        jitterMs: 5,
        concealmentRatio: 0
      });

      expect(res.tierChanged).toBe(true);
      expect(res.currentTier.name).toBe('EXT');
      expect(res.currentTier.maxBitrateBps).toBe(6000);
    });
  });

  // -------------------------------------------------------------
  // SUITE 5: Sender Parameter Application & Integration
  // -------------------------------------------------------------
  describe('5. RTCRtpSender Encoding Parameter Application', () => {
    it('applies new target bitrate to sender encodings and enforces high priority', async () => {
      const mockSender = {
        getParameters: vi.fn(() => ({
          encodings: [{ maxBitrate: 20000 }]
        })),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      const success = await applySenderBitrate(mockSender, 10000);
      expect(success).toBe(true);
      expect(mockSender.setParameters).toHaveBeenCalledWith({
        encodings: [{
          maxBitrate: 10000,
          priority: 'high',
          networkPriority: 'high'
        }]
      });
    });

    it('handles sender setParameters failures gracefully without crashing controller evaluation loop', async () => {
      const mockSender = {
        getParameters: vi.fn(() => ({
          encodings: [{ maxBitrate: 20000 }]
        })),
        setParameters: vi.fn().mockRejectedValue(new Error('InvalidModificationError'))
      };

      const success = await applySenderBitrate(mockSender, 10000);
      expect(success).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // SUITE 6: Pathological Edge Cases & Adversarial Robustness
  // -------------------------------------------------------------
  describe('6. Pathological Inputs & Adversarial Robustness', () => {
    it('handles empty RTCStatsReport (e.g. initial connection phase before RTP flow)', async () => {
      mockPc.getStats.mockResolvedValue(new Map());
      const monitor = new NetworkTelemetryMonitor(mockPc);

      const snapshot = await monitor.sample();
      expect(snapshot).toBeDefined();
      expect(snapshot.inboundLossRate).toBe(0);
      expect(snapshot.rttMs).toBe(0);

      const controller = new AdaptiveBitrateController({ initialTierIndex: 0 });
      const evalRes = controller.evaluate(snapshot);
      expect(evalRes.currentTier.name).toBe('HQ');
    });

    it('handles NaN, null, undefined, and Infinity in stats values without corrupting EMA or crashing', async () => {
      mockPc.getStats.mockResolvedValue(createMockStatsReport({
        rtt: NaN,
        jitter: Infinity,
        audioLevel: null,
        remoteFractionLost: undefined
      }));

      const monitor = new NetworkTelemetryMonitor(mockPc);
      const snapshot = await monitor.sample();

      expect(Number.isFinite(snapshot.rttMs)).toBe(true);
      expect(Number.isFinite(snapshot.jitterMs)).toBe(true);
      expect(Number.isFinite(snapshot.audioLevel)).toBe(true);

      const controller = new AdaptiveBitrateController();
      expect(() => controller.evaluate(snapshot)).not.toThrow();
    });

    it('controller .reset() restores initial tier (Tier 0/HQ), resets EMA filters and recovery counters', () => {
      const controller = new AdaptiveBitrateController({ initialTierIndex: 0 });
      controller.evaluate({ effectiveLossRate: 0.50, rttMs: 900, jitterMs: 200, concealmentRatio: 0.20 });
      expect(controller.getCurrentTier().name).toBe('ULTRA');

      controller.reset(0);
      expect(controller.getCurrentTier().name).toBe('HQ');
      expect(controller.smoothedLoss).toBe(0);
      expect(controller.consecutiveHealthyTicks).toBe(0);
      expect(controller.initialized).toBe(false);
    });
  });
});
