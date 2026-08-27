import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IceRestartManager } from '../utils/iceRestartManager';
import { AudioResourceManager } from '../utils/resourceManager';
import { createMockPeerConnection } from './iceRestart.test';
import { selectExtendedTier } from '../utils/networkAdaptation';
import { transformOpusSdp, sanitizeSdp } from '../utils/webrtc';

describe('Chaos Engineering & Adversarial Network Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Mid-Offer Failure & Connection Loss During Renegotiation', () => {
    it('survives network disconnect occurring mid-offer creation without unhandled exceptions', async () => {
      const { pc } = createMockPeerConnection();
      const sendRenegotiation = vi.fn();
      const onLog = vi.fn();

      const manager = new IceRestartManager({
        sendRenegotiation,
        onLog
      });

      // Simulate createOffer throwing unexpected error due to mid-flight network teardown
      pc.createOffer = vi.fn().mockRejectedValue(new Error('Network link severed mid-offer'));

      await manager.startIceRestart(pc, true, 'Test Mid-flight Drop');
      await vi.advanceTimersByTimeAsync(1100);

      // Verify failure was recorded defensively and manager handled error gracefully
      expect(manager.failureHistory).toHaveLength(1);
      expect(manager.failureHistory[0].reason).toContain('offer creation failed');
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('ICE restart offer creation failed'), 'error');
    });
  });

  describe('2. AudioContext Suspension & Background Resumption Cycles', () => {
    it('recovers AudioContext state through resource manager without leaking nodes', async () => {
      const resourceManager = new AudioResourceManager();

      const mockCtx = {
        state: 'running' as AudioContextState,
        suspend: vi.fn(async function(this: any) { this.state = 'suspended'; }),
        resume: vi.fn(async function(this: any) { this.state = 'running'; }),
        close: vi.fn(async function(this: any) { this.state = 'closed'; })
      } as unknown as AudioContext;

      const mockNode = { disconnect: vi.fn() } as unknown as AudioNode;

      resourceManager.registerContext(mockCtx);
      resourceManager.registerNode(mockCtx, mockNode);

      // User backgrounded app / switched tab -> suspend
      await (mockCtx as any).suspend();
      expect(mockCtx.state).toBe('suspended');

      // User returns -> resume
      await (mockCtx as any).resume();
      expect(mockCtx.state).toBe('running');

      // Call ends -> clean teardown
      await resourceManager.cleanupContext(mockCtx);
      expect(mockNode.disconnect).toHaveBeenCalled();
      expect(mockCtx.close).toHaveBeenCalled();
      expect(resourceManager.getStats().trackedNodes).toBe(0);
    });
  });

  describe('3. Rapid Hardware Device Switching During Active Call', () => {
    it('survives rapid consecutive microphone track replacements without state corruption', async () => {
      const resourceManager = new AudioResourceManager();
      const tracks: any[] = [];

      for (let i = 0; i < 5; i++) {
        const track = {
          id: `mic-track-${i}`,
          stop: vi.fn(),
          enabled: true
        } as unknown as MediaStreamTrack;
        const stream = {
          getTracks: vi.fn(() => [track])
        } as unknown as MediaStream;

        resourceManager.registerStream(stream);
        tracks.push({ track, stream });

        // Simulate replacing previous stream
        if (i > 0) {
          resourceManager.cleanupStream(tracks[i - 1].stream);
          expect(tracks[i - 1].track.stop).toHaveBeenCalled();
        }
      }

      // Only the active 5th stream should remain tracked
      expect(resourceManager.getStats().trackedStreams).toBe(1);
      expect(resourceManager.getStats().trackedTracks).toBe(1);

      await resourceManager.cleanupAll();
      expect(resourceManager.getStats().trackedStreams).toBe(0);
    });
  });

  describe('4. Extreme Survival Codec Adaptation Under Catastrophic Loss', () => {
    it('selects ULTRA_LOW 1.2kbps tier under 60% catastrophic packet loss', () => {
      const tier = selectExtendedTier({ loss: 0.60, rtt: 800, jitter: 150 });
      expect(tier.name).toBe('ULTRA_LOW');
      expect(tier.maxBitrateBps).toBe(1200);
      expect(tier.ptimeMs).toBe(120);
    });

    it('selects EXTREME 2.4kbps tier under 40% severe packet loss', () => {
      const tier = selectExtendedTier({ loss: 0.40, rtt: 600, jitter: 100 });
      expect(tier.name).toBe('EXTREME');
      expect(tier.maxBitrateBps).toBe(2400);
      expect(tier.ptimeMs).toBe(100);
    });

    it('selects HQ_PLUS 24kbps wideband tier under clean high-speed network', () => {
      const tier = selectExtendedTier({ loss: 0.001, rtt: 40, jitter: 8 });
      expect(tier.name).toBe('HQ_PLUS');
      expect(tier.maxBitrateBps).toBe(24000);
      expect(tier.maxPlaybackRate).toBe(16000);
    });
  });

  describe('5. Malformed SDP & Packet Tamper Resistance', () => {
    it('safely handles empty or malformed SDP without throwing unhandled exceptions', () => {
      expect(transformOpusSdp('')).toBe('');
      expect(sanitizeSdp('')).toBe('');
      expect(transformOpusSdp(null as any)).toBe(null);

      const malformedSdp = 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\ninvalid-corrupted-line\r\n';
      expect(() => transformOpusSdp(malformedSdp)).not.toThrow();
    });
  });
});
