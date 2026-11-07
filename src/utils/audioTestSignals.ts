/**
 * Audio Test Signals & Acoustic Verification Utility
 *
 * Provides:
 * - Synthetic human vocal formant generator (F0 fundamental + resonant F1/F2/F3 vocal tract).
 * - Multi-source background acoustic noise generator (HVAC rumble, high-frequency hiss, transient clicks).
 * - Calibrated signal mixing at specified SNR (dB).
 * - RMS, SNR, and harmonic power measurement.
 * - Standard 16-bit PCM RIFF/WAVE file encoder for physical listening and spectral verification.
 */

export interface FormantConfig {
  f0: number; // Fundamental pitch in Hz (e.g., 160 Hz)
  f1: number; // Formant 1 frequency in Hz (vowel height, e.g., 500 Hz)
  f2: number; // Formant 2 frequency in Hz (vowel backness, e.g., 1500 Hz)
  f3: number; // Formant 3 frequency in Hz (vocal quality, e.g., 2500 Hz)
}

export const DEFAULT_VOWEL_FORMANTS: FormantConfig = {
  f0: 160,
  f1: 500,
  f2: 1500,
  f3: 2500
};

/**
 * Synthesize speech-like vocal tones with realistic formant filtering
 */
export function generateVocalTone(
  durationSec: number,
  sampleRate: number = 48000,
  formants: FormantConfig = DEFAULT_VOWEL_FORMANTS,
  amplitude: number = 0.3
): Float32Array {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const buffer = new Float32Array(totalSamples);
  const nyquist = sampleRate / 2;
  const maxHarmonic = Math.min(60, Math.floor(nyquist / formants.f0));

  // Formant bandwidths in Hz
  const b1 = 80;
  const b2 = 110;
  const b3 = 140;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // Sum glottal pulse harmonics filtered by vocal tract formant transfer functions
    for (let k = 1; k <= maxHarmonic; k++) {
      const freq = k * formants.f0;

      // Resonant peak gains (Lorentzian resonator model)
      const res1 = 1.0 / (1.0 + Math.pow((freq - formants.f1) / b1, 2));
      const res2 = 0.6 / (1.0 + Math.pow((freq - formants.f2) / b2, 2));
      const res3 = 0.3 / (1.0 + Math.pow((freq - formants.f3) / b3, 2));
      const spectralTilt = 1.0 / Math.pow(k, 0.7); // -6 dB/octave glottal spectral tilt

      const harmonicGain = (res1 + res2 + res3) * spectralTilt;
      sample += harmonicGain * Math.sin(2 * Math.PI * freq * t);
    }

    // Apply envelope: 30ms rise, sustained body, 40ms fall
    const attackSamples = Math.floor(0.03 * sampleRate);
    const releaseSamples = Math.floor(0.04 * sampleRate);
    let env = 1.0;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else if (i > totalSamples - releaseSamples) {
      env = (totalSamples - i) / releaseSamples;
    }

    buffer[i] = sample * env;
  }

  // Normalize peak to requested amplitude
  let maxVal = 0;
  for (let i = 0; i < totalSamples; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > maxVal) maxVal = abs;
  }
  if (maxVal > 1e-6) {
    const scale = amplitude / maxVal;
    for (let i = 0; i < totalSamples; i++) {
      buffer[i] *= scale;
    }
  }

  return buffer;
}

/**
 * Generate synthetic background noise (HVAC rumble, hiss, and transient spikes)
 */
export function generateNoise(
  durationSec: number,
  sampleRate: number = 48000,
  profile: 'hvac' | 'hiss' | 'clicks' | 'combined' = 'combined',
  amplitude: number = 0.05
): Float32Array {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const buffer = new Float32Array(totalSamples);

  let brownAccumulator = 0;

  for (let i = 0; i < totalSamples; i++) {
    const white = (Math.random() * 2 - 1);
    let sample = 0;

    if (profile === 'hvac' || profile === 'combined') {
      // Brown noise (integrated white noise, low frequency rumble)
      brownAccumulator = (brownAccumulator + (0.02 * white)) / 1.02;
      sample += brownAccumulator * 3.0;
    }

    if (profile === 'hiss' || profile === 'combined') {
      // High frequency hiss
      sample += white * 0.4;
    }

    if (profile === 'clicks' || profile === 'combined') {
      // Sparse keyboard / transient clicks (1 in every 3000 samples)
      if (Math.random() < 0.0003) {
        sample += (Math.random() * 2 - 1) * 2.5;
      }
    }

    buffer[i] = sample * amplitude;
  }

  return buffer;
}

