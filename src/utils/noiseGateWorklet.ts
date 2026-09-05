/**
 * SecureVoice Real-time AudioWorklet Noise Gate
 *
 * Runs per 128-sample quantum (~2.6ms at 48kHz) directly on the Web Audio
 * rendering thread. Offloads all RMS calculation and gain envelope modulation
 * from the main JavaScript thread, eliminating micro-stutters during UI renders.
 */

export const NOISE_GATE_WORKLET_NAME = 'securevoice-noise-gate';

export const NOISE_GATE_WORKLET_CODE = `
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options?.processorOptions || {};
    this.thresholdDb = typeof opts.thresholdDb === 'number' ? opts.thresholdDb : -46;
    this.floor = typeof opts.floor === 'number' ? opts.floor : 0.02;
    this.holdSamples = Math.round((opts.holdMs || 80) * (sampleRate / 1000));
    this.attackCoeff = Math.exp(-1 / (0.010 * sampleRate));
    this.releaseCoeff = Math.exp(-1 / (0.150 * sampleRate));
    this.currentGain = 1.0;
    this.samplesSinceSpeech = 0;
    this.enabled = opts.enabled !== false;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (typeof data.thresholdDb === 'number') this.thresholdDb = data.thresholdDb;
      if (typeof data.floor === 'number') this.floor = data.floor;
      if (typeof data.enabled === 'boolean') this.enabled = data.enabled;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const channelCount = Math.min(input.length, output.length);
    const inputLength = input[0].length;

    if (!this.enabled) {
      for (let c = 0; c < channelCount; c++) {
        output[c].set(input[c]);
      }
      return true;
    }

    // 1. RMS Energy Calculation over channel 0
    let sumSq = 0;
    const ch0 = input[0];
    for (let i = 0; i < inputLength; i++) {
      const sample = ch0[i];
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / inputLength);
    const db = 20 * Math.log10(Math.max(rms, 1e-5));

    // 2. Gate Decision with Hold Window
    let targetGain = this.floor;
    if (db >= this.thresholdDb) {
      this.samplesSinceSpeech = 0;
      targetGain = 1.0;
    } else {
      this.samplesSinceSpeech += inputLength;
      if (this.samplesSinceSpeech < this.holdSamples) {
        targetGain = 1.0;
      }
    }

    // 3. Smooth Sample-Accurate Gain Modulation (Exponential Envelope)
    for (let i = 0; i < inputLength; i++) {
      if (targetGain > this.currentGain) {
        this.currentGain = targetGain + (this.currentGain - targetGain) * this.attackCoeff;
      } else {
        this.currentGain = targetGain + (this.currentGain - targetGain) * this.releaseCoeff;
      }
      for (let c = 0; c < channelCount; c++) {
        output[c][i] = input[c][i] * this.currentGain;
      }
    }

    return true;
  }
}

registerProcessor('${NOISE_GATE_WORKLET_NAME}', NoiseGateProcessor);
`;

/**
 * Register the noise gate AudioWorklet module on the given AudioContext.
 */
export async function registerNoiseGateWorklet(ctx: AudioContext): Promise<boolean> {
  if (!ctx || typeof ctx.audioWorklet === 'undefined' || typeof ctx.audioWorklet.addModule !== 'function') {
    return false;
  }

  try {
    let url: string;
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([NOISE_GATE_WORKLET_CODE], { type: 'application/javascript' });
      url = URL.createObjectURL(blob);
    } else {
      url = `data:application/javascript;base64,${btoa(NOISE_GATE_WORKLET_CODE)}`;
    }

    await ctx.audioWorklet.addModule(url);
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function' && !url.startsWith('data:')) {
      URL.revokeObjectURL(url);
    }
    return true;
  } catch (err) {
    console.warn('Failed to register noise gate AudioWorklet module:', err);
    return false;
  }
}
