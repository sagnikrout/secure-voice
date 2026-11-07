/**
 * SecureVoice Unified Telecom & Resilience Engine
 *
 * Consolidates:
 * - PeerConnection lifecycle & dual-stack Anycast STUN NAT traversal.
 * - Opus SDP transformation & dynamic bitrate adaptation (32 kbps -> 3.2 kbps).
 * - Continuous playout shock absorber (RTCRtpReceiver.jitterBufferTarget).
 * - Dynamic DTX elevation (continuous presence on 5G, silence suppression on 2G).
 * - Non-destructive ICE restart state machine with 1500ms grace period.
 * - Deterministic DTLS-SRTP 8-digit safety code verification.
 */

import {
  ICE_SERVERS,
  LADDER_TIERS,
  OPUS_CONFIG,
  ADAPTATION_CONFIG,
  ICE_RECONNECT_CONFIG
} from '../constants/config';
import { transformOpusSdp, applySenderBitrate, generateSafetyCode, getQualityRating } from '../utils/webrtc';
import { ExtendedLadderTier } from '../types';

export interface TelecomTelemetry {
  tierName: string;
  bitrateBps: number;
  rttMs: number;
  jitterMs: number;
  lossRate: number;
  concealmentRate: number;
  dtxEnabled: boolean;
  jitterBufferTargetMs: number;
  rating: 'good' | 'fair' | 'poor';
}

export interface TelecomEngineOptions {
  onTelemetry?: (telemetry: TelecomTelemetry) => void;
  onLog?: (msg: string, level?: string) => void;
  onStateChange?: (state: string) => void;
}

export class TelecomEngine {
  private pc: RTCPeerConnection | null = null;
  private currentTier: ExtendedLadderTier = LADDER_TIERS[0];
  private currentBufferTargetMs: number = 80;
  private isDestroyed: boolean = false;

  // EMA metric history
  private emaLoss: number = 0;
  private emaRtt: number = 50;
  private emaJitter: number = 10;
  private emaConcealment: number = 0;

  // ICE Reconnect state
  private isReconnecting: boolean = false;
  private retryCount: number = 0;
  private graceTimeoutId: any = null;

  private options: TelecomEngineOptions;

  constructor(options: TelecomEngineOptions = {}) {
    this.options = options;
  }

  /**
   * Create and configure RTCPeerConnection with dual-stack Anycast STUN
   */
  public createPeerConnection(customConstructor?: any): RTCPeerConnection | any {
    const PeerConn = customConstructor || (typeof window !== 'undefined' ? (window as any).RTCPeerConnection : null) || (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);
    
    if (!PeerConn) {
      throw new Error('RTCPeerConnection is not supported in this environment');
    }

    const pc = new PeerConn({
      iceServers: ICE_SERVERS,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 2
    });

    this.pc = pc;
    this.setupConnectionMonitoring(pc);
    return pc;
  }

  /**
   * Attach an existing active RTCPeerConnection instance
   */
  public attachPeerConnection(pc: any): void {
    this.pc = pc;
    if (pc) {
      this.setupConnectionMonitoring(pc);
    }
  }

  /**
   * Apply dynamic playout shock absorber target on active audio receivers
   */
  public applyPlayoutShockAbsorber(jitterMs: number, lossRate: number): number {
    const validJitter = Number.isFinite(jitterMs) ? Math.max(0, jitterMs) : 0;
    const validLoss = Number.isFinite(lossRate) ? Math.max(0, Math.min(1.0, lossRate)) : 0;
    const targetMs = Math.max(35, Math.min(280, 35 + Math.round(validJitter * 2.2) + Math.round(validLoss * 120)));

    // 15ms hysteresis to eliminate rapid playout flapping
    if (Math.abs(this.currentBufferTargetMs - targetMs) >= 15 && this.pc) {
      this.currentBufferTargetMs = targetMs;
      try {
        const receivers = this.pc.getReceivers();
        for (const receiver of receivers) {
          if (receiver.track?.kind === 'audio') {
            if ('jitterBufferTarget' in receiver) {
              (receiver as any).jitterBufferTarget = targetMs;
            }
            if ('playoutDelayHint' in receiver) {
              receiver.playoutDelayHint = targetMs / 1000;
            }
          }
        }
      } catch (e) {}
    }

    return this.currentBufferTargetMs;
  }

