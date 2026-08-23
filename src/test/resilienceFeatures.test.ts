import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TurnRelayManager } from '../utils/turnManager';
import { JitterBufferController } from '../utils/jitterBufferController';
import { PacketPacer } from '../utils/packetPacer';
import { IceRestartManager } from '../utils/iceRestartManager';
import { LADDER_TIERS } from '../constants/config';

describe('Advanced Network Resilience Features', () => {
  describe('1. TurnRelayManager — Adaptive TURN Ranking & Forced Relay Fallback', () => {
    const mockIceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:turn-fast.example.com:443', username: 'user1', credential: 'pwd' },
      { urls: 'turn:turn-slow.example.com:443', username: 'user2', credential: 'pwd' }
    ];

    it('initializes with default or custom ICE servers and failure counters', () => {
      const mgr = new TurnRelayManager(mockIceServers, { preferRelayOnFailCount: 3 });
      expect(mgr.iceServers.length).toBe(3);
      expect(mgr.shouldForceRelay()).toBe(false);
    });

    it('tracks consecutive P2P failures and triggers shouldForceRelay after threshold', () => {
      const onLog = vi.fn();
      const mgr = new TurnRelayManager(mockIceServers, { preferRelayOnFailCount: 2, onLog });

      mgr.recordP2PFailure();
      expect(mgr.shouldForceRelay()).toBe(false);

      mgr.recordP2PFailure();
      expect(mgr.shouldForceRelay()).toBe(true);
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Forcing TURN relay mode'), 'warn');

      mgr.recordP2PSuccess();
      expect(mgr.shouldForceRelay()).toBe(false);
    });

    it('getBestIceConfig returns relay-only transport policy when forced', async () => {
      const mgr = new TurnRelayManager(mockIceServers);
      const normalConfig = await mgr.getBestIceConfig(false);
      expect(normalConfig.iceTransportPolicy).toBe('all');

      const relayConfig = await mgr.getBestIceConfig(true);
      expect(relayConfig.iceTransportPolicy).toBe('relay');
      expect(relayConfig.iceServers.every(s => s.urls.toString().includes('turn:'))).toBe(true);
    });

    it('rankServers gracefully handles non-browser environments', async () => {
      const mgr = new TurnRelayManager(mockIceServers);
      const ranked = await mgr.rankServers();
      expect(Array.isArray(ranked)).toBe(true);
      expect(ranked.length).toBe(3);
    });
  });

  describe('2. JitterBufferController — Dynamic NetEQ Target Tuning', () => {
    it('provides correct tier target delays across the 6-tier ladder', () => {
      const controller = new JitterBufferController();
      expect(controller.getTargetForTier('HQ')).toBe(120);
      expect(controller.getTargetForTier('STD')).toBe(160);
      expect(controller.getTargetForTier('LB')).toBe(200);
      expect(controller.getTargetForTier('HL')).toBe(250);
      expect(controller.getTargetForTier('EXT')).toBe(300);
      expect(controller.getTargetForTier('ULTRA')).toBe(400);
      expect(controller.getTargetForTier('UNKNOWN')).toBe(80);
    });

    it('safely applies jitterBufferTarget when property is supported on audio receivers', () => {
      const onLog = vi.fn();
      const controller = new JitterBufferController({ onLog });

      const mockReceiver = {
        track: { kind: 'audio' },
        jitterBufferTarget: 80
      };

      const mockPc = {
        getReceivers: () => [mockReceiver]
      };

      const applied = controller.applyForTier('ULTRA', mockPc);
      expect(applied).toBe(400);
      expect(mockReceiver.jitterBufferTarget).toBe(400);
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('400ms (ULTRA tier)'), 'info');
    });

    it('handles legacy environments without jitterBufferTarget gracefully without error', () => {
      const controller = new JitterBufferController();
      const mockReceiver = {
        track: { kind: 'audio' } // no jitterBufferTarget
      };
      const mockPc = {
        getReceivers: () => [mockReceiver]
      };

      const result = controller.applyForTier('HQ', mockPc);
      expect(result).toBeNull();
    });

    it('applyForTierIndex resolves tier index correctly', () => {
      const controller = new JitterBufferController();
      const mockReceiver = {
        track: { kind: 'audio' },
        jitterBufferTarget: 80
      };
      const mockPc = { getReceivers: () => [mockReceiver] };

      controller.applyForTierIndex(5, mockPc); // Tier 5 = ULTRA
      expect(mockReceiver.jitterBufferTarget).toBe(400);
    });
  });

  describe('3. PacketPacer — Traffic Shaping & Headroom Budgeting', () => {
    it('applies DSCP priority and calculates 85% headroom bitrate', async () => {
      const onLog = vi.fn();
      const pacer = new PacketPacer({ onLog, headroomFactor: 0.85 });

      let appliedParams = null;
      const mockSender = {
        track: { kind: 'audio' },
        getParameters: () => ({ encodings: [{ maxBitrate: 20000 }] }),
        setParameters: vi.fn(async (p) => { appliedParams = p; })
      };

      const mockPc = {
        getSenders: () => [mockSender]
      };

      const res = await pacer.applyForTier('HQ', 20000, mockPc);
      expect(res).toBe(true);
      expect(mockSender.setParameters).toHaveBeenCalled();
      expect(appliedParams.encodings[0].priority).toBe('high');
      expect(appliedParams.encodings[0].networkPriority).toBe('high');
      expect(appliedParams.encodings[0].maxBitrate).toBe(17000); // 20000 * 0.85
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('17000 bps'), 'info');
    });

    it('enforces 3000 bps minimum floor on paced bitrate', async () => {
      const pacer = new PacketPacer({ headroomFactor: 0.85 });
      let appliedParams = null;
      const mockSender = {
        track: { kind: 'audio' },
        getParameters: () => ({ encodings: [{}] }),
        setParameters: vi.fn(async (p) => { appliedParams = p; })
      };
      const mockPc = { getSenders: () => [mockSender] };

      await pacer.applyForTier('ULTRA', 3200, mockPc); // 3200 * 0.85 = 2720 -> clamped to 3000
      expect(appliedParams.encodings[0].maxBitrate).toBe(3000);
    });

    it('handles missing senders or getSenders cleanly', async () => {
      const pacer = new PacketPacer();
      expect(await pacer.applyForTier('HQ', 20000, null)).toBe(false);
      expect(await pacer.applyForTier('HQ', 20000, { getSenders: () => [] })).toBe(false);
    });

    it('dynamically adapts headroom based on buffer occupancy and loss metrics', () => {
      const onLog = vi.fn();
      const pacer = new PacketPacer({ onLog });
      expect(pacer.getHeadroomPercent()).toBe(15); // 0.85 default

      // High loss / high buffer occupancy -> increase headroom (reduce factor)
      pacer.updateHeadroom({ bufferOccupancy: 85, loss: 0.18, jitter: 95 });
      expect(pacer.headroomFactor).toBeLessThan(0.85);
      expect(pacer.getHeadroomPercent()).toBeGreaterThan(15);
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Pacer headroom dynamically adjusted'), 'debug');

      // Reset & test clean network -> decrease headroom (increase factor)
      pacer.setHeadroomFactor(0.80);
      pacer.updateHeadroom({ bufferOccupancy: 10, loss: 0.01, jitter: 15 });
      expect(pacer.headroomFactor).toBeGreaterThan(0.80);
    });
  });

  describe('4. IceRestartManager — Force Relay Fallback & Escalation', () => {
    it('forceRelayRestart reconfigures pc to relay-only and triggers restart', async () => {
      const onLog = vi.fn();
      const sendRenegotiation = vi.fn().mockResolvedValue();
      const mgr = new IceRestartManager({ onLog, sendRenegotiation });

      let appliedConfig = null;
      const mockPc = {
        getConfiguration: () => ({ iceTransportPolicy: 'all' }),
        setConfiguration: vi.fn((cfg) => { appliedConfig = cfg; }),
        restartIce: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ sdp: 'v=0\r\no=mock\r\n' }),
        setLocalDescription: vi.fn().mockResolvedValue(),
        signalingState: 'stable',
        connectionState: 'connected'
      };

      await mgr.forceRelayRestart(mockPc, true);
      expect(mockPc.setConfiguration).toHaveBeenCalled();
      expect(appliedConfig.iceTransportPolicy).toBe('relay');
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Switched to relay-only ICE transport'), 'warn');
    });
  });
});
