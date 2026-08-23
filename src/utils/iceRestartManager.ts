/**
 * WebRTC ICE Restart & Non-Destructive Fast Reconnection State Machine
 * 
 * Manages:
 * - 1500ms grace period for self-healing transient network blips.
 * - 5-retry exponential backoff schedule ([1000, 2000, 4000, 6000, 8000]ms).
 * - Non-destructive WebRTC renegotiation offer/answer flow.
 * - Preservation of hardware AudioContext, MediaStream tracks, and call duration.
 * - Eventual teardown after retry exhaustion or 25s watchdog expiration.
 */

import { ICE_RECONNECT_CONFIG } from '../constants/config.js';

export class IceRestartManager {
  onStatusChange?: (status: string) => void;
  onLog?: (msg: string, level?: string) => void;
  onFatalDisconnect?: () => void;
  sendRenegotiation?: (msg: any) => Promise<void> | void;
  sdpTransform?: (sdp: string) => string;
  config: any;
  retryCount: number;
  state: string;
  graceTimer: any;
  retryTimer: any;
  totalWatchdogTimer: any;

  constructor(options: any = {}) {
    this.onStatusChange = options.onStatusChange;
    this.onLog = options.onLog;
    this.onFatalDisconnect = options.onFatalDisconnect;
    this.sendRenegotiation = options.sendRenegotiation;
    this.sdpTransform = options.sdpTransform;
    this.config = { ...ICE_RECONNECT_CONFIG, ...options.config };

    this.retryCount = 0;
    this.state = 'IDLE'; // 'IDLE', 'INTERRUPTED' (or 'GRACE_MONITOR'), 'RESTARTING', 'FAILED'
    this.graceTimer = null;
    this.retryTimer = null;
    this.totalWatchdogTimer = null;
  }

  /**
   * Handle WebRTC connection state events
   * @param {string} connectionState - RTCPeerConnection.connectionState
   * @param {string} iceConnectionState - RTCPeerConnection.iceConnectionState
   * @param {RTCPeerConnection} pc - Active WebRTC PeerConnection
   * @param {boolean} [isCaller=true] - Whether local peer is call initiator
   * @param {Function} [signalingCallback] - Optional custom signaling callback
   */
  handleStateChange(connectionState: any, iceConnectionState: any, pc: any, isCaller: boolean = true, signalingCallback?: any) {
    const isDisconnected = connectionState === 'disconnected' || iceConnectionState === 'disconnected';
    const isFailed = connectionState === 'failed' || iceConnectionState === 'failed';
    const isConnected = (connectionState === 'connected' || iceConnectionState === 'connected' || iceConnectionState === 'completed') &&
      connectionState !== 'disconnected' && iceConnectionState !== 'disconnected' && !isFailed;

    if (isConnected) {
      this.handleConnected();
    } else if (isFailed) {
      this.startIceRestart(pc, isCaller, 'ICE/Peer Connection Failed', signalingCallback);
    } else if (isDisconnected) {
      this.handleDisconnected(pc, isCaller, signalingCallback);
    }
  }

