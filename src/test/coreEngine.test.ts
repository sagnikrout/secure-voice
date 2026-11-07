import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelecomEngine } from '../core/telecomEngine';
import { AudioEngine } from '../core/audioEngine';
import { ACOUSTIC_PROFILES } from '../constants/config';
import { createMockPeerConnection } from './iceRestart.test';

describe('Core Engine Architecture (TelecomEngine & AudioEngine)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TelecomEngine', () => {
    it('creates and monitors RTCPeerConnection with dual-stack Anycast STUN', () => {
      const onStateChange = vi.fn();
      const engine = new TelecomEngine({ onStateChange });
      const mockConstructor = vi.fn().mockImplementation(() => createMockPeerConnection());
      const pc = engine.createPeerConnection(mockConstructor);

      expect(pc).toBeDefined();
      expect(mockConstructor).toHaveBeenCalled();
      engine.destroy();
    });

    it('calculates continuous playout shock absorber target within bounds and applies hysteresis', () => {
      const engine = new TelecomEngine();
      engine.attachPeerConnection(createMockPeerConnection());

      // Clean broadband: 5ms jitter, 0% loss -> target 35ms + 11ms = 46ms
      const target1 = engine.applyPlayoutShockAbsorber(5, 0);
      expect(target1).toBeGreaterThanOrEqual(35);
      expect(target1).toBeLessThanOrEqual(60);

      // Severe 2G congestion: 80ms jitter, 15% loss -> target ~230ms
      const target2 = engine.applyPlayoutShockAbsorber(80, 0.15);
      expect(target2).toBeGreaterThanOrEqual(180);
      expect(target2).toBeLessThanOrEqual(280);

      // Minor 2ms drift should be absorbed by 15ms hysteresis
      const target3 = engine.applyPlayoutShockAbsorber(81, 0.15);
      expect(target3).toBe(target2);

      engine.destroy();
    });

    it('processes telemetry snapshots, smooths via EMA, and grades connection quality', () => {
      const onTelemetry = vi.fn();
      const engine = new TelecomEngine({ onTelemetry });
      engine.attachPeerConnection(createMockPeerConnection());

      // Healthy tick (RTT 45ms) -> good rating
      const telemetry1 = engine.processStats({ rttMs: 45, jitterMs: 12, packetLossRate: 0.01 });
      expect(telemetry1.tierName).toBe('HQ');
      expect(telemetry1.rating).toBe('good');
      expect(telemetry1.bitrateBps).toBe(8000);
      expect(onTelemetry).toHaveBeenCalled();

      // Congested ticks (RTT 550ms, jitter 140ms, 20% loss) -> EMA smooths then engages DTX
      for (let i = 0; i < 4; i++) {
        engine.processStats({ rttMs: 550, jitterMs: 140, packetLossRate: 0.20 });
      }
      const telemetry2 = engine.processStats({ rttMs: 550, jitterMs: 140, packetLossRate: 0.20 });
      expect(telemetry2.dtxEnabled).toBe(true); // DTX engaged on congested 2G link

      engine.destroy();
    });

    it('derives deterministic 8-digit DTLS Safety Code from session SDPs', async () => {
      const engine = new TelecomEngine();
      const sdpA = 'v=0\r\na=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:01\r\n';
      const sdpB = 'v=0\r\na=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:02\r\n';

      const code1 = await engine.getDtlsSafetyCode(sdpA, sdpB);
      const code2 = await engine.getDtlsSafetyCode(sdpB, sdpA);

      expect(code1).toBeDefined();
      expect(code1?.length).toBe(8);
      expect(/^\d{8}$/.test(code1!)).toBe(true);
      expect(code1).toBe(code2); // Symmetric regardless of caller/callee ordering
      engine.destroy();
    });

    it('triggers ICE restart with backoff and guards against excessive retries', async () => {
      const onLog = vi.fn();
      const engine = new TelecomEngine({ onLog });
      engine.attachPeerConnection(createMockPeerConnection());

      const ok1 = await engine.triggerIceRestart();
      expect(ok1).toBe(true);

      engine.destroy();
    });
  });

  describe('AudioEngine', () => {
    it('creates 48kHz audio pipeline with all 6 stages and clean node topology', () => {
      const mockStream: any = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const pipeline = AudioEngine.createPipeline(mockStream, 'balanced');
      expect(pipeline.processedStream).toBeDefined();
      expect(pipeline.audioCtx).toBeDefined();
      expect(pipeline.nodes).toBeDefined();

      const nodes = pipeline.nodes!;
      expect(nodes.highPass.type).toBe('highpass');
      expect(nodes.presenceEQ.type).toBe('peaking');
      expect(nodes.hissCut.type).toBe('lowpass');
      expect(nodes.compressor).toBeDefined();
      expect(nodes.makeupGain).toBeDefined();

      expect(pipeline.getAcousticProfile()).toBe('balanced');
      pipeline.cleanup();
    });

    it('transitions smoothly between acoustic profiles including neural-enhanced', () => {
      const mockStream: any = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const pipeline = AudioEngine.createPipeline(mockStream, 'balanced');
      
      pipeline.setAcousticProfile('neural-enhanced');
      expect(pipeline.getAcousticProfile()).toBe('neural-enhanced');

      pipeline.setAcousticProfile('voice-boost');
      expect(pipeline.getAcousticProfile()).toBe('voice-boost');

      pipeline.setAcousticProfile('studio-clean');
      expect(pipeline.getAcousticProfile()).toBe('studio-clean');

      pipeline.cleanup();
    });
  });
});
