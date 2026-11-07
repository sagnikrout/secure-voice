import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDenoisePipeline } from '../utils/audio';
import { ACOUSTIC_PROFILES } from '../constants/config';
import { AcousticProfileId } from '../types';

describe('Acoustic Clarity & Noise Profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockStream = () => ({
    getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
    getTracks: () => [{ stop: vi.fn(), enabled: true }],
  });

  it('initializes with default balanced profile', () => {
    const stream = createMockStream();
    const pipeline = createDenoisePipeline(stream);

    expect(pipeline.getAcousticProfile()).toBe('balanced');
    expect(pipeline.nodes.highPass.frequency.setValueAtTime).toHaveBeenCalledWith(
      ACOUSTIC_PROFILES.balanced.highpassFreq,
      expect.any(Number)
    );
    expect(pipeline.nodes.presenceEQ.frequency.setValueAtTime).toHaveBeenCalledWith(
      ACOUSTIC_PROFILES.balanced.presenceFreq,
      expect.any(Number)
    );
    pipeline.cleanup();
  });

  it('initializes with voice-boost profile for noisy environments', () => {
    const stream = createMockStream();
    const pipeline = createDenoisePipeline(stream, { profile: 'voice-boost' });

    expect(pipeline.getAcousticProfile()).toBe('voice-boost');
    expect(pipeline.nodes.highPass.frequency.setValueAtTime).toHaveBeenCalledWith(
      ACOUSTIC_PROFILES['voice-boost'].highpassFreq,
      expect.any(Number)
    );
    expect(pipeline.nodes.presenceEQ.gain.setValueAtTime).toHaveBeenCalledWith(
      ACOUSTIC_PROFILES['voice-boost'].presenceGain,
      expect.any(Number)
    );
    pipeline.cleanup();
  });

  it('initializes with studio-clean profile for quiet environments', () => {
    const stream = createMockStream();
    const pipeline = createDenoisePipeline(stream, { profile: 'studio-clean' });

    expect(pipeline.getAcousticProfile()).toBe('studio-clean');
    expect(pipeline.nodes.highPass.frequency.setValueAtTime).toHaveBeenCalledWith(
      ACOUSTIC_PROFILES['studio-clean'].highpassFreq,
      expect.any(Number)
    );
    pipeline.cleanup();
  });

  it('dynamically switches acoustic profiles mid-stream', () => {
    const stream = createMockStream();
    const pipeline = createDenoisePipeline(stream, { profile: 'balanced' });

    expect(pipeline.getAcousticProfile()).toBe('balanced');

    // Switch to voice-boost
    pipeline.setAcousticProfile('voice-boost');
    expect(pipeline.getAcousticProfile()).toBe('voice-boost');
    expect(pipeline.nodes.highPass.frequency.setTargetAtTime).toHaveBeenCalledWith(
      ACOUSTIC_PROFILES['voice-boost'].highpassFreq,
      expect.any(Number),
      0.02
    );

    // Switch to studio-clean
    pipeline.setAcousticProfile('studio-clean');
    expect(pipeline.getAcousticProfile()).toBe('studio-clean');
    expect(pipeline.nodes.highPass.frequency.setTargetAtTime).toHaveBeenCalledWith(
      ACOUSTIC_PROFILES['studio-clean'].highpassFreq,
      expect.any(Number),
      0.02
    );

    pipeline.cleanup();
  });

  it('ignores invalid profile identifiers safely', () => {
    const stream = createMockStream();
    const pipeline = createDenoisePipeline(stream, { profile: 'balanced' });

    pipeline.setAcousticProfile('invalid-profile' as AcousticProfileId);
    expect(pipeline.getAcousticProfile()).toBe('balanced');

    pipeline.cleanup();
  });
});
