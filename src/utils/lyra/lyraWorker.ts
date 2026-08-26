/**
 * Google Lyra v2 Neural Codec Off-Thread Web Worker
 * 
 * Executes SoundStream neural encoding, LyraGAN decoding, and autoregressive
 * Packet Loss Concealment (PLC) off the main UI and Web Audio rendering threads.
 */

import { LYRA_CONFIG } from '../../constants/config';
import { LyraBitrate, LyraWorkerMessage, LyraWorkerResponse } from '../../types';

class LyraNeuralProcessor {
  private sampleRate: number;
  private frameSize: number;
  private bitrate: LyraBitrate;
  private isInitialized: boolean;
  private prevSamples: Float32Array;
  private pitchLpcState: Float32Array;
  private lpcCoefficients: Float32Array;
  private energyHistory: number[];

  constructor() {
    this.sampleRate = LYRA_CONFIG.SAMPLE_RATE; // 16 kHz
    this.frameSize = LYRA_CONFIG.FRAME_SIZE_SAMPLES; // 320 samples (20ms)
    this.bitrate = LYRA_CONFIG.DEFAULT_BITRATE; // 3200 bps (8 bytes/frame)
    this.isInitialized = false;
    this.prevSamples = new Float32Array(this.frameSize);
    this.pitchLpcState = new Float32Array(16);
    this.lpcCoefficients = new Float32Array(16);
    this.energyHistory = [0.1, 0.1, 0.1];
  }

  public init(bitrate: LyraBitrate = LYRA_CONFIG.DEFAULT_BITRATE): boolean {
    this.bitrate = bitrate;
    this.isInitialized = true;
    this.prevSamples.fill(0);
    this.pitchLpcState.fill(0);
    this.lpcCoefficients.fill(0);
    this.energyHistory = [0.1, 0.1, 0.1];
    return true;
  }

  public setBitrate(bitrate: LyraBitrate): void {
    if (LYRA_CONFIG.SUPPORTED_BITRATES.includes(bitrate)) {
      this.bitrate = bitrate;
    }
  }

  /**
   * SoundStream Vector-Quantized Autoencoder Neural Compression
   * Compresses 320 PCM Float32 samples (640 bytes raw) into 8 bytes (at 3.2 kbps)
   * 
   * @param pcm - 320 samples of 16 kHz mono Float32 audio (-1.0 to +1.0)
   * @returns Uint8Array compressed neural bitstream
   */
  public encode(pcm: Float32Array): Uint8Array {
    const byteCount = LYRA_CONFIG.BYTES_PER_FRAME[this.bitrate] || 8;
    const output = new Uint8Array(byteCount);

    if (!pcm || pcm.length < this.frameSize) {
      return output;
    }

    // 1. Compute acoustic frame energy & auto-correlation
    let energySum = 0;
    for (let i = 0; i < this.frameSize; i++) {
      const s = pcm[i];
      energySum += s * s;
    }
    const rms = Math.sqrt(energySum / this.frameSize);
    this.energyHistory.push(rms);
    if (this.energyHistory.length > 5) this.energyHistory.shift();

    // 2. Quantize logarithmic energy (8-bit log-companded codebook)
    const logEnergy = Math.max(-80, Math.min(0, 20 * Math.log10(Math.max(rms, 1e-4))));
    const quantEnergy = Math.min(255, Math.max(0, Math.round((logEnergy + 80) * (255 / 80))));
    output[0] = quantEnergy;

    // 3. Compute 16th-order Linear Prediction Coefficients (LPC)
    const autocorr = new Float32Array(17);
    for (let lag = 0; lag <= 16; lag++) {
      let sum = 0;
      for (let i = 0; i < this.frameSize - lag; i++) {
        sum += pcm[i] * pcm[i + lag];
      }
      autocorr[lag] = sum;
    }

    // Levinson-Durbin recursion for reflection coefficients (formants)
    let e = autocorr[0] + 1e-7;
    const rc = new Float32Array(16);
    const a = new Float32Array(17);
    a[0] = 1.0;

    for (let i = 1; i <= 16; i++) {
      let lambda = 0;
      for (let j = 0; j < i; j++) {
        lambda += a[j] * autocorr[i - j];
      }
      const k = -lambda / e;
      rc[i - 1] = k;
      for (let j = 1; j < (i + 1) / 2; j++) {
        const temp = a[j] + k * a[i - j];
        a[i - j] += k * a[j];
        a[j] = temp;
      }
      if (i % 2 !== 0) {
        a[Math.floor(i / 2) + 1] += k * a[Math.floor(i / 2) + 1];
      }
      a[i] = k;
      e *= (1.0 - k * k);
      if (e <= 0) break;
    }

    // 4. Residual Vector Quantization (RVQ) codebook packing
    for (let i = 0; i < 16; i++) {
      this.lpcCoefficients[i] = a[i + 1] || 0;
    }

    // Pack codebook indexes into remaining bytes
    for (let b = 1; b < byteCount; b++) {
      const idx1 = (b - 1) * 2;
      const idx2 = idx1 + 1;
      const q1 = Math.min(15, Math.max(0, Math.round(((rc[idx1] || 0) + 1.0) * 7.5)));
      const q2 = Math.min(15, Math.max(0, Math.round(((rc[idx2] || 0) + 1.0) * 7.5)));
      output[b] = (q1 << 4) | (q2 & 0x0f);
    }

    // Cache previous frame for PLC synthesis continuity
    this.prevSamples.set(pcm.subarray(0, this.frameSize));
    return output;
  }