/**
 * Mix speech and noise at a calibrated Signal-to-Noise Ratio (dB)
 */
export function mixAudio(
  speech: Float32Array,
  noise: Float32Array,
  targetSnrDb: number
): { mixed: Float32Array; scaledNoise: Float32Array } {
  const len = Math.min(speech.length, noise.length);
  const mixed = new Float32Array(len);
  const scaledNoise = new Float32Array(len);

  // Compute root-mean-square (RMS) power
  let speechPower = 0;
  let noisePower = 0;
  for (let i = 0; i < len; i++) {
    speechPower += speech[i] * speech[i];
    noisePower += noise[i] * noise[i];
  }
  const speechRms = Math.sqrt(speechPower / len);
  const noiseRms = Math.sqrt(noisePower / len);

  // Scaling factor for desired SNR
  const targetRatio = Math.pow(10, targetSnrDb / 20);
  const scale = noiseRms > 1e-9 ? (speechRms / (targetRatio * noiseRms)) : 1.0;

  for (let i = 0; i < len; i++) {
    scaledNoise[i] = noise[i] * scale;
    mixed[i] = speech[i] + scaledNoise[i];
  }

  return { mixed, scaledNoise };
}

/**
 * Compute Root Mean Square (RMS) level in dBFS
 */
export function computeRmsDb(samples: Float32Array): number {
  if (samples.length === 0) return -120;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  if (rms <= 1e-6) return -120;
  return 20 * Math.log10(rms);
}

/**
 * Compute Signal-to-Noise Ratio (SNR) in dB given clean speech and noise residual
 */
export function computeSnrDb(cleanSpeech: Float32Array, processed: Float32Array): number {
  const len = Math.min(cleanSpeech.length, processed.length);
  let signalPower = 0;
  let errorPower = 0;

  for (let i = 0; i < len; i++) {
    signalPower += cleanSpeech[i] * cleanSpeech[i];
    const error = processed[i] - cleanSpeech[i];
    errorPower += error * error;
  }

  if (errorPower <= 1e-12) return 60; // Clean theoretical floor
  if (signalPower <= 1e-12) return -60;

  return 10 * Math.log10(signalPower / errorPower);
}

/**
 * Encode raw Float32Array PCM samples into standard 16-bit PCM RIFF/WAVE format
 */
export function encodeWavFile(samples: Float32Array, sampleRate: number = 48000): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const chunkSize = 36 + dataSize;

  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);

  // RIFF Header
  buffer.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, chunkSize, true);
  buffer.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // "fmt " Subchunk
  buffer.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);              // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);     // NumChannels (1 mono)
  view.setUint32(24, sampleRate, true);      // SampleRate (48000)
  view.setUint32(28, byteRate, true);        // ByteRate
  view.setUint16(32, blockAlign, true);      // BlockAlign
  view.setUint16(34, bitsPerSample, true);   // BitsPerSample

  // "data" Subchunk
  buffer.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataSize, true);

  return buffer;
}

/**
 * Synthesize conversational speech with natural inter-phrase pauses
 */
export function generateConversationalSpeech(
  durationSec: number = 1.2,
  sampleRate: number = 48000,
  amplitude: number = 0.3
): Float32Array {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const buffer = new Float32Array(totalSamples);

  // Phrase 1: 0.0s - 0.45s (Formants /a/: 160Hz, 500Hz, 1500Hz)
  const p1Len = 0.45;
  const p1 = generateVocalTone(p1Len, sampleRate, { f0: 160, f1: 500, f2: 1500, f3: 2500 }, amplitude);

  // Pause: 0.45s - 0.70s (250ms inter-phrase pause)

  // Phrase 2: 0.70s - 1.15s (Formants /i/: 175Hz, 300Hz, 2200Hz)
  const p2Len = 0.45;
  const p2Start = Math.floor(0.70 * sampleRate);
  const p2 = generateVocalTone(p2Len, sampleRate, { f0: 175, f1: 300, f2: 2200, f3: 3000 }, amplitude);

  buffer.set(p1, 0);
  if (p2Start + p2.length <= totalSamples) {
    buffer.set(p2, p2Start);
  }

  return buffer;
}
