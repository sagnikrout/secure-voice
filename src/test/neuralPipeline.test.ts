import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RNNoiseProcessor, FRAME_SIZE, BARK_BANDS } from '../utils/rnnoise/rnnoiseProcessor';
import { registerRNNoiseWorklet, RNNOISE_WORKLET_NAME, RNNOISE_WORKLET_CODE } from '../utils/rnnoise/rnnoiseWorklet';
import { createDenoisePipeline } from '../utils/audio';
import { ACOUSTIC_PROFILES } from '../constants/config';
import { AcousticProfileId } from '../types';

describe('Neural Speech Enhancement Pipeline (RNNoise & AudioWorklet)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RNNoiseProcessor Core Engine', () => {
    it('initializes with 48kHz sampling and pre-allocated buffers', () => {
      const processor = new RNNoiseProcessor(48000);
      expect(processor).toBeDefined();
    });

    it('processes 480-sample frames and maintains dimensional parity', () => {
      const processor = new RNNoiseProcessor(48000);
      const input = new Float32Array(FRAME_SIZE);
      const output = new Float32Array(FRAME_SIZE);

      // Synthesize 480 samples of pink noise + voice harmonic
      for (let i = 0; i < FRAME_SIZE; i++) {
        input[i] = 0.05 * Math.sin((2 * Math.PI * 220 * i) / 48000) + 0.01 * (Math.random() - 0.5);
      }

      const metrics = processor.processFrame(input, output);
      expect(output.length).toBe(FRAME_SIZE);
      expect(Number.isFinite(metrics.vadProbability)).toBe(true);
      expect(Number.isFinite(metrics.noiseLevelDb)).toBe(true);
      expect(metrics.averageGain).toBeGreaterThan(0);
      expect(metrics.averageGain).toBeLessThanOrEqual(1.0);
    });

    it('detects vocal periodicity on harmonic speech signals', () => {
      const processor = new RNNoiseProcessor(48000);
      const input = new Float32Array(FRAME_SIZE);
      const output = new Float32Array(FRAME_SIZE);

      // Strong vocal formant harmonic at 180Hz (typical male/female pitch)
      for (let i = 0; i < FRAME_SIZE; i++) {
        input[i] = 0.3 * Math.sin((2 * Math.PI * 180 * i) / 48000)
                 + 0.15 * Math.sin((2 * Math.PI * 360 * i) / 48000)
                 + 0.08 * Math.sin((2 * Math.PI * 540 * i) / 48000);
      }

      // Process two frames to allow GRU temporal adaptation
      processor.processFrame(input, output);
      const metrics = processor.processFrame(input, output);

      expect(metrics.vadProbability).toBeGreaterThan(0.5);
      expect(metrics.averageGain).toBeGreaterThan(0.5);
    });

    it('attenuates low-level ambient noise during silence', () => {
      const processor = new RNNoiseProcessor(48000);
      const input = new Float32Array(FRAME_SIZE);
      const output = new Float32Array(FRAME_SIZE);

      // Low-level white noise (-50 dBFS)
      for (let i = 0; i < FRAME_SIZE; i++) {
        input[i] = 0.002 * (Math.random() * 2 - 1);
      }

      // Allow temporal adaptation over 3 frames
      processor.processFrame(input, output);
      processor.processFrame(input, output);
      const metrics = processor.processFrame(input, output);

      expect(metrics.vadProbability).toBeLessThan(0.5);
    });

    it('recovers cleanly on reset', () => {
      const processor = new RNNoiseProcessor(48000);
      processor.reset();
      const input = new Float32Array(FRAME_SIZE);
      const output = new Float32Array(FRAME_SIZE);
      const metrics = processor.processFrame(input, output);
      expect(metrics).toBeDefined();
    });
  });

  describe('RNNoise AudioWorklet Registration & Constants', () => {
    it('defines worklet name and code constant', () => {
      expect(RNNOISE_WORKLET_NAME).toBe('securevoice-rnnoise-enhancer');
      expect(RNNOISE_WORKLET_CODE).toContain('RNNoiseAudioWorkletProcessor');
      expect(RNNOISE_WORKLET_CODE).toContain('registerProcessor');
    });

    it('registers worklet on AudioContext gracefully', async () => {
      const mockCtx: any = {
        audioWorklet: {
          addModule: vi.fn().mockResolvedValue(undefined)
        }
      };

      const registered = await registerRNNoiseWorklet(mockCtx);
      expect(registered).toBe(true);
      expect(mockCtx.audioWorklet.addModule).toHaveBeenCalled();
    });

    it('returns false when audioWorklet is not supported', async () => {
      const mockCtx: any = {};
      const registered = await registerRNNoiseWorklet(mockCtx);
      expect(registered).toBe(false);
    });
  });

  describe('Acoustic Profile Integration with Neural Enhanced Profile', () => {
    it('defines neural-enhanced profile in ACOUSTIC_PROFILES with exact acoustic parameters', () => {
      const profile = ACOUSTIC_PROFILES['neural-enhanced'];
      expect(profile).toBeDefined();
      expect(profile.id).toBe('neural-enhanced');
      expect(profile.highpassFreq).toBe(85);
      expect(profile.presenceFreq).toBe(3000);
      expect(profile.presenceGain).toBe(3.0);
      expect(profile.hissCutFreq).toBe(18000);
      expect(profile.gateThreshold).toBe(-44);
      expect(profile.compressorThreshold).toBe(-22);
    });

    it('creates denoise pipeline with neural-enhanced profile and transitions smoothly', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const pipeline = createDenoisePipeline(mockStream, { profile: 'neural-enhanced' });
      expect(pipeline.getAcousticProfile()).toBe('neural-enhanced');

      // Switch profile to balanced and back
      pipeline.setAcousticProfile('balanced');
      expect(pipeline.getAcousticProfile()).toBe('balanced');

      pipeline.setAcousticProfile('neural-enhanced');
      expect(pipeline.getAcousticProfile()).toBe('neural-enhanced');

      pipeline.cleanup();
    });
  });
});
