/**
 * Air-Gapped QR Code & Clipboard Manual Signaling
 *
 * Encodes and compresses SDP offers, answers, and ICE candidates into high-density
 * QR-compatible string payloads for 100% offline / serverless peer discovery.
 */

import { QrSignalingPayload } from './types';

export class QrCodeSignaling {
  /**
   * Compact and strip non-essential attributes from SDP to minimize QR density
   */
  static compactSdp(sdp: string): string {
    if (!sdp || typeof sdp !== 'string') return '';
    // Retain only essential media, crypto, fingerprint, and codec lines
    const essentialLines = sdp.split(/\r?\n/).filter(line => {
      if (!line) return false;
      return (
        line.startsWith('v=') ||
        line.startsWith('o=') ||
        line.startsWith('s=') ||
        line.startsWith('t=') ||
        line.startsWith('m=') ||
        line.startsWith('c=') ||
        line.startsWith('a=ice-ufrag:') ||
        line.startsWith('a=ice-pwd:') ||
        line.startsWith('a=fingerprint:') ||
        line.startsWith('a=setup:') ||
        line.startsWith('a=mid:') ||
        line.startsWith('a=rtpmap:') ||
        line.startsWith('a=fmtp:') ||
        line.startsWith('a=candidate:')
      );
    });
    return essentialLines.join('\n');
  }

  /**
   * Encode SDP offer into compact QR string
   */
  static encodeOffer(
    peerId: string,
    sdp: string,
    options: {
      candidates?: RTCIceCandidateInit[];
      publicKey?: JsonWebKey;
      fingerprint?: string;
    } = {}
  ): string {
    const payload: QrSignalingPayload = {
      v: 1,
      peerId,
      type: 'offer',
      sdp: this.compactSdp(sdp),
      candidates: options.candidates,
      publicKey: options.publicKey,
      fingerprint: options.fingerprint
    };

    return this.serialize(payload);
  }

  /**
   * Encode SDP answer into compact QR string
   */
  static encodeAnswer(
    peerId: string,
    sdp: string,
    options: {
      candidates?: RTCIceCandidateInit[];
      publicKey?: JsonWebKey;
      fingerprint?: string;
    } = {}
  ): string {
    const payload: QrSignalingPayload = {
      v: 1,
      peerId,
      type: 'answer',
      sdp: this.compactSdp(sdp),
      candidates: options.candidates,
      publicKey: options.publicKey,
      fingerprint: options.fingerprint
    };

    return this.serialize(payload);
  }

  /**
   * Serialize payload object to base64
   */
  static serialize(payload: QrSignalingPayload): string {
    const jsonStr = JSON.stringify(payload);
    try {
      if (typeof btoa !== 'undefined') {
        const bytes = new TextEncoder().encode(jsonStr);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return `SV1:${btoa(binary)}`;
      }
    } catch (e) {}
    return `SV1_JSON:${jsonStr}`;
  }

  /**
   * Decode QR string or copy-paste text back into QrSignalingPayload
   */
  static decode(encoded: string): QrSignalingPayload {
    if (!encoded || typeof encoded !== 'string') {
      throw new Error('Invalid or empty QR signaling string');
    }

    const trimmed = encoded.trim();

    if (trimmed.startsWith('SV1:')) {
      const b64 = trimmed.slice(4);
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const jsonStr = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(jsonStr);
      this.validate(parsed);
      return parsed;
    }

    if (trimmed.startsWith('SV1_JSON:')) {
      const jsonStr = trimmed.slice(9);
      const parsed = JSON.parse(jsonStr);
      this.validate(parsed);
      return parsed;
    }

    // Direct JSON fallback
    const parsed = JSON.parse(trimmed);
    this.validate(parsed);
    return parsed;
  }

  /**
   * Validate decoded payload structure
   */
  static validate(payload: any): boolean {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Malformed signaling payload');
    }
    if (!payload.peerId || typeof payload.peerId !== 'string') {
      throw new Error('Missing peerId in signaling payload');
    }
    if (payload.type !== 'offer' && payload.type !== 'answer') {
      throw new Error(`Invalid signaling type: ${payload.type}`);
    }
    if (!payload.sdp || typeof payload.sdp !== 'string') {
      throw new Error('Missing SDP in signaling payload');
    }
    return true;
  }
}
