/**
 * SecureVoice In-Stream Audio Pipeline & Neural Voice Enhancement Benchmark Harness
 *
 * Evaluates:
 * 1. Pure Voice Harmonic Transparency & VAD Confidence
 * 2. Background Acoustic Noise Attenuation (dB suppression during silence)
 * 3. Mixed 0 dB SNR Speech Enhancement & SNR Gain
 * 4. Real-time Audio Worklet Latency Budget (< 4.0 ms watchdog)
 * 5. Acoustic Clarity Profiles & Dynamic DSP Calibration
 * 6. Generates 16-bit PCM WAV audio files in dist/audio-samples/ for listening
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateVocalTone,
  generateConversationalSpeech,
  generateNoise,
  mixAudio,
  computeRmsDb,
  computeSnrDb,
  encodeWavFile
} from '../src/utils/audioTestSignals.ts';
import { RNNoiseProcessor, FRAME_SIZE } from '../src/utils/rnnoise/rnnoiseProcessor.ts';
import { ACOUSTIC_PROFILES } from '../src/constants/config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n======================================================');
console.log('   SecureVoice In-Stream 48 kHz Audio Pipeline Test   ');
console.log('======================================================\n');

let passedAssertions = 0;
let totalAssertions = 0;

function assert(condition: boolean, description: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ [PASS] ${description}`);
  } else {
    console.error(`  ❌ [FAIL] ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

const SAMPLE_RATE = 48000;
const DURATION_SEC = 1.0;
const NUM_SAMPLES = Math.floor(DURATION_SEC * SAMPLE_RATE);
const NUM_FRAMES = Math.floor(NUM_SAMPLES / FRAME_SIZE);

// -------------------------------------------------------------
// Benchmark 1: Pure Voice Harmonic Transparency & VAD Detection
// -------------------------------------------------------------
console.log('🗣️  Benchmark 1: Pure Vocal Formant Transparency');

const vocalSignal = generateVocalTone(DURATION_SEC, SAMPLE_RATE, { f0: 160, f1: 500, f2: 1500, f3: 2500 });
const vocalProcessor = new RNNoiseProcessor(SAMPLE_RATE);
const vocalOutput = new Float32Array(NUM_SAMPLES);

let avgVad = 0;
let avgGain = 0;

for (let f = 0; f < NUM_FRAMES; f++) {
  const offset = f * FRAME_SIZE;
  const inFrame = vocalSignal.subarray(offset, offset + FRAME_SIZE);
  const outFrame = vocalOutput.subarray(offset, offset + FRAME_SIZE);
  const metrics = vocalProcessor.processFrame(inFrame, outFrame);
  avgVad += metrics.vadProbability;
  avgGain += metrics.averageGain;
}

avgVad /= NUM_FRAMES;
avgGain /= NUM_FRAMES;

const inputVocalRms = computeRmsDb(vocalSignal);
const outputVocalRms = computeRmsDb(vocalOutput);
const vocalRmsDelta = Math.abs(outputVocalRms - inputVocalRms);

assert(avgVad > 0.65, `Vocal speech detected with high VAD probability (${(avgVad * 100).toFixed(1)}% > 65%)`);
assert(avgGain > 0.60, `Vocal speech gains preserved through GRU temporal gate (${(avgGain * 100).toFixed(1)}% > 60%)`);
assert(vocalRmsDelta < 3.5, `Vocal envelope energy preserved within transparent limits (Delta: ${vocalRmsDelta.toFixed(2)} dB < 3.5 dB)`);

// -------------------------------------------------------------
// Benchmark 2: Background Noise Suppression During Silence
// -------------------------------------------------------------
console.log('\n🔇 Benchmark 2: Background Noise Suppression');

const noiseSignal = generateNoise(DURATION_SEC, SAMPLE_RATE, 'combined', 0.05);
const noiseProcessor = new RNNoiseProcessor(SAMPLE_RATE);
const noiseOutput = new Float32Array(NUM_SAMPLES);

let noiseVadSum = 0;
for (let f = 0; f < NUM_FRAMES; f++) {
  const offset = f * FRAME_SIZE;
  const inFrame = noiseSignal.subarray(offset, offset + FRAME_SIZE);
  const outFrame = noiseOutput.subarray(offset, offset + FRAME_SIZE);
  const metrics = noiseProcessor.processFrame(inFrame, outFrame);
  noiseVadSum += metrics.vadProbability;
}

const noiseVadAvg = noiseVadSum / NUM_FRAMES;
const inputNoiseRms = computeRmsDb(noiseSignal);
const outputNoiseRms = computeRmsDb(noiseOutput);
const noiseSuppressionDb = inputNoiseRms - outputNoiseRms;

assert(noiseVadAvg < 0.35, `Non-speech noise classified with low VAD probability (${(noiseVadAvg * 100).toFixed(1)}% < 35%)`);
assert(noiseSuppressionDb > 12.0, `Significant acoustic noise suppression achieved (${noiseSuppressionDb.toFixed(1)} dB reduction > 12.0 dB)`);

// -------------------------------------------------------------
// Benchmark 3: Mixed 0 dB SNR Speech Enhancement
// -------------------------------------------------------------
console.log('\n🎛️  Benchmark 3: Mixed Speech Enhancement at 0 dB SNR');

const convDuration = 1.2;
const convSamples = Math.floor(convDuration * SAMPLE_RATE);
const convFrames = Math.floor(convSamples / FRAME_SIZE);

const speechTrack = generateConversationalSpeech(convDuration, SAMPLE_RATE, 0.3);
const noiseTrack = generateNoise(convDuration, SAMPLE_RATE, 'combined', 0.05);
const { mixed: noisyInput } = mixAudio(speechTrack, noiseTrack, 0); // 0 dB SNR

const mixedProcessor = new RNNoiseProcessor(SAMPLE_RATE);
const enhancedOutput = new Float32Array(convSamples);

for (let f = 0; f < convFrames; f++) {
  const offset = f * FRAME_SIZE;
  const inFrame = noisyInput.subarray(offset, offset + FRAME_SIZE);
  const outFrame = enhancedOutput.subarray(offset, offset + FRAME_SIZE);
  mixedProcessor.processFrame(inFrame, outFrame);
}

// Inter-phrase pause analysis (0.53s - 0.68s, allowing 80ms VAD hangover release)
const pauseStart = Math.floor(0.53 * SAMPLE_RATE);
const pauseEnd = Math.floor(0.68 * SAMPLE_RATE);
const pauseNoiseIn = computeRmsDb(noisyInput.subarray(pauseStart, pauseEnd));
const pauseNoiseOut = computeRmsDb(enhancedOutput.subarray(pauseStart, pauseEnd));
const pauseSuppressionDb = pauseNoiseIn - pauseNoiseOut;

// Active speech analysis (0.05s - 0.40s)
const speechStart = Math.floor(0.05 * SAMPLE_RATE);
const speechEnd = Math.floor(0.40 * SAMPLE_RATE);
const activeSpeechIn = computeRmsDb(speechTrack.subarray(speechStart, speechEnd));
const activeSpeechOut = computeRmsDb(enhancedOutput.subarray(speechStart, speechEnd));
const speechEnergyLossDb = Math.abs(activeSpeechOut - activeSpeechIn);

// Speech-to-Noise Contrast Expansion (Dynamic Range enhancement)
const dynamicRangeIn = activeSpeechIn - pauseNoiseIn;
const dynamicRangeOut = activeSpeechOut - pauseNoiseOut;
const contrastGainDb = dynamicRangeOut - dynamicRangeIn;

assert(pauseSuppressionDb > 5.0, `Inter-phrase background noise suppressed during speech pauses (${pauseSuppressionDb.toFixed(1)} dB reduction > 5.0 dB)`);
assert(speechEnergyLossDb < 2.5, `Active vocal formant energy preserved during speech (${speechEnergyLossDb.toFixed(2)} dB delta < 2.5 dB)`);
assert(contrastGainDb > 4.0, `Voice-to-noise dynamic contrast expanded (+${contrastGainDb.toFixed(1)} dB contrast gain > 4.0 dB)`);

// -------------------------------------------------------------
// Benchmark 4: Real-Time Execution Latency Watchdog
// -------------------------------------------------------------
console.log('\n⚡ Benchmark 4: Real-Time Latency Watchdog (< 4.0 ms budget)');

const perfProcessor = new RNNoiseProcessor(SAMPLE_RATE);
const tempIn = new Float32Array(FRAME_SIZE);
const tempOut = new Float32Array(FRAME_SIZE);

// Populate with active signal
for (let i = 0; i < FRAME_SIZE; i++) {
  tempIn[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
}

const frameLatenciesMs: number[] = [];
for (let iter = 0; iter < 100; iter++) {
  const t0 = performance.now();
  perfProcessor.processFrame(tempIn, tempOut);
  const t1 = performance.now();
  frameLatenciesMs.push(t1 - t0);
}

const maxLatencyMs = Math.max(...frameLatenciesMs);
const avgLatencyMs = frameLatenciesMs.reduce((a, b) => a + b, 0) / frameLatenciesMs.length;

assert(maxLatencyMs < 4.0, `Peak frame latency within 4.0 ms fail-safe watchdog (${maxLatencyMs.toFixed(3)} ms < 4.0 ms)`);
assert(avgLatencyMs < 0.8, `Average frame latency consumes < 8% of 10 ms audio quantum (${avgLatencyMs.toFixed(3)} ms < 0.8 ms)`);

// -------------------------------------------------------------
// Benchmark 5: Acoustic Clarity Profiles Calibration
// -------------------------------------------------------------
console.log('\n🎚️  Benchmark 5: Acoustic Clarity Profile Presets');

const profiles = ['balanced', 'voice-boost', 'studio-clean', 'neural-enhanced'] as const;
for (const p of profiles) {
  const prof = ACOUSTIC_PROFILES[p];
  assert(prof !== undefined, `Profile '${p}' is defined`);
  assert(prof.highpassFreq >= 40 && prof.highpassFreq <= 150, `Profile '${p}' highpass filter within telecom standards (${prof.highpassFreq} Hz)`);
  assert(prof.presenceGain >= 0 && prof.presenceGain <= 6.0, `Profile '${p}' vocal presence gain calibrated (${prof.presenceGain} dB)`);
  assert(prof.gateThreshold <= -30 && prof.gateThreshold >= -60, `Profile '${p}' noise gate threshold calibrated (${prof.gateThreshold} dBFS)`);
}

// -------------------------------------------------------------
// Benchmark 6: Export Physical WAV Audio Samples
// -------------------------------------------------------------
console.log('\n💾 Benchmark 6: Exporting Physical 16-bit PCM WAV Files');

const outputDir = path.resolve(__dirname, '../dist/audio-samples');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const inputWavPath = path.join(outputDir, 'input-noisy-0db.wav');
const outputWavPath = path.join(outputDir, 'output-neural-enhanced.wav');

const inputWavBuffer = encodeWavFile(noisyInput, SAMPLE_RATE);
const outputWavBuffer = encodeWavFile(enhancedOutput, SAMPLE_RATE);

fs.writeFileSync(inputWavPath, Buffer.from(inputWavBuffer.buffer));
fs.writeFileSync(outputWavPath, Buffer.from(outputWavBuffer.buffer));

const inputStats = fs.statSync(inputWavPath);
const outputStats = fs.statSync(outputWavPath);

assert(inputStats.size > 96000, `Input noisy WAV file generated (${(inputStats.size / 1024).toFixed(1)} KB at ${inputWavPath})`);
assert(outputStats.size > 96000, `Output enhanced WAV file generated (${(outputStats.size / 1024).toFixed(1)} KB at ${outputWavPath})`);

console.log('\n======================================================');
console.log(`All audio benchmarks passed: ${passedAssertions}/${totalAssertions} assertions verified.`);
console.log('======================================================\n');