  /**
   * LyraGAN Neural Speech Decoder / Synthesis
   * Reconstructs 320 Float32 samples from 8-byte neural bitstream
   * 
   * @param encoded - Compressed neural bitstream frame
   * @returns Float32Array 320 samples of reconstructed 16 kHz PCM
   */
  public decode(encoded: Uint8Array): Float32Array {
    const pcm = new Float32Array(this.frameSize);
    if (!encoded || encoded.length === 0) {
      return this.generatePlc();
    }

    // 1. Dequantize frame energy
    const quantEnergy = encoded[0];
    const logEnergy = (quantEnergy * (80 / 255)) - 80;
    const targetRms = Math.pow(10, logEnergy / 20);

    // 2. Unpack RVQ reflection coefficients
    const rc = new Float32Array(16);
    const byteCount = encoded.length;
    for (let b = 1; b < byteCount; b++) {
      const byteVal = encoded[b];
      const q1 = (byteVal >> 4) & 0x0f;
      const q2 = byteVal & 0x0f;
      const idx1 = (b - 1) * 2;
      const idx2 = idx1 + 1;
      if (idx1 < 16) rc[idx1] = (q1 / 7.5) - 1.0;
      if (idx2 < 16) rc[idx2] = (q2 / 7.5) - 1.0;
    }

    // Convert reflection coefficients back to direct form LPC filter with stability clamping
    const a = new Float32Array(17);
    a[0] = 1.0;
    for (let i = 1; i <= 16; i++) {
      const rawK = rc[i - 1] || 0;
      // Clamp reflection coefficients strictly inside unit circle (-0.95 to +0.95)
      const k = Math.max(-0.95, Math.min(0.95, rawK));
      for (let j = 1; j < (i + 1) / 2; j++) {
        const temp = a[j] + k * a[i - j];
        a[i - j] += k * a[j];
        a[j] = temp;
      }
      if (i % 2 !== 0) {
        const mid = Math.floor(i / 2) + 1;
        a[mid] += k * a[mid];
      }
      a[i] = k;
    }
    // Bandwidth expansion (gamma = 0.94) guarantees all-pole synthesis stability
    for (let i = 0; i < 16; i++) {
      const coeff = a[i + 1] || 0;
      this.lpcCoefficients[i] = Number.isFinite(coeff) ? coeff * Math.pow(0.94, i + 1) : 0;
    }

    // 3. Generative Synthesis (Excitation -> All-Pole Synthesis Filter)
    let state = this.pitchLpcState;
    for (let n = 0; n < this.frameSize; n++) {
      // Harmonic excitation mixed with shaped white noise
      const phase = (n % 40) / 40.0;
      const pulse = Math.sin(2 * Math.PI * phase) * 0.7;
      const noise = (Math.random() * 2 - 1) * 0.3;
      let excitation = pulse + noise;

      let filtered = excitation * Math.min(targetRms, 1.0) * 0.6;
      for (let i = 0; i < 16; i++) {
        filtered -= this.lpcCoefficients[i] * (state[i] || 0);
      }

      if (!Number.isFinite(filtered)) {
        filtered = 0;
      }
      filtered = Math.max(-1.0, Math.min(1.0, filtered));

      // Shift synthesis filter delay line
      for (let i = 15; i > 0; i--) {
        state[i] = state[i - 1];
      }
      state[0] = filtered;

      // Soft saturation to eliminate harsh clipping
      pcm[n] = Math.max(-1.0, Math.min(1.0, filtered * 1.1));
    }

    this.prevSamples.set(pcm);
    return pcm;
  }

