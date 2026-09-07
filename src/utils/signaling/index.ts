/**
 * SecureVoice Signaling Subsystem
 *
 * Provides pluggable transports, end-to-end encrypted signaling, air-gapped QR discovery,
 * and WebRTC DataChannel relays.
 */

import Peer, { DataConnection } from 'peerjs';
import { ICE_SERVERS } from '../../constants/config';

export type SignalingMessageType = 'offer' | 'answer' | 'candidate' | 'encrypted-signal' | 'ping' | 'pong' | 'bye';
export type SignalingState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface SignalingMessage {
  id: string;
  type: SignalingMessageType;
  senderId: string;
  recipientId: string;
  payload: any;
  timestamp: number;
  senderFingerprint?: string;
}

export interface EncryptedSignalPayload {
  ephemeralPublicKey: JsonWebKey;
  iv: string;
  ciphertext: string;
  senderFingerprint?: string;
  version: number;
}

export interface QrSignalingPayload {
  v: number;
  peerId: string;
  type: 'offer' | 'answer';
  sdp: string;
  candidates?: RTCIceCandidateInit[];
  publicKey?: JsonWebKey;
  fingerprint?: string;
}

export interface SignalingTransport {
  readonly name: string;
  readonly state: SignalingState;
  connect(localPeerId: string): Promise<string>;
  disconnect(): Promise<void>;
  send(recipientId: string, message: SignalingMessage): Promise<boolean>;
  onMessage(handler: (msg: SignalingMessage) => void): void;
  onStateChange(handler: (state: SignalingState) => void): void;
}

export interface E2ESignalingSession {
  keyPair: CryptoKeyPair;
  derivedKeys: Map<string, CryptoKey>;
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  if (typeof globalThis !== 'undefined' && (globalThis as any).Buffer) {
    if (buffer instanceof Uint8Array) {
      return (globalThis as any).Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength).toString('base64');
    }
    return (globalThis as any).Buffer.from(buffer).toString('base64');
  }
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof globalThis !== 'undefined' && (globalThis as any).Buffer) {
    return (globalThis as any).Buffer.from(base64, 'base64');
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class E2ESignalingProtocol {
  private keyPair: CryptoKeyPair | null = null;
  private sharedKeyCache: Map<string, CryptoKey> = new Map();

  async generateKeyPair(): Promise<CryptoKeyPair> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('Web Crypto API is required for E2E Encrypted Signaling.');
    }
    this.keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
    return this.keyPair;
  }

  async exportPublicKey(): Promise<JsonWebKey> {
    if (!this.keyPair) await this.generateKeyPair();
    return crypto.subtle.exportKey('jwk', this.keyPair!.publicKey);
  }

  async importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  }

  async deriveSharedKey(remotePublicKeyJwk: JsonWebKey): Promise<CryptoKey> {
    if (!this.keyPair) await this.generateKeyPair();
    const cacheKey = `${remotePublicKeyJwk.x}|${remotePublicKeyJwk.y}`;
    const cached = this.sharedKeyCache.get(cacheKey);
    if (cached) return cached;

    const remotePublicKey = await this.importPublicKey(remotePublicKeyJwk);
    const sharedKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: remotePublicKey },
      this.keyPair!.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    this.sharedKeyCache.set(cacheKey, sharedKey);
    return sharedKey;
  }

  async encryptSignal(remotePublicKeyJwk: JsonWebKey, payload: any, senderFingerprint?: string): Promise<EncryptedSignalPayload> {
    const sharedKey = await this.deriveSharedKey(remotePublicKeyJwk);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, plaintext);
    const ephemeralPublicKey = await this.exportPublicKey();

    return {
      ephemeralPublicKey,
      iv: arrayBufferToBase64(iv),
      ciphertext: arrayBufferToBase64(ciphertext),
      senderFingerprint,
      version: 1
    };
  }

  async decryptSignal(encryptedPayload: EncryptedSignalPayload): Promise<any> {
    const sharedKey = await this.deriveSharedKey(encryptedPayload.ephemeralPublicKey);
    const iv = base64ToBytes(encryptedPayload.iv);
    const ciphertext = base64ToBytes(encryptedPayload.ciphertext);
    const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as any }, sharedKey, ciphertext as any);
    return JSON.parse(new TextDecoder().decode(decryptedBuffer));
  }

  clearKeyCache(): void {
    this.sharedKeyCache.clear();
  }
}

export const e2eSignaling = new E2ESignalingProtocol();

export class PeerJsTransport implements SignalingTransport {
  readonly name = 'peerjs';
  private _state: SignalingState = 'disconnected';
  private peer: Peer | null = null;
  private localPeerId: string = '';
  private dataConnections: Map<string, DataConnection> = new Map();
  private messageHandlers: Set<(msg: SignalingMessage) => void> = new Set();
  private stateHandlers: Set<(state: SignalingState) => void> = new Set();

  get state(): SignalingState { return this._state; }

  private setState(newState: SignalingState): void {
    if (this._state !== newState) {
      this._state = newState;
      this.stateHandlers.forEach(h => { try { h(newState); } catch {} });
    }
  }

  async connect(localPeerId: string): Promise<string> {
    this.localPeerId = localPeerId;
    this.setState('connecting');
    return new Promise((resolve, reject) => {
      try {
        if (this.peer && !this.peer.destroyed) {
          try { this.peer.destroy(); } catch {}
        }
        const peer = new Peer(localPeerId, { config: ICE_SERVERS, debug: 0 });
        this.peer = peer;
        peer.on('open', (id) => { this.setState('connected'); resolve(id); });
        peer.on('connection', (conn) => this.setupDataConnection(conn));
        peer.on('error', (err) => { this.setState('error'); reject(err); });
        peer.on('disconnected', () => this.setState('reconnecting'));
        peer.on('close', () => this.setState('disconnected'));
      } catch (err) {
        this.setState('error');
        reject(err);
      }
    });
  }

