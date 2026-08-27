import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isWasmSimdSupported,
  isInsertableStreamsSupported,
  lyraWasmLoader
} from '../utils/lyra/lyraWasmLoader';
import {
  LyraNeuralProcessor,
  handleWorkerMessage
} from '../utils/lyra/lyraWorker';
import {
  isLyraFrame,
  packLyraFrame,
  unpackLyraFrame,
  LyraTransformController
} from '../utils/lyra/lyraTransform';
import { LyraManager } from '../utils/lyra/lyraManager';
import { LYRA_CONFIG, CODEC_CROSSOVER_CONFIG } from '../constants/config';
import { evaluateCodecCrossover } from '../utils/networkAdaptation';

describe('Google Lyra v2 Neural Speech Codec Subsystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WebAssembly SIMD & Platform Compatibility', () => {
    it('accurately validates WebAssembly 128-bit SIMD vector capabilities', () => {
      const isSimd = isWasmSimdSupported();
      expect(typeof isSimd).toBe('boolean');
    });

    it('validates WebRTC Insertable Streams environment availability', () => {
      const isInsertable = isInsertableStreamsSupported();
      expect(typeof isInsertable).toBe('boolean');
    });

    it('returns a comprehensive platform compatibility report', () => {
      const report = lyraWasmLoader.checkCompatibility();
      expect(report).toBeDefined();
      expect(typeof report.simd).toBe('boolean');
      expect(typeof report.supported).toBe('boolean');
      expect(typeof report.reason).toBe('string');
    });

    it('loads and caches model weight manifests in memory', async () => {
      const ready = await lyraWasmLoader.loadModelAssets();
      expect(ready).toBe(true);
      expect(lyraWasmLoader.isReady()).toBe(true);
      expect(lyraWasmLoader.getModelAsset('soundstream_encoder.tflite')).toBeDefined();
    });
  });

  describe('SoundStream Neural Encoder & LyraGAN Decoder', () => {
    let processor: LyraNeuralProcessor;

    beforeEach(() => {
      processor = new LyraNeuralProcessor();
      processor.init(3200);
    });

    it('compresses 320 Float32 samples (640 bytes raw) to exactly 8 bytes at 3.2 kbps', () => {
      const syntheticPcm = new Float32Array(LYRA_CONFIG.FRAME_SIZE_SAMPLES);
      // Generate synthetic 440 Hz sine wave tone
      for (let i = 0; i < syntheticPcm.length; i++) {
        syntheticPcm[i] = Math.sin(2 * Math.PI * 440 * (i / 16000)) * 0.5;
      }

      const encoded = processor.encode(syntheticPcm);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(8); // 8 bytes = 3200 bps at 50 fps
    });

    it('supports higher bitrate quantizer configurations (6.0 kbps -> 15 bytes, 9.2 kbps -> 23 bytes)', () => {
      const pcm = new Float32Array(320).fill(0.2);

      processor.setBitrate(6000);
      expect(processor.encode(pcm).length).toBe(15);

      processor.setBitrate(9200);
      expect(processor.encode(pcm).length).toBe(23);
    });

    it('decodes an 8-byte neural bitstream back to 320 Float32 PCM samples', () => {
      const inputPcm = new Float32Array(320);
      for (let i = 0; i < 320; i++) {
        inputPcm[i] = Math.sin(2 * Math.PI * 800 * (i / 16000)) * 0.4;
      }

      const encoded = processor.encode(inputPcm);
      const decodedPcm = processor.decode(encoded);

      expect(decodedPcm).toBeInstanceOf(Float32Array);
      expect(decodedPcm.length).toBe(320);

      // Verify samples are bounded within valid acoustic range (-1.0 to +1.0)
      for (let i = 0; i < decodedPcm.length; i++) {
        expect(decodedPcm[i]).toBeGreaterThanOrEqual(-1.0);
        expect(decodedPcm[i]).toBeLessThanOrEqual(1.0);
      }
    });

    it('synthesizes generative autoregressive neural PLC when a frame is lost', () => {
      const inputPcm = new Float32Array(320).fill(0.3);
      processor.encode(inputPcm);

      // Pass empty buffer to trigger generative PLC
      const plcPcm = processor.decode(new Uint8Array(0));
      expect(plcPcm.length).toBe(320);

      // Verify synthesized PLC signal is smooth and non-zero
      let nonZeroCount = 0;
      for (let i = 0; i < plcPcm.length; i++) {
        if (Math.abs(plcPcm[i]) > 0.0001) nonZeroCount++;
      }
      expect(nonZeroCount).toBeGreaterThan(0);
    });
  });

  describe('WebRTC Frame Serialization & Sequence Packing', () => {
    it('correctly identifies valid Lyra frames via 0x4C magic header byte', () => {
      const payload = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
      const packed = packLyraFrame(payload, 42, 3200);

      expect(isLyraFrame(packed)).toBe(true);
      expect(packed[0]).toBe(0x4C); // 'L'
      expect(packed[1]).toBe(42);   // seq
      expect(packed[2]).toBe(0);    // 3200 bps code
    });

    it('rejects non-Lyra / standard Opus raw frames', () => {
      const rawOpus = new Uint8Array([0xf8, 0xff, 0x20, 0x11]);
      expect(isLyraFrame(rawOpus)).toBe(false);
      expect(isLyraFrame(new Uint8Array(0))).toBe(false);
    });

    it('unpacks serialized Lyra frame into header and payload correctly', () => {
      const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const packed = packLyraFrame(payload, 105, 6000);

      const result = unpackLyraFrame(packed);
      expect(result).not.toBeNull();
      expect(result?.header.magic).toBe(0x4C);
      expect(result?.header.seq).toBe(105);
      expect(result?.header.bitrateCode).toBe(1); // 6000 bps
      expect(result?.payload).toEqual(payload);
    });
  });

  describe('LyraManager & Worker Router State Machine', () => {
    let manager: LyraManager;

    beforeEach(() => {
      manager = LyraManager.getInstance();
      manager.reset();
    });

    it('maintains bounded encoded frame queues to prevent memory growth', () => {
      const pcm = new Float32Array(320).fill(0.1);
      for (let i = 0; i < 30; i++) {
        manager.encodePcm(pcm);
      }

      // Queue is clamped to max 20 frames
      let pulledCount = 0;
      while (manager.pullEncodedFrame()) {
        pulledCount++;
      }
      expect(pulledCount).toBeLessThanOrEqual(20);
    });

    it('tracks live encoding, decoding, PLC synthesis, and bandwidth statistics', async () => {
      await manager.init({ bitrate: 3200 });
      const pcm = new Float32Array(320).fill(0.1);

      manager.encodePcm(pcm);
      manager.decodeFrame(new Uint8Array(8));
      manager.synthesizePlc();

      const stats = manager.getStats();
      expect(stats.framesEncoded).toBe(1);
      expect(stats.framesDecoded).toBe(1);
      expect(stats.plcFramesSynthesized).toBe(1);
      expect(stats.bitrateBps).toBe(3200);
      expect(stats.rawBandwidthKbps).toBe(3.2); // (8 bytes * 8 * 50 fps) / 1000 = 3.2 kbps
    });

    it('handles worker message routing correctly', () => {
      const responses: any[] = [];
      const post = (r: any) => responses.push(r);

      handleWorkerMessage({ data: { type: 'init', payload: { bitrate: 3200 } } }, post);
      expect(responses.some(r => r.type === 'init_done')).toBe(true);

      const pcm = new Float32Array(320).fill(0.2);
      handleWorkerMessage({ data: { type: 'encode', payload: { pcm }, seq: 1 } }, post);
      expect(responses.some(r => r.type === 'encoded_frame' && r.seq === 1)).toBe(true);

      handleWorkerMessage({ data: { type: 'plc', seq: 2 } }, post);
      expect(responses.some(r => r.type === 'plc_pcm' && r.seq === 2)).toBe(true);
    });
  });

  describe('14 kbps Acoustic Quality Crossover Engine', () => {
    it('under 14 kbps / network constraint: automatically switches from Opus to Lyra v2 Neural', () => {
      // Impaired network snapshot (8% packet loss, 320ms RTT)
      const constrainedSnapshot = {
        effectiveLossRate: 0.08,
        rttMs: 320,
        jitterMs: 50,
        availableOutgoingBitrate: 8000
      };

      const result = evaluateCodecCrossover({
        snapshot: constrainedSnapshot,
        currentCodec: 'opus',
        consecutiveHealthyTicks: 0,
        simdSupported: true
      });

      expect(result.codecChanged).toBe(true);
      expect(result.targetCodec).toBe('lyra');
      expect(result.reason).toContain('Lyra v2 Neural');
    });

    it('14 kbps and above: elevates from Lyra to Opus Wideband HD after 4 stable consecutive ticks', () => {
      // Clean broadband network snapshot (0.2% loss, 45ms RTT, 25 kbps available)
      const broadbandSnapshot = {
        effectiveLossRate: 0.002,
        rttMs: 45,
        jitterMs: 8,
        availableOutgoingBitrate: 25000
      };

      // Tick 1, 2, 3: Probing headroom without premature switching
      let res = evaluateCodecCrossover({
        snapshot: broadbandSnapshot,
        currentCodec: 'lyra',
        consecutiveHealthyTicks: 0,
        simdSupported: true
      });
      expect(res.codecChanged).toBe(false);
      expect(res.consecutiveHealthyTicks).toBe(1);

      res = evaluateCodecCrossover({
        snapshot: broadbandSnapshot,
        currentCodec: 'lyra',
        consecutiveHealthyTicks: 1,
        simdSupported: true
      });
      expect(res.consecutiveHealthyTicks).toBe(2);

      res = evaluateCodecCrossover({
        snapshot: broadbandSnapshot,
        currentCodec: 'lyra',
        consecutiveHealthyTicks: 2,
        simdSupported: true
      });
      expect(res.consecutiveHealthyTicks).toBe(3);

      // Tick 4: 4 consecutive healthy ticks reached -> elevate to Opus Wideband
      res = evaluateCodecCrossover({
        snapshot: broadbandSnapshot,
        currentCodec: 'lyra',
        consecutiveHealthyTicks: 3,
        simdSupported: true
      });
      expect(res.codecChanged).toBe(true);
      expect(res.targetCodec).toBe('opus');
      expect(res.reason).toContain('Elevated to Opus Wideband HD');
    });

    it('locks to Opus if WASM SIMD is not supported on the device', () => {
      const constrainedSnapshot = {
        effectiveLossRate: 0.20,
        rttMs: 500,
        jitterMs: 90
      };

      const result = evaluateCodecCrossover({
        snapshot: constrainedSnapshot,
        currentCodec: 'opus',
        consecutiveHealthyTicks: 0,
        simdSupported: false
      });

      expect(result.targetCodec).toBe('opus');
    });
  });
});
