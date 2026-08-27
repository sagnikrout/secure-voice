/**
 * Google Lyra v2 WebRTC Encoded Transform (Insertable Streams) Integration
 * 
 * Intercepts RTCEncodedAudioFrames before SRTP encryption on the sender side
 * and after SRTP decryption on the receiver side to route Lyra neural bitstreams.
 */

import { LYRA_CONFIG } from '../../constants/config';
import { LyraManager } from './lyraManager';

export interface LyraFrameHeader {
  magic: number;         // 0x4C ('L')
  seq: number;           // 0 - 255
  bitrateCode: number;   // 0 (3.2k), 1 (6.0k), 2 (9.2k)
}

/**
 * Check if an encoded WebRTC RTP frame carries a Lyra neural payload
 */
export function isLyraFrame(data: Uint8Array | ArrayBuffer): boolean {
  if (!data) return false;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return bytes.length >= 4 && bytes[0] === LYRA_CONFIG.HEADER_BYTE_MAGIC;
}

/**
 * Pack a Lyra neural payload with a 3-byte metadata header
 */
export function packLyraFrame(payload: Uint8Array, seq: number, bitrate: number = 3200): Uint8Array {
  const headerSize = 3;
  const frame = new Uint8Array(headerSize + payload.length);
  
  let bitrateCode = 0;
  if (bitrate === 6000) bitrateCode = 1;
  else if (bitrate === 9200) bitrateCode = 2;

  frame[0] = LYRA_CONFIG.HEADER_BYTE_MAGIC; // 0x4C
  frame[1] = seq & 0xff;                    // Sequence number (0-255)
  frame[2] = bitrateCode;                   // Bitrate indicator

  frame.set(payload, headerSize);
  return frame;
}

/**
 * Unpack a received Lyra frame into header metadata and payload
 */
export function unpackLyraFrame(data: Uint8Array): {
  header: LyraFrameHeader;
  payload: Uint8Array;
} | null {
  if (!isLyraFrame(data)) return null;

  const header: LyraFrameHeader = {
    magic: data[0],
    seq: data[1],
    bitrateCode: data[2]
  };

  const payload = data.subarray(3);
  return { header, payload };
}

export class LyraTransformController {
  private seqOut: number = 0;
  private seqInLast: number = -1;
  private manager: LyraManager;

  constructor(manager: LyraManager = LyraManager.getInstance()) {
    this.manager = manager;
  }

  /**
   * Attach transform to an RTCRtpSender (Outbound Audio)
   */
  public attachSender(sender: RTCRtpSender): boolean {
    if (!sender) return false;

    try {
      // 1. Check createEncodedStreams API
      if (typeof (sender as any).createEncodedStreams === 'function') {
        const { readable, writable } = (sender as any).createEncodedStreams();
        const transformStream = new TransformStream({
          transform: (chunk, controller) => {
            if (this.manager.getActiveCodec() === 'lyra') {
              const lyraPayload = this.manager.pullEncodedFrame();
              if (lyraPayload && lyraPayload.length > 0) {
                const packed = packLyraFrame(lyraPayload, this.seqOut++, 3200);
                chunk.data = packed.buffer;
              }
            }
            controller.enqueue(chunk);
          }
        });
        readable.pipeThrough(transformStream).pipeTo(writable).catch(() => {});
        return true;
      }
    } catch (e) {
      console.warn('Sender createEncodedStreams error:', e);
    }

    return false;
  }

  /**
   * Attach transform to an RTCRtpReceiver (Inbound Audio)
   */
  public attachReceiver(receiver: RTCRtpReceiver): boolean {
    if (!receiver) return false;

    try {
      if (typeof (receiver as any).createEncodedStreams === 'function') {
        const { readable, writable } = (receiver as any).createEncodedStreams();
        const transformStream = new TransformStream({
          transform: (chunk, controller) => {
            const data = new Uint8Array(chunk.data);
            if (isLyraFrame(data)) {
              const unpacked = unpackLyraFrame(data);
              if (unpacked) {
                // Packet loss detection & Generative Neural PLC
                if (this.seqInLast !== -1) {
                  const expectedSeq = (this.seqInLast + 1) & 0xff;
                  if (unpacked.header.seq !== expectedSeq) {
                    const diff = (unpacked.header.seq - expectedSeq + 256) % 256;
                    // Trigger PLC for missing intermediate frames (capped at 5 frames to avoid runaway)
                    const missingCount = Math.min(diff, 5);
                    for (let i = 0; i < missingCount; i++) {
                      this.manager.synthesizePlc();
                    }
                  }
                }
                this.seqInLast = unpacked.header.seq;

                // Decode current frame
                this.manager.decodeFrame(unpacked.payload);
              }
            }
            controller.enqueue(chunk);
          }
        });
        readable.pipeThrough(transformStream).pipeTo(writable).catch(() => {});
        return true;
      }
    } catch (e) {
      console.warn('Receiver createEncodedStreams error:', e);
    }

    return false;
  }

  public reset(): void {
    this.seqOut = 0;
    this.seqInLast = -1;
  }
}

export const lyraTransformController = new LyraTransformController();