  /**
   * Handle link interruption with 1500ms grace period
   */
  handleDisconnected(pc, isCaller = true, signalingCallback) {
    if (this.state === 'RESTARTING' || this.state === 'INTERRUPTED' || this.state === 'GRACE_MONITOR') {
      return;
    }

    this.state = 'INTERRUPTED';
    this.onStatusChange?.('reconnecting');
    this.onLog?.('Network link interrupted (Peer Disconnected). Waiting for reconnect...', 'warn');

    // Arm total watchdog timer (25s) if not already armed
    if (!this.totalWatchdogTimer) {
      this.totalWatchdogTimer = setTimeout(() => {
        this.handleFatalTimeout();
      }, this.config.TOTAL_WATCHDOG_TIMEOUT_MS);
    }

    // Grace timer: 1500ms grace period for self-healing links before triggering renegotiation
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      if (this.state === 'INTERRUPTED' || this.state === 'GRACE_MONITOR') {
        this.startIceRestart(pc, isCaller, 'Link disconnected (grace period elapsed)', signalingCallback);
      }
    }, this.config.GRACE_PERIOD_MS);
  }

  /**
   * Handle connection recovery / re-establishment
   */
  handleConnected() {
    if (this.state !== 'IDLE') {
      this.onLog?.('Peer connection re-established', 'ok');
      this.onStatusChange?.('in-call');
    }
    this.resetTimers();
    this.state = 'IDLE';
    this.retryCount = 0;
  }

  /**
   * Programmatic / direct trigger for ICE restart
   */
  triggerRestart(pc, signalingCallback, isCaller = true) {
    return this.startIceRestart(pc, isCaller, 'Manual ICE Restart', signalingCallback);
  }

  /**
   * Force relay-only ICE restart by reconfiguring the PeerConnection.
   * Used when repeated P2P ICE candidates keep failing — skips the
   * host/srflx gathering phase entirely and goes straight to TURN relay.
   * @param {RTCPeerConnection} pc
   * @param {boolean} isCaller
   * @param {Function} [signalingCallback]
   */
  async forceRelayRestart(pc, isCaller = true, signalingCallback) {
    if (!pc || pc.signalingState === 'closed') return;
    try {
      const currentConfig = pc.getConfiguration?.() || {};
      const relayConfig = {
        ...currentConfig,
        iceTransportPolicy: 'relay'
      };
      if (typeof pc.setConfiguration === 'function') {
        pc.setConfiguration(relayConfig);
        this.onLog?.('Switched to relay-only ICE transport (TURN forced fallback)', 'warn');
      }
    } catch (e) {
      this.onLog?.(`Could not set relay-only config: ${e.message}`, 'warn');
    }
    return this.startIceRestart(pc, isCaller, 'Forced relay-only fallback', signalingCallback);
  }

  /**
   * Execute ICE restart with exponential backoff
   */
  async startIceRestart(pc, isCaller = true, reason = 'ICE Restart', signalingCallback) {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }

    if (this.retryCount >= this.config.MAX_RETRY_ATTEMPTS) {
      this.handleFatalTimeout();
      return;
    }

    if (!this.totalWatchdogTimer) {
      this.totalWatchdogTimer = setTimeout(() => {
        this.handleFatalTimeout();
      }, this.config.TOTAL_WATCHDOG_TIMEOUT_MS);
    }

    this.state = 'RESTARTING';
    this.retryCount += 1;
    const delay = this.config.BACKOFF_DELAYS_MS[this.retryCount - 1] || 8000;

    this.onStatusChange?.('reconnecting');
    this.onLog?.(`Initiating ICE restart (Attempt ${this.retryCount}/${this.config.MAX_RETRY_ATTEMPTS}) in ${delay}ms: ${reason}`, 'warn');

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (this.state !== 'RESTARTING') return;
      if (!pc || pc.signalingState === 'closed' || pc.connectionState === 'closed') return;

      try {
        // Automatic escalation to TURN relay if P2P restarts continue failing
        if (this.retryCount >= 3) {
          try {
            const currentConfig = pc.getConfiguration?.() || {};
            if (currentConfig.iceTransportPolicy !== 'relay' && typeof pc.setConfiguration === 'function') {
              pc.setConfiguration({ ...currentConfig, iceTransportPolicy: 'relay' });
              this.onLog?.(`Escalating to relay-only ICE transport (Attempt ${this.retryCount})`, 'warn');
            }
          } catch (e) {}
        }

        if (typeof pc.restartIce === 'function') {
          pc.restartIce();
        }

        const sendFn = signalingCallback || this.sendRenegotiation;
        if (sendFn) {
          const offer = await pc.createOffer({ iceRestart: true });
          let sdp = offer.sdp;
          if (typeof this.sdpTransform === 'function') {
            sdp = this.sdpTransform(sdp);
          }
          const localDesc = typeof RTCSessionDescription !== 'undefined'
            ? new RTCSessionDescription({ type: 'offer', sdp })
            : { type: 'offer', sdp };
          await pc.setLocalDescription(localDesc);

          await sendFn({
            type: 'renegotiate-offer',
            sdp: pc.localDescription?.sdp || sdp,
            attempt: this.retryCount
          });
        }
      } catch (err) {
        this.onLog?.(`ICE restart offer creation failed: ${err.message}`, 'error');
        if (this.retryCount < this.config.MAX_RETRY_ATTEMPTS && this.state === 'RESTARTING') {
          this.startIceRestart(pc, isCaller, 'Offer creation retry', signalingCallback);
        }
      }
    }, delay);
  }

  /**
   * Handle incoming remote ICE restart offer
   * @param {RTCPeerConnection} pc
   * @param {string} offerSdp
   * @param {Function} [sdpTransform]
   * @returns {Promise<string|null>} Answer SDP or null
   */
  async handleRemoteRestartOffer(pc, offerSdp, sdpTransform) {
    if (!pc || pc.signalingState === 'closed') return null;
    try {
      this.onStatusChange?.('reconnecting');
      this.onLog?.('Received ICE restart offer from peer. Renegotiating answer...', 'info');

      const remoteDesc = typeof RTCSessionDescription !== 'undefined'
        ? new RTCSessionDescription({ type: 'offer', sdp: offerSdp })
        : { type: 'offer', sdp: offerSdp };
      await pc.setRemoteDescription(remoteDesc);

      let answer = await pc.createAnswer();
      let answerSdp = answer.sdp;
      const transform = sdpTransform || this.sdpTransform;
      if (typeof transform === 'function') {
        answerSdp = transform(answerSdp);
      }
      const localDesc = typeof RTCSessionDescription !== 'undefined'
        ? new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
        : { type: 'answer', sdp: answerSdp };
      await pc.setLocalDescription(localDesc);

      return pc.localDescription?.sdp || answerSdp;
    } catch (err) {
      this.onLog?.(`Failed to handle remote ICE restart offer: ${err.message}`, 'error');
      return null;
    }
  }

  /**
   * Alias for handleRemoteRestartOffer
   */
  handleRemoteOffer(pc, offerSdp, sdpTransform) {
    return this.handleRemoteRestartOffer(pc, offerSdp, sdpTransform);
  }

  /**
   * Handle incoming remote ICE restart answer
   * @param {RTCPeerConnection} pc
   * @param {string} answerSdp
   * @returns {Promise<boolean>} True on success
   */
  async handleRemoteRestartAnswer(pc, answerSdp) {
    if (!pc || pc.signalingState === 'closed') return false;
    try {
      const remoteDesc = typeof RTCSessionDescription !== 'undefined'
        ? new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
        : { type: 'answer', sdp: answerSdp };
      await pc.setRemoteDescription(remoteDesc);
      this.onLog?.('ICE restart answer applied. Awaiting link reconnection...', 'ok');
      return true;
    } catch (err) {
      this.onLog?.(`Failed to handle remote ICE restart answer: ${err.message}`, 'error');
      return false;
    }
  }

  /**
   * Alias for handleRemoteRestartAnswer
   */
  handleRemoteAnswer(pc, answerSdp) {
    return this.handleRemoteRestartAnswer(pc, answerSdp);
  }

  /**
   * Handle permanent recovery failure
   */
  handleFatalTimeout() {
    this.resetTimers();
    this.state = 'FAILED';
    this.onLog?.('Connection recovery failed after 5 attempts. Terminating call.', 'error');
    if (typeof this.onFatalDisconnect === 'function') {
      this.onFatalDisconnect();
    }
  }

  /**
   * Clear all active timers
   */
  resetTimers() {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.totalWatchdogTimer) {
      clearTimeout(this.totalWatchdogTimer);
      this.totalWatchdogTimer = null;
    }
  }

  /**
   * Reset manager state completely
   */
  reset() {
    this.resetTimers();
    this.state = 'IDLE';
    this.retryCount = 0;
  }
}