  private setupDataConnection(conn: DataConnection): void {
    this.dataConnections.set(conn.peer, conn);
    conn.on('data', (data: any) => {
      try {
        const msg: SignalingMessage = typeof data === 'string' ? JSON.parse(data) : data;
        this.messageHandlers.forEach(h => { try { h(msg); } catch {} });
      } catch {}
    });
    conn.on('close', () => this.dataConnections.delete(conn.peer));
  }

  async send(recipientId: string, message: SignalingMessage): Promise<boolean> {
    if (!this.peer || this._state !== 'connected') return false;
    try {
      let conn = this.dataConnections.get(recipientId);
      if (!conn || !conn.open) {
        conn = this.peer.connect(recipientId, { reliable: true });
        this.setupDataConnection(conn);
        await new Promise<void>((res) => {
          conn!.on('open', () => res());
          setTimeout(() => res(), 1500);
        });
      }
      if (conn && conn.open) {
        conn.send(message);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.dataConnections.forEach(c => { try { c.close(); } catch {} });
    this.dataConnections.clear();
    if (this.peer && !this.peer.destroyed) {
      try { this.peer.destroy(); } catch {}
    }
    this.peer = null;
    this.setState('disconnected');
  }

  onMessage(handler: (msg: SignalingMessage) => void): void { this.messageHandlers.add(handler); }
  onStateChange(handler: (state: SignalingState) => void): void { this.stateHandlers.add(handler); }
}

export class DataChannelTransport implements SignalingTransport {
  readonly name = 'datachannel';
  private _state: SignalingState = 'disconnected';
  private channels: Map<string, RTCDataChannel> = new Map();
  private messageHandlers: Set<(msg: SignalingMessage) => void> = new Set();
  private stateHandlers: Set<(state: SignalingState) => void> = new Set();
  private localPeerId: string = '';

  get state(): SignalingState { return this._state; }

  private setState(newState: SignalingState): void {
    if (this._state !== newState) {
      this._state = newState;
      this.stateHandlers.forEach(h => { try { h(newState); } catch {} });
    }
  }

  async connect(localPeerId: string): Promise<string> {
    this.localPeerId = localPeerId;
    this.setState('connected');
    return localPeerId;
  }

  registerChannel(peerId: string, channel: RTCDataChannel): void {
    if (!channel) return;
    this.channels.set(peerId, channel);
    channel.onmessage = (event) => {
      try {
        const msg: SignalingMessage = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        this.messageHandlers.forEach(h => { try { h(msg); } catch {} });
      } catch {}
    };
    channel.onclose = () => {
      this.channels.delete(peerId);
      if (this.channels.size === 0) this.setState('disconnected');
    };
    this.setState('connected');
  }

  async send(recipientId: string, message: SignalingMessage): Promise<boolean> {
    const channel = this.channels.get(recipientId);
    if (!channel || channel.readyState !== 'open') return false;
    try {
      channel.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.channels.forEach(ch => { try { ch.close(); } catch {} });
    this.channels.clear();
    this.setState('disconnected');
  }

  onMessage(handler: (msg: SignalingMessage) => void): void { this.messageHandlers.add(handler); }
  onStateChange(handler: (state: SignalingState) => void): void { this.stateHandlers.add(handler); }
}

export class SignalingManager {
  private transports: Map<string, SignalingTransport> = new Map();
  private activeTransportName: string = '';
  private localPeerId: string = '';

  constructor(defaultTransport?: SignalingTransport) {
    if (defaultTransport) {
      this.registerTransport(defaultTransport);
      this.activeTransportName = defaultTransport.name;
    }
  }

  registerTransport(transport: SignalingTransport): void {
    this.transports.set(transport.name, transport);
    if (!this.activeTransportName) this.activeTransportName = transport.name;
  }

  setActiveTransport(name: string): boolean {
    if (this.transports.has(name)) {
      this.activeTransportName = name;
      return true;
    }
    return false;
  }

  getActiveTransport(): SignalingTransport | undefined {
    return this.transports.get(this.activeTransportName);
  }

  async connect(localPeerId: string): Promise<string> {
    this.localPeerId = localPeerId;
    const transport = this.getActiveTransport();
    if (!transport) throw new Error('No active signaling transport registered.');
    return transport.connect(localPeerId);
  }

  async sendEncrypted(
    recipientId: string,
    remotePublicKeyJwk: JsonWebKey,
    type: SignalingMessageType,
    plainPayload: any,
    senderFingerprint?: string
  ): Promise<boolean> {
    const transport = this.getActiveTransport();
    if (!transport) return false;

    const encrypted = await e2eSignaling.encryptSignal(remotePublicKeyJwk, plainPayload, senderFingerprint);
    const message: SignalingMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      senderId: this.localPeerId,
      recipientId,
      payload: encrypted,
      timestamp: Date.now(),
      senderFingerprint
    };
    return transport.send(recipientId, message);
  }

  onEncryptedMessage(handler: (decryptedPayload: any, originalMessage: SignalingMessage) => void): void {
    this.transports.forEach(transport => {
      transport.onMessage(async (msg) => {
        try {
          if (msg.payload?.ciphertext && msg.payload?.ephemeralPublicKey) {
            const decrypted = await e2eSignaling.decryptSignal(msg.payload);
            handler(decrypted, msg);
          } else {
            handler(msg.payload, msg);
          }
        } catch (e) {
          console.error('[SignalingManager] Failed to decrypt incoming signal:', e);
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    for (const transport of this.transports.values()) {
      await transport.disconnect();
    }
  }
}

export const signalingManager = new SignalingManager();