  /**
   * Process incoming WebRTC statistics snapshot and execute rate adaptation
   */
  public processStats(stats: { rttMs?: number; jitterMs?: number; packetLossRate?: number; concealmentRate?: number }): TelecomTelemetry {
    const rawRtt = Number.isFinite(stats.rttMs) ? Math.max(0, stats.rttMs!) : 50;
    const rawJitter = Number.isFinite(stats.jitterMs) ? Math.max(0, stats.jitterMs!) : 10;
    const rawLoss = Number.isFinite(stats.packetLossRate) ? Math.max(0, Math.min(1.0, stats.packetLossRate!)) : 0;
    const rawConcealment = Number.isFinite(stats.concealmentRate) ? Math.max(0, Math.min(1.0, stats.concealmentRate!)) : 0;

    // Continuous EMA update
    this.emaRtt = ADAPTATION_CONFIG.EMA_BETA_RTT * rawRtt + (1 - ADAPTATION_CONFIG.EMA_BETA_RTT) * this.emaRtt;
    this.emaJitter = ADAPTATION_CONFIG.EMA_GAMMA_JITTER * rawJitter + (1 - ADAPTATION_CONFIG.EMA_GAMMA_JITTER) * this.emaJitter;
    this.emaLoss = ADAPTATION_CONFIG.EMA_ALPHA_LOSS * rawLoss + (1 - ADAPTATION_CONFIG.EMA_ALPHA_LOSS) * this.emaLoss;
    this.emaConcealment = ADAPTATION_CONFIG.EMA_DELTA_CONCEALMENT * rawConcealment + (1 - ADAPTATION_CONFIG.EMA_DELTA_CONCEALMENT) * this.emaConcealment;

    // Playout shock absorber adjustment
    const bufferTarget = this.applyPlayoutShockAbsorber(this.emaJitter, this.emaLoss);

    // Dynamic DTX & Bitrate Ladder Evaluation
    // Clean tier (Broadband/5G): dtx = false for continuous conversational presence
    // Congested 2G tiers: dtx = true for silence compression
    let targetTier = LADDER_TIERS[0];
    for (let i = LADDER_TIERS.length - 1; i >= 0; i--) {
      const tier = LADDER_TIERS[i];
      if (this.emaLoss >= tier.lossThreshold || this.emaRtt >= tier.rttThresholdMs || this.emaJitter >= tier.jitterThresholdMs) {
        targetTier = tier;
        break;
      }
    }
    this.currentTier = targetTier;

    // Apply bitrate and DTX directly to audio senders
    if (this.pc) {
      try {
        const senders = this.pc.getSenders();
        for (const sender of senders) {
          if (sender.track?.kind === 'audio') {
            applySenderBitrate(
              sender,
              targetTier.maxBitrateBps,
              'high',
              targetTier.dtx ? 'enabled' : 'disabled'
            ).catch(() => {});
          }
        }
      } catch (e) {}
    }

    const telemetry: TelecomTelemetry = {
      tierName: targetTier.name,
      bitrateBps: targetTier.maxBitrateBps,
      rttMs: Math.round(this.emaRtt),
      jitterMs: Math.round(this.emaJitter),
      lossRate: this.emaLoss,
      concealmentRate: this.emaConcealment,
      dtxEnabled: Boolean(targetTier.dtx),
      jitterBufferTargetMs: bufferTarget,
      rating: getQualityRating(this.emaRtt / 1000)
    };

    this.options.onTelemetry?.(telemetry);
    return telemetry;
  }

  /**
   * Monitor peer connection state transitions with non-destructive reconnection grace period
   */
  private setupConnectionMonitoring(pc: RTCPeerConnection): void {
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.options.onStateChange?.(state);

      if (state === 'disconnected') {
        // 1500ms grace period before triggering disruptive ICE restart
        this.graceTimeoutId = setTimeout(() => {
          if (pc.connectionState === 'disconnected' && !this.isReconnecting) {
            this.triggerIceRestart();
          }
        }, ICE_RECONNECT_CONFIG.GRACE_PERIOD_MS);
      } else if (state === 'connected') {
        if (this.graceTimeoutId) {
          clearTimeout(this.graceTimeoutId);
          this.graceTimeoutId = null;
        }
        this.isReconnecting = false;
        this.retryCount = 0;
      } else if (state === 'failed') {
        this.triggerIceRestart();
      }
    };
  }

  /**
   * Trigger non-destructive ICE restart with exponential backoff
   */
  public async triggerIceRestart(): Promise<boolean> {
    if (!this.pc || this.isDestroyed || this.retryCount >= ICE_RECONNECT_CONFIG.MAX_RETRY_ATTEMPTS) {
      return false;
    }

    this.isReconnecting = true;
    this.retryCount++;
    this.options.onLog?.(`Initiating non-destructive ICE restart (Attempt ${this.retryCount}/${ICE_RECONNECT_CONFIG.MAX_RETRY_ATTEMPTS})`, 'info');

    try {
      if (typeof this.pc.restartIce === 'function') {
        this.pc.restartIce();
      }
      return true;
    } catch (err) {
      this.options.onLog?.(`ICE restart failed: ${err}`, 'warn');
      return false;
    }
  }

  /**
   * Compute deterministic 8-digit verbal DTLS Safety Code
   */
  public async getDtlsSafetyCode(localSdp: string, remoteSdp: string): Promise<string | null> {
    return generateSafetyCode(localSdp, remoteSdp);
  }

  /**
   * Destroy and release all resources
   */
  public destroy(): void {
    this.isDestroyed = true;
    if (this.graceTimeoutId) {
      clearTimeout(this.graceTimeoutId);
      this.graceTimeoutId = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch (e) {}
      this.pc = null;
    }
  }
}
