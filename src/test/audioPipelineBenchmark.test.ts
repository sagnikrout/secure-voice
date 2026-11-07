import { describe, it, expect } from 'vitest';
import {
  generateVocalTone,
  generateConversationalSpeech,
  generateNoise,
  mixAudio,
  computeRmsDb,
  encodeWavFile
} from '../utils/audioTestSignals';
import { RNNoiseProcessor, FRAME_SIZE } from '../utils/rnnoise/rnnoiseProcessor';
import { ACOUSTIC_PROFILES } from '../constants/config';

describe('Audio Pipeline Benchmark & Acoustic Verification Suite', () => {
  const SAMPLE_RATE = 48000;

  it('preserves vocal speech formant energy and asserts high VAD confidence', () => {
    const duration = 0.5;
    const numSamples = Math.floor(duration * SAMPLE_RATE);
    const numFrames = Math.floor(numSamples / FRAME_SIZE);

    const vocalSignal = generateVocalTone(duration, SAMPLE_RATE, { f0: 160, f1: 500, f2: 1500, f3: 2500 });
    const processor = new RNNoiseProcessor(SAMPLE_RATE);
    const output = new Float32Array(numSamples);

    let vadSum = 0;
    for (let f = 0; f < numFrames; f++) {
      const offset = f * FRAME_SIZE;
      const inFrame = vocalSignal.subarray(offset, offset + FRAME_SIZE);
      const outFrame = output.subarray(offset, offset + FRAME_SIZE);
      const metrics = processor.processFrame(inFrame, outFrame);
      vadSum += metrics.vadProbability;
    }

    const avgVad = vadSum / numFrames;
    const inputRms = computeRmsDb(vocalSignal);
    const outputRms = computeRmsDb(output);
    const deltaDb = Math.abs(outputRms - inputRms);

    expect(avgVad).toBeGreaterThan(0.65);
    expect(deltaDb).toBeLessThan(3.5);
  });

  it('attenuates combined ambient acoustic noise during silence periods', () => {
    const duration = 0.5;
    const numSamples = Math.floor(duration * SAMPLE_RATE);
    const numFrames = Math.floor(numSamples / FRAME_SIZE);

    const noiseSignal = generateNoise(duration, SAMPLE_RATE, 'combined', 0.05);
    const processor = new RNNoiseProcessor(SAMPLE_RATE);
    const output = new Float32Array(numSamples);

    let vadSum = 0;
    for (let f = 0; f < numFrames; f++) {
      const offset = f * FRAME_SIZE;
      const inFrame = noiseSignal.subarray(offset, offset + FRAME_SIZE);
      const outFrame = output.subarray(offset, offset + FRAME_SIZE);
      const metrics = processor.processFrame(inFrame, outFrame);
      vadSum += metrics.vadProbability;
    }

    const avgVad = vadSum / numFrames;
    const inputRms = computeRmsDb(noiseSignal);
    const outputRms = computeRmsDb(output);
    const attenuationDb = inputRms - outputRms;

    expect(avgVad).toBeLessThan(0.35);
    expect(attenuationDb).toBeGreaterThan(10.0);
  });

  it('enhances speech and suppresses inter-phrase noise in mixed 0 dB audio', () => {
    const duration = 1.2;
    const numSamples = Math.floor(duration * SAMPLE_RATE);
    const numFrames = Math.floor(numSamples / FRAME_SIZE);

    const speechTrack = generateConversationalSpeech(duration, SAMPLE_RATE, 0.3);
    const noiseTrack = generateNoise(duration, SAMPLE_RATE, 'combined', 0.05);
    const { mixed } = mixAudio(speechTrack, noiseTrack, 0);

    const processor = new RNNoiseProcessor(SAMPLE_RATE);
    const output = new Float32Array(numSamples);

    for (let f = 0; f < numFrames; f++) {
      const offset = f * FRAME_SIZE;
      processor.processFrame(mixed.subarray(offset, offset + FRAME_SIZE), output.subarray(offset, offset + FRAME_SIZE));
    }

    // Pause analysis (0.53s - 0.68s)
    const pauseStart = Math.floor(0.53 * SAMPLE_RATE);
    const pauseEnd = Math.floor(0.68 * SAMPLE_RATE);
    const pauseInRms = computeRmsDb(mixed.subarray(pauseStart, pauseEnd));
    const pauseOutRms = computeRmsDb(output.subarray(pauseStart, pauseEnd));
    const pauseSuppressionDb = pauseInRms - pauseOutRms;

    // Active speech analysis (0.05s - 0.40s)
    const speechStart = Math.floor(0.05 * SAMPLE_RATE);
    const speechEnd = Math.floor(0.40 * SAMPLE_RATE);
    const speechInRms = computeRmsDb(speechTrack.subarray(speechStart, speechEnd));
    const speechOutRms = computeRmsDb(output.subarray(speechStart, speechEnd));
    const speechLossDb = Math.abs(speechOutRms - speechInRms);

    expect(pauseSuppressionDb).toBeGreaterThan(5.0);
    expect(speechLossDb).toBeLessThan(2.5);
  });

  it('satisfies sub-4.0ms real-time audio thread latency watchdog', () => {
    const processor = new RNNoiseProcessor(SAMPLE_RATE);
    const inFrame = new Float32Array(FRAME_SIZE);
    const outFrame = new Float32Array(FRAME_SIZE);

    for (let i = 0; i < FRAME_SIZE; i++) {
      inFrame[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
    }

    const latencies: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      processor.processFrame(inFrame, outFrame);
      latencies.push(performance.now() - t0);
    }

    const maxLatency = Math.max(...latencies);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    expect(maxLatency).toBeLessThan(4.0);
    expect(avgLatency).toBeLessThan(0.8);
  });

  it('encodes valid 44-byte RIFF/WAVE header and 16-bit PCM payload', () => {
    const samples = new Float32Array(480);
    const wavBytes = encodeWavFile(samples, SAMPLE_RATE);

    expect(wavBytes.length).toBe(44 + 480 * 2);
    // "RIFF"
    expect(String.fromCharCode(wavBytes[0], wavBytes[1], wavBytes[2], wavBytes[3])).toBe('RIFF');
    // "WAVE"
    expect(String.fromCharCode(wavBytes[8], wavBytes[9], wavBytes[10], wavBytes[11])).toBe('WAVE');
    // "fmt "
    expect(String.fromCharCode(wavBytes[12], wavBytes[13], wavBytes[14], wavBytes[15])).toBe('fmt ');
    // "data"
    expect(String.fromCharCode(wavBytes[36], wavBytes[37], wavBytes[38], wavBytes[39])).toBe('data');
  });

  it('verifies all acoustic clarity profiles meet frequency and dynamic bounds', () => {
    const profiles = ['balanced', 'voice-boost', 'studio-clean', 'neural-enhanced'] as const;
    for (const p of profiles) {
      const prof = ACOUSTIC_PROFILES[p];
      expect(prof).toBeDefined();
      expect(prof.highpassFreq).toBeGreaterThanOrEqual(40);
      expect(prof.highpassFreq).toBeLessThanOrEqual(150);
      expect(prof.presenceGain).toBeGreaterThanOrEqual(0);
      expect(prof.presenceGain).toBeLessThanOrEqual(6.0);
      expect(prof.gateThreshold).toBeLessThanOrEqual(-30);
      expect(prof.gateThreshold).toBeGreaterThanOrEqual(-60);
    }
  });
});
