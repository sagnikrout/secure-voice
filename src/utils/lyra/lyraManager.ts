/**
 * Google Lyra v2 Codec Manager
 * 
 * Coordinates:
 * - Neural Worker lifecycle and asynchronous frame queues.
 * - Web Audio AudioWorklet framing and playout destination.
 * - Bandwidth telemetry, encoding/decoding counters, and neural PLC metrics.
 */

import { LYRA_CONFIG } from '../../constants/config';
import { LyraBitrate, LyraStats, CodecType } from '../../types';
import { lyraWasmLoader } from './lyraWasmLoader';
import { registerLyraAudioWorklet } from './lyraAudioWorklet';
import { LyraNeuralProcessor } from './lyraWorker';

export class LyraManager {
  private static instance: LyraManager | null = null;
  private processor: LyraNeuralProcessor;
  private worker: Worker | null = null;
  private activeCodec: CodecType = 'opus';
  private bitrate: LyraBitrate = LYRA_CONFIG.DEFAULT_BITRATE;
  private framesEncoded: number = 0;
  private framesDecoded: number = 0;
  private plcFramesSynthesized: number = 0;
  private isInitialized: boolean = false;
  private encodedFrameQueue: Uint8Array[] = [];
  private onFrameDecoded?: (pcm: Float32Array) => void;
  private workletNode: AudioWorkletNode | null = null;
  private audioCtx: AudioContext | null = null;

  private constructor() {
    this.processor = new LyraNeuralProcessor();
  }

  public static getInstance(): LyraManager {
    if (!LyraManager.instance) {
      LyraManager.instance = new LyraManager();
    }
    return LyraManager.instance;
  }

  /**
   * Initialize Lyra subsystem for an active call session
   */
  public async init(options: {
    audioCtx?: AudioContext;
    bitrate?: LyraBitrate;
    onFrameDecoded?: (pcm: Float32Array) => void;
  } = {}): Promise<boolean> {
    this.bitrate = options.bitrate || LYRA_CONFIG.DEFAULT_BITRATE;
    this.onFrameDecoded = options.onFrameDecoded;
    this.processor.init(this.bitrate);

    const compat = lyraWasmLoader.checkCompatibility();
    if (!compat.simd) {
      this.activeCodec = 'opus';
      return false;
    }

    if (options.audioCtx) {
      this.audioCtx = options.audioCtx;
      await registerLyraAudioWorklet(options.audioCtx);
    }

    this.isInitialized = true;
    this.activeCodec = 'lyra';
    this.framesEncoded = 0;
    this.framesDecoded = 0;
    this.plcFramesSynthesized = 0;
    this.encodedFrameQueue = [];

    return true;
  }

  public getActiveCodec(): CodecType {
    return this.activeCodec;
  }

  public setActiveCodec(codec: CodecType): void {
    this.activeCodec = codec;
  }

  public setBitrate(bitrate: LyraBitrate): void {
    this.bitrate = bitrate;
    this.processor.setBitrate(bitrate);
  }

  /**
   * Encode 320 PCM Float32 samples to Lyra neural bitstream (8 bytes at 3.2 kbps)
   */
  public encodePcm(pcm: Float32Array): Uint8Array {
    if (!pcm || pcm.length < LYRA_CONFIG.FRAME_SIZE_SAMPLES) {
      return new Uint8Array(0);
    }

    const encoded = this.processor.encode(pcm);
    this.framesEncoded++;
    this.encodedFrameQueue.push(encoded);
    if (this.encodedFrameQueue.length > 20) {
      this.encodedFrameQueue.shift(); // Bound memory buffer
    }

    return encoded;
  }

  /**
   * Pull the latest encoded neural frame for WebRTC transmission
   */
  public pullEncodedFrame(): Uint8Array | null {
    return this.encodedFrameQueue.shift() || null;
  }

  /**
   * Decode incoming Lyra neural frame into 320 Float32 samples
   */
  public decodeFrame(encoded: Uint8Array): Float32Array {
    if (!encoded || encoded.length === 0) {
      return this.synthesizePlc();
    }

    const pcm = this.processor.decode(encoded);
    this.framesDecoded++;
    this.onFrameDecoded?.(pcm);
    return pcm;
  }

  /**
   * Synthesize missing frame using generative neural PLC
   */
  public synthesizePlc(): Float32Array {
    const pcm = this.processor.generatePlc();
    this.plcFramesSynthesized++;
    this.onFrameDecoded?.(pcm);
    return pcm;
  }

  /**
   * Get real-time Lyra statistics and data rate
   */
  public getStats(): LyraStats {
    const bytesPerFrame = LYRA_CONFIG.BYTES_PER_FRAME[this.bitrate] || 8;
    const framesPerSec = 1000 / LYRA_CONFIG.FRAME_DURATION_MS; // 50 fps
    const rawBandwidthKbps = (bytesPerFrame * 8 * framesPerSec) / 1000;

    return {
      activeCodec: this.activeCodec,
      bitrateBps: this.bitrate,
      framesEncoded: this.framesEncoded,
      framesDecoded: this.framesDecoded,
      plcFramesSynthesized: this.plcFramesSynthesized,
      rawBandwidthKbps,
      simdSupported: lyraWasmLoader.checkCompatibility().simd,
      workerActive: this.isInitialized
    };
  }

  /**
   * Teardown and reset memory allocations
   */
  public reset(): void {
    this.processor.reset();
    this.framesEncoded = 0;
    this.framesDecoded = 0;
    this.plcFramesSynthesized = 0;
    this.encodedFrameQueue = [];
    this.isInitialized = false;
    this.activeCodec = 'opus';
  }
}

export const lyraManager = LyraManager.getInstance();
