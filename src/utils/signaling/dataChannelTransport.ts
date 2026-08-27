/**
 * WebRTC DataChannel Mesh Relay Signaling Transport
 *
 * Transports encrypted signaling payloads directly across existing WebRTC DataChannels
 * for secondary peer discovery and multi-peer mesh establishment without external servers.
 */

import { SignalingTransport, SignalingState, SignalingMessage } from './types';

export class DataChannelTransport implements SignalingTransport {
  readonly name = 'datachannel';
  private _state: SignalingState = 'disconnected';
  private channels: Map<string, RTCDataChannel> = new Map();
  private messageHandlers: Set<(msg: SignalingMessage) => void> = new Set();
  private stateHandlers: Set<(state: SignalingState) => void> = new Set();
  private localPeerId: string = '';

  get state(): SignalingState {
    return this._state;
  }

  private setState(newState: SignalingState): void {
    if (this._state !== newState) {
      this._state = newState;
      this.stateHandlers.forEach(handler => {
        try { handler(newState); } catch (e) {}
      });
    }
  }

  async connect(localPeerId: string): Promise<string> {
    this.localPeerId = localPeerId;
    this.setState('connected');
    return localPeerId;
  }

  /**
   * Register an established WebRTC RTCDataChannel for peer signaling
   */
  registerChannel(peerId: string, channel: RTCDataChannel): void {
    if (!channel) return;

    this.channels.set(peerId, channel);

    channel.onmessage = (event) => {
      try {
        const msg: SignalingMessage = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        this.messageHandlers.forEach(handler => {
          try { handler(msg); } catch (e) {}
        });
      } catch (e) {}
    };

    channel.onclose = () => {
      this.channels.delete(peerId);
      if (this.channels.size === 0) {
        this.setState('disconnected');
      }
    };

    this.setState('connected');
  }

  /**
   * Send a signaling message through the peer's active data channel
   */
  async send(recipientId: string, message: SignalingMessage): Promise<boolean> {
    const channel = this.channels.get(recipientId);
    if (!channel || channel.readyState !== 'open') {
      return false;
    }

    try {
      channel.send(JSON.stringify(message));
      return true;
    } catch (e) {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.channels.forEach(ch => {
      try { ch.close(); } catch (e) {}
    });
    this.channels.clear();
    this.setState('disconnected');
  }

  onMessage(handler: (msg: SignalingMessage) => void): void {
    this.messageHandlers.add(handler);
  }

  onStateChange(handler: (state: SignalingState) => void): void {
    this.stateHandlers.add(handler);
  }
}
