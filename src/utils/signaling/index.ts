/**
 * SecureVoice Signaling Subsystem
 *
 * Provides pluggable transports, end-to-end encrypted signaling, air-gapped QR discovery,
 * and WebRTC DataChannel relays.
 */

export * from './types';
export * from './e2eSignaling';
export * from './peerJsTransport';
export * from './dataChannelTransport';

import { SignalingTransport, SignalingMessage, SignalingMessageType, EncryptedSignalPayload } from './types';
import { e2eSignaling } from './e2eSignaling';

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
    if (!this.activeTransportName) {
      this.activeTransportName = transport.name;
    }
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
    if (!transport) {
      throw new Error(`No active signaling transport registered.`);
    }
    return transport.connect(localPeerId);
  }

  /**
   * Send an E2E-encrypted signal (SDP or ICE Candidate) using recipient's public key
   */
  async sendEncrypted(
    recipientId: string,
    remotePublicKeyJwk: JsonWebKey,
    type: SignalingMessageType,
    plainPayload: any,
    senderFingerprint?: string
  ): Promise<boolean> {
    const transport = this.getActiveTransport();
    if (!transport) return false;

    const encrypted: EncryptedSignalPayload = await e2eSignaling.encryptSignal(
      remotePublicKeyJwk,
      plainPayload,
      senderFingerprint
    );

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

  /**
   * Listen for incoming encrypted messages and decrypt them automatically
   */
  onEncryptedMessage(
    handler: (decryptedPayload: any, originalMessage: SignalingMessage) => void
  ): void {
    this.transports.forEach(transport => {
      transport.onMessage(async (msg) => {
        try {
          if (msg.payload && msg.payload.ciphertext && msg.payload.ephemeralPublicKey) {
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
