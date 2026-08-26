/**
 * Google Lyra v2 AudioWorkletProcessor Code & Resampling Helper
 * 
 * Provides:
 * - 16 kHz polyphase / linear resampler from arbitrary input sample rates (44.1k/48k).
 * - Exact 20ms (320-sample) ring-buffered chunking for the neural encoder.
 */

import { LYRA_CONFIG } from '../../constants/config';

export const LYRA_WORKLET_PROCESSOR_CODE = `
class LyraResamplerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = ${LYRA_CONFIG.SAMPLE_RATE}; // 16000
    this.targetFrameSize = ${LYRA_CONFIG.FRAME_SIZE_SAMPLES}; // 320 samples (20ms)
    this.inputSampleRate = options?.processorOptions?.sampleRate || 48000;
    this.resampleRatio = this.inputSampleRate / this.targetSampleRate;
    
    // Internal ring buffer (1024 samples capacity)
    this.buffer = new Float32Array(2048);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.bufferedCount = 0;

    // Resampler interpolation state
    this.resamplePhase = 0;
    this.lastInputSample = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'reset') {
        this.writeIndex = 0;
        this.readIndex = 0;
        this.bufferedCount = 0;
        this.resamplePhase = 0;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputChannel = input[0];
    const inputLength = inputChannel.length; // usually 128 samples

    // 1. Resample input channel to 16 kHz
    let inPos = 0;
    while (inPos < inputLength) {
      const idx = Math.floor(this.resamplePhase);
      const frac = this.resamplePhase - idx;

      let s0 = this.lastInputSample;
      let s1 = inputChannel[0];
      if (idx > 0 && idx < inputLength) {
        s0 = inputChannel[idx - 1];
        s1 = inputChannel[idx];
      } else if (idx >= inputLength) {
        break;
      }

      // Linear interpolation between sample points
      const interpolated = s0 + frac * (s1 - s0);

      // Push into ring buffer
      if (this.bufferedCount < this.buffer.length) {
        this.buffer[this.writeIndex] = interpolated;
        this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
        this.bufferedCount++;
      }

      this.resamplePhase += this.resampleRatio;
      inPos = Math.floor(this.resamplePhase);
    }

    this.resamplePhase -= inputLength;
    this.lastInputSample = inputChannel[inputLength - 1];

    // 2. Emit completed 320-sample (20ms) frames
    while (this.bufferedCount >= this.targetFrameSize) {
      const frame = new Float32Array(this.targetFrameSize);
      for (let i = 0; i < this.targetFrameSize; i++) {
        frame[i] = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.buffer.length;
      }
      this.bufferedCount -= this.targetFrameSize;

      // Transfer frame to main thread / Lyra worker
      this.port.postMessage({ type: 'pcm_frame', pcm: frame }, [frame.buffer]);
    }

    return true;
  }
}

registerProcessor('lyra-resampler-processor', LyraResamplerProcessor);
`;

/**
 * Register Lyra AudioWorklet processor module on an AudioContext
 */
export async function registerLyraAudioWorklet(audioCtx: AudioContext): Promise<boolean> {
  if (!audioCtx || typeof audioCtx.audioWorklet === 'undefined' || typeof audioCtx.audioWorklet.addModule !== 'function') {
    return false;
  }

  try {
    const blob = new Blob([LYRA_WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await audioCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.warn('Failed to register Lyra AudioWorklet module:', err);
    return false;
  }
}
