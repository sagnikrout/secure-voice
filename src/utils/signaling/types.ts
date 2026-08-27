/**
 * Pluggable Signaling & E2E Encrypted Protocol Type Definitions
 */

export type SignalingMessageType = 
  | 'offer' 
  | 'answer' 
  | 'candidate' 
  | 'encrypted-signal' 
  | 'ping' 
  | 'pong' 
  | 'bye';

export type SignalingState = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'reconnecting' 
  | 'error';

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
  iv: string; // Base64
  ciphertext: string; // Base64
  senderFingerprint?: string;
  version: number;
}

export interface QrSignalingPayload {
  v: number; // Protocol version
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
