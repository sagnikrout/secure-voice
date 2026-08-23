import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataChannelTransport } from '../utils/signaling/dataChannelTransport';
import { SignalingManager } from '../utils/signaling/index';
import { SignalingTransport, SignalingMessage, SignalingState } from '../utils/signaling/types';
import { E2ESignalingProtocol } from '../utils/signaling/e2eSignaling';

// Mock transport implementation for testing
class MockSignalingTransport implements SignalingTransport {
  readonly name: string;
  state: SignalingState = 'disconnected';
  sentMessages: Array<{ recipientId: string; message: SignalingMessage }> = [];
  private messageHandlers: Set<(msg: SignalingMessage) => void> = new Set();
  private stateHandlers: Set<(state: SignalingState) => void> = new Set();

  constructor(name = 'mock') {
    this.name = name;
  }

  async connect(localPeerId: string): Promise<string> {
    this.state = 'connected';
    this.stateHandlers.forEach(h => h('connected'));
    return localPeerId;
  }

  async disconnect(): Promise<void> {
    this.state = 'disconnected';
    this.stateHandlers.forEach(h => h('disconnected'));
  }

  async send(recipientId: string, message: SignalingMessage): Promise<boolean> {
    this.sentMessages.push({ recipientId, message });
    return true;
  }

  onMessage(handler: (msg: SignalingMessage) => void): void {
    this.messageHandlers.add(handler);
  }

  onStateChange(handler: (state: SignalingState) => void): void {
    this.stateHandlers.add(handler);
  }

  simulateIncoming(msg: SignalingMessage): void {
    this.messageHandlers.forEach(h => h(msg));
  }
}

describe('Pluggable Signaling Transports & SignalingManager', () => {
  describe('1. DataChannelTransport', () => {
    it('relays signaling messages over active WebRTC DataChannel', async () => {
      const transport = new DataChannelTransport();
      await transport.connect('LOCAL_PEER');

      const mockChannel = {
        readyState: 'open',
        send: vi.fn(),
        close: vi.fn()
      } as unknown as RTCDataChannel;

      transport.registerChannel('REMOTE_PEER_1', mockChannel);

      const msg: SignalingMessage = {
        id: 'msg-1',
        type: 'candidate',
        senderId: 'LOCAL_PEER',
        recipientId: 'REMOTE_PEER_1',
        payload: { candidate: 'candidate:1 1 UDP ...' },
        timestamp: Date.now()
      };

      const result = await transport.send('REMOTE_PEER_1', msg);
      expect(result).toBe(true);
      expect(mockChannel.send).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it('receives and emits incoming data channel messages', async () => {
      const transport = new DataChannelTransport();
      await transport.connect('LOCAL_PEER');

      let channelOnMessage: ((event: any) => void) | null = null;
      const mockChannel = {
        readyState: 'open',
        send: vi.fn(),
        set onmessage(fn: any) { channelOnMessage = fn; }
      } as unknown as RTCDataChannel;

      const received: SignalingMessage[] = [];
      transport.onMessage(msg => received.push(msg));
      transport.registerChannel('REMOTE_PEER_2', mockChannel);

      const incomingMsg: SignalingMessage = {
        id: 'msg-in',
        type: 'offer',
        senderId: 'REMOTE_PEER_2',
        recipientId: 'LOCAL_PEER',
        payload: { sdp: 'v=0...' },
        timestamp: Date.now()
      };

      channelOnMessage!({ data: JSON.stringify(incomingMsg) });
      expect(received).toHaveLength(1);
      expect(received[0].id).toBe('msg-in');
    });
  });

  describe('2. SignalingManager & Transport Switching', () => {
    let manager: SignalingManager;
    let mock1: MockSignalingTransport;
    let mock2: MockSignalingTransport;

    beforeEach(() => {
      mock1 = new MockSignalingTransport('mock1');
      mock2 = new MockSignalingTransport('mock2');
      manager = new SignalingManager(mock1);
      manager.registerTransport(mock2);
    });

    it('switches active transport dynamically', () => {
      expect(manager.getActiveTransport()?.name).toBe('mock1');

      const switched = manager.setActiveTransport('mock2');
      expect(switched).toBe(true);
      expect(manager.getActiveTransport()?.name).toBe('mock2');
    });

    it('encrypts and sends signals via active transport', async () => {
      const e2e = new E2ESignalingProtocol();
      const remotePubJwk = await e2e.exportPublicKey();

      await manager.connect('ALICE_PEER');
      const plainSdp = { type: 'offer', sdp: 'v=0...' };

      const sent = await manager.sendEncrypted('BOB_PEER', remotePubJwk, 'offer', plainSdp);
      expect(sent).toBe(true);

      expect(mock1.sentMessages).toHaveLength(1);
      const sentMsg = mock1.sentMessages[0].message;
      expect(sentMsg.recipientId).toBe('BOB_PEER');
      expect(sentMsg.payload.ciphertext).toBeDefined(); // Ciphertext payload
      expect(sentMsg.payload.ephemeralPublicKey).toBeDefined();
    });
  });
});
