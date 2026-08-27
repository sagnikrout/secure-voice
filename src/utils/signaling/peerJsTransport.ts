/**
 * PeerJS Signaling Transport Adapter
 *
 * Wraps PeerJS broker connections under the standard SignalingTransport interface.
 */

import Peer, { DataConnection } from 'peerjs';
import { SignalingTransport, SignalingState, SignalingMessage } from './types';
import { ICE_SERVERS } from '../../constants/config';

export class PeerJsTransport implements SignalingTransport {
  readonly name = 'peerjs';
  private _state: SignalingState = 'disconnected';
  private peer: Peer | null = null;
  private localPeerId: string = '';
  private dataConnections: Map<string, DataConnection> = new Map();
  private messageHandlers: Set<(msg: SignalingMessage) => void> = new Set();
  private stateHandlers: Set<(state: SignalingState) => void> = new Set();

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

  /**
   * Connect to PeerJS signaling mesh
   */
  async connect(localPeerId: string): Promise<string> {
    this.localPeerId = localPeerId;
    this.setState('connecting');

    return new Promise((resolve, reject) => {
      try {
        if (this.peer && !this.peer.destroyed) {
          try { this.peer.destroy(); } catch (e) {}
        }

        const peer = new Peer(localPeerId, {
          config: ICE_SERVERS,
          debug: 0
        });

        this.peer = peer;

        peer.on('open', (id) => {
          this.setState('connected');
          resolve(id);
        });

        peer.on('connection', (conn) => {
          this.setupDataConnection(conn);
        });

        peer.on('error', (err) => {
          this.setState('error');
          reject(err);
        });

        peer.on('disconnected', () => {
          this.setState('reconnecting');
        });

        peer.on('close', () => {
          this.setState('disconnected');
        });
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
        this.messageHandlers.forEach(handler => {
          try { handler(msg); } catch (e) {}
        });
      } catch (e) {}
    });

    conn.on('close', () => {
      this.dataConnections.delete(conn.peer);
    });
  }

  /**
   * Send a signaling message over active DataConnection
   */
  async send(recipientId: string, message: SignalingMessage): Promise<boolean> {
    if (!this.peer || this._state !== 'connected') {
      return false;
    }

    try {
      let conn = this.dataConnections.get(recipientId);
      if (!conn || !conn.open) {
        conn = this.peer.connect(recipientId, { reliable: true });
        this.setupDataConnection(conn);
        
        // Wait briefly for connection to open
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
    } catch (err) {
      return false;
    }
  }

  /**
   * Disconnect and destroy PeerJS connection
   */
  async disconnect(): Promise<void> {
    this.dataConnections.clear();
    if (this.peer && !this.peer.destroyed) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    this.setState('disconnected');
  }

  onMessage(handler: (msg: SignalingMessage) => void): void {
    this.messageHandlers.add(handler);
  }

  onStateChange(handler: (state: SignalingState) => void): void {
    this.stateHandlers.add(handler);
  }

  getPeerInstance(): Peer | null {
    return this.peer;
  }
}
