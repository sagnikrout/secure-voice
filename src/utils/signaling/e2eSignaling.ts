/**
 * End-to-End Encrypted (E2E) Signaling Layer
 *
 * Implements Web Crypto ECDH (P-256) key exchange and AES-256-GCM symmetric encryption
 * for SDP offers/answers and ICE candidates before transmission over any signaling transport.
 */

import { EncryptedSignalPayload } from './types';

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  if (typeof globalThis !== 'undefined' && (globalThis as any).Buffer) {
    if (buffer instanceof Uint8Array) {
      return (globalThis as any).Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength).toString('base64');
    }
    return (globalThis as any).Buffer.from(buffer).toString('base64');
  }
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof globalThis !== 'undefined' && (globalThis as any).Buffer) {
    return (globalThis as any).Buffer.from(base64, 'base64');
  }
  const binary = atob(base64);
  const len = binary.length;
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class E2ESignalingProtocol {
  private keyPair: CryptoKeyPair | null = null;
  private sharedKeyCache: Map<string, CryptoKey> = new Map();

  /**
   * Generate an ephemeral ECDH keypair (P-256)
   */
  async generateKeyPair(): Promise<CryptoKeyPair> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('Web Crypto API is required for E2E Encrypted Signaling.');
    }

    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    this.keyPair = keyPair;
    return keyPair;
  }

  /**
   * Export public key as JsonWebKey
   */
  async exportPublicKey(): Promise<JsonWebKey> {
    if (!this.keyPair) {
      await this.generateKeyPair();
    }
    return crypto.subtle.exportKey('jwk', this.keyPair!.publicKey);
  }

  /**
   * Import remote public key from JsonWebKey
   */
  async importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      false,
      []
    );
  }

  /**
   * Derive AES-256-GCM symmetric shared key from local private key and remote public key
   */
  async deriveSharedKey(remotePublicKeyJwk: JsonWebKey): Promise<CryptoKey> {
    if (!this.keyPair) {
      await this.generateKeyPair();
    }

    // Prevent cache collisions or manipulation by using strict coordinates
    const cacheKey = `${remotePublicKeyJwk.x}|${remotePublicKeyJwk.y}`;
    const cached = this.sharedKeyCache.get(cacheKey);
    if (cached) return cached;

    const remotePublicKey = await this.importPublicKey(remotePublicKeyJwk);

    const sharedKey = await crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: remotePublicKey
      },
      this.keyPair!.privateKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );

    this.sharedKeyCache.set(cacheKey, sharedKey);
    return sharedKey;
  }

  /**
   * Encrypt arbitrary signal payload (SDP or ICE candidate) with AES-256-GCM
   */
  async encryptSignal(
    remotePublicKeyJwk: JsonWebKey,
    payload: any,
    senderFingerprint?: string
  ): Promise<EncryptedSignalPayload> {
    const sharedKey = await this.deriveSharedKey(remotePublicKeyJwk);
    const localPublicKeyJwk = await this.exportPublicKey();

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const encoder = new TextEncoder();
    const encodedData = encoder.encode(JSON.stringify(payload));

    const ciphertextBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource
      },
      sharedKey,
      encodedData as unknown as BufferSource
    );

    return {
      version: 1,
      ephemeralPublicKey: localPublicKeyJwk,
      iv: arrayBufferToBase64(iv),
      ciphertext: arrayBufferToBase64(ciphertextBuffer),
      senderFingerprint
    };
  }

  /**
   * Decrypt signal payload using sender's ephemeral public key
   */
  async decryptSignal(encrypted: EncryptedSignalPayload): Promise<any> {
    if (!encrypted || !encrypted.ephemeralPublicKey || !encrypted.iv || !encrypted.ciphertext) {
      throw new Error('Malformed EncryptedSignalPayload');
    }

    const sharedKey = await this.deriveSharedKey(encrypted.ephemeralPublicKey);
    const iv = base64ToBytes(encrypted.iv);
    const ciphertext = base64ToBytes(encrypted.ciphertext);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource
      },
      sharedKey,
      ciphertext as unknown as BufferSource
    );

    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(decryptedBuffer);
    return JSON.parse(jsonStr);
  }

  /**
   * Reset key cache and session keys
   */
  reset(): void {
    this.keyPair = null;
    this.sharedKeyCache.clear();
  }
}

export const e2eSignaling = new E2ESignalingProtocol();