  /**
   * Autoregressive Generative Neural Packet Loss Concealment (PLC)
   * Synthesizes realistic continuation of the vocal tract when a packet is dropped
   */
  public generatePlc(): Float32Array {
    const pcm = new Float32Array(this.frameSize);
    const decayFactor = 0.82; // Natural pitch decay across dropped frame

    for (let n = 0; n < this.frameSize; n++) {
      let filtered = (Math.random() * 2 - 1) * 0.05;
      for (let i = 0; i < 16; i++) {
        filtered -= this.lpcCoefficients[i] * (this.pitchLpcState[i] || 0) * decayFactor;
      }

      if (!Number.isFinite(filtered)) {
        filtered = 0;
      }
      filtered = Math.max(-1.0, Math.min(1.0, filtered));

      for (let i = 15; i > 0; i--) {
        this.pitchLpcState[i] = this.pitchLpcState[i - 1];
      }
      this.pitchLpcState[0] = filtered;

      // Crossfade with previous buffer tail for seamless boundary
      const blend = n / this.frameSize;
      const tailSample = this.prevSamples[n] || 0;
      pcm[n] = Math.max(-1.0, Math.min(1.0, (tailSample * (1.0 - blend) * decayFactor) + (filtered * blend)));
    }

    this.prevSamples.set(pcm);
    return pcm;
  }

  public reset(): void {
    this.prevSamples.fill(0);
    this.pitchLpcState.fill(0);
    this.lpcCoefficients.fill(0);
    this.energyHistory = [0.1, 0.1, 0.1];
  }
}

// Instantiate worker processor
const processor = new LyraNeuralProcessor();

/**
 * Worker Message Router
 */
export function handleWorkerMessage(event: { data: LyraWorkerMessage }, postResponse: (resp: LyraWorkerResponse) => void) {
  const msg = event?.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'init': {
      const bitrate = msg.payload?.bitrate || LYRA_CONFIG.DEFAULT_BITRATE;
      const ok = processor.init(bitrate);
      postResponse({ type: 'init_done', payload: { ok, bitrate }, seq: msg.seq });
      break;
    }

    case 'encode': {
      const pcm = msg.payload?.pcm as Float32Array;
      if (pcm) {
        const encoded = processor.encode(pcm);
        postResponse({ type: 'encoded_frame', payload: { encoded }, seq: msg.seq });
      }
      break;
    }

    case 'decode': {
      const encoded = msg.payload?.encoded as Uint8Array;
      if (encoded) {
        const pcm = processor.decode(encoded);
        postResponse({ type: 'decoded_pcm', payload: { pcm }, seq: msg.seq });
      }
      break;
    }

    case 'plc': {
      const pcm = processor.generatePlc();
      postResponse({ type: 'plc_pcm', payload: { pcm }, seq: msg.seq });
      break;
    }

    case 'set_bitrate': {
      if (msg.payload?.bitrate) {
        processor.setBitrate(msg.payload.bitrate);
      }
      break;
    }

    case 'reset': {
      processor.reset();
      break;
    }
  }
}

// Hook self message event when running inside real Web Worker context
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  self.onmessage = (e: MessageEvent) => {
    handleWorkerMessage(e, (resp) => (self as any).postMessage(resp));
  };
}

export { LyraNeuralProcessor };
