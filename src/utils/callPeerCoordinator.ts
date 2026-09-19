/**
 * WebRTC Call Peer Coordinator
 *
 * Coordinates peer connection state, DataChannel security synchronization,
 * DTLS safety code computation, ICE restart state machine, network telemetry monitoring,
 * adaptive bitrate ladder progression, NetEQ jitter buffer margin adjustment,
 * packet pacing headroom scaling, and Lyra/Opus neural codec transform streaming.
 */

import { transformOpusSdp, getQualityRating, generateSafetyCode, applySenderBitrate } from './webrtc';
import { NetworkTelemetryMonitor, AdaptiveBitrateController, evaluateCodecCrossover } from './networkAdaptation';
import { IceRestartManager } from './iceRestartManager';
import { JitterBufferController } from './jitterBufferController';
import { PacketPacer } from './packetPacer';
import { TurnRelayManager } from './turnManager';
import { TIMINGS, LADDER_TIERS } from '../constants/config';
import { structuredLogger } from './structuredLogger';
import { auditoryFeedback } from './auditoryFeedback';
import { lyraManager, lyraTransformController, lyraWasmLoader } from './lyra';
import { CodecType, CodecPreference, LyraBitrate } from '../types';

export interface CallPeerCoordinatorCallbacks {
  onStatusChange?: (status: string) => void;
  onLog?: (msg: string, level?: string) => void;
  onSafetyCode?: (code: string) => void;
  onQualityChange?: (quality: 'good' | 'fair' | 'poor') => void;
  onTierChange?: (tier: typeof LADDER_TIERS[0], bitrateBps: number) => void;
  onTelemetrySnapshot?: (snapshot: any) => void;
  onCodecChange?: (codec: CodecType) => void;
  onFatalDisconnect?: () => void;
  getPreferredCodec: () => CodecPreference;
  getActiveCodec: () => CodecType;
}

export class CallPeerCoordinator {
  public bitrateController: AdaptiveBitrateController;
  public jitterController: JitterBufferController;
  public packetPacer: PacketPacer;
  public turnRelayManager: TurnRelayManager;

  private telemetryMonitor: NetworkTelemetryMonitor | null = null;
  private iceRestartManager: IceRestartManager | null = null;
  private safetyInterval: any = null;
  private safetyChannel: RTCDataChannel | null = null;
  private crossoverHealthyTicks: number = 0;
  private callbacks: CallPeerCoordinatorCallbacks;
  private attachedPc: RTCPeerConnection | null = null;
  private isInitialized: boolean = false;

  constructor(callbacks: CallPeerCoordinatorCallbacks) {
    this.callbacks = callbacks;
    this.bitrateController = new AdaptiveBitrateController();
    this.jitterController = new JitterBufferController({
      onLog: (msg, level) => this.callbacks.onLog?.(msg, level)
    });
    this.packetPacer = new PacketPacer({
      onLog: (msg, level) => this.callbacks.onLog?.(msg, level)
    });
    this.turnRelayManager = new TurnRelayManager(null, {
      onLog: (msg, level) => this.callbacks.onLog?.(msg, level)
    });
  }

  public updateCallbacks(callbacks: CallPeerCoordinatorCallbacks): void {
    this.callbacks = callbacks;
  }

  public getCurrentTier() {
    return this.bitrateController.getCurrentTier();
  }

  /**
   * Attach and configure WebRTC peer connection listeners and monitors
   */
  public attach(call: any, isCaller: boolean): void {
    const pc = call.peerConnection || (call as any)._peerConnection;
    if (!pc) return;

    this.attachedPc = pc;

    if (typeof window !== 'undefined') {
      (window as any).__SECUREVOICE_ACTIVE_PC__ = pc;
    }

    // Direct DataChannel creation for instantaneous Safety Code synchronization
    try {
      if (!(pc as any)._safetyChannel) {
        const dc = pc.createDataChannel('securevoice_security_sync', { negotiated: true, id: 0 });
        (pc as any)._safetyChannel = dc;
        this.safetyChannel = dc;
        dc.onmessage = (event: any) => {
          try {
            const data = JSON.parse(event.data);
            if (data && data.type === 'safety_code' && data.code) {
              this.callbacks.onSafetyCode?.(data.code);
            }
          } catch (e: any) {}
        };
      } else {
        this.safetyChannel = (pc as any)._safetyChannel;
      }
    } catch (e: any) {}

    // Start safety code polling during handshake
    this.computeAndSetSafetyCode(pc);
    if (this.safetyInterval) clearInterval(this.safetyInterval);
    this.safetyInterval = setInterval(() => this.computeAndSetSafetyCode(pc), 250);
    setTimeout(() => {
      if (this.safetyInterval) {
        clearInterval(this.safetyInterval);
        this.safetyInterval = null;
      }
    }, 8000);

    if (this.isInitialized) return;
    this.isInitialized = true;

    // Instantiate IceRestartManager
    const iceManager = new IceRestartManager({
      onStatusChange: (status) => {
        if (status === 'reconnecting') {
          auditoryFeedback.notifyReconnecting();
        }
        this.callbacks.onStatusChange?.(status);
      },
      onLog: (msg, level) => this.callbacks.onLog?.(msg, level),
      onDiagnostic: (event, data) => {
        const level = event.includes('fail') || event.includes('tripped') ? 'warn' : 'info';
        structuredLogger.log(level, event, data);
      },
      onFatalDisconnect: () => {
        this.callbacks.onLog?.('Connection recovery failed after 5 attempts. Terminating call.', 'error');
        this.callbacks.onFatalDisconnect?.();
      },
      sendRenegotiation: async (msg) => {
        if (call.dataChannel && call.dataChannel.readyState === 'open') {
          try {
            call.dataChannel.send(JSON.stringify(msg));
          } catch (e: any) {}
        }
      },
      sdpTransform: (sdp) => {
        const currentTier = this.bitrateController.getCurrentTier();
        return transformOpusSdp(sdp, {
          bitrate: currentTier.maxBitrateBps,
          bandwidthCapKbps: currentTier.bandwidthCapKbps,
          ptime: currentTier.ptimeMs,
          maxptime: currentTier.maxPtimeMs,
          packetLossPerc: currentTier.fecPacketLossPerc,
          maxPlaybackRate: currentTier.maxPlaybackRate
        });
      }
    });
    this.iceRestartManager = iceManager;

    pc.onsignalingstatechange = () => {
      this.computeAndSetSafetyCode(pc);
    };

    pc.onconnectionstatechange = () => {
      this.computeAndSetSafetyCode(pc);
      iceManager.handleStateChange(pc.connectionState, pc.iceConnectionState, pc, isCaller);
      if (pc.connectionState === 'connected') {
        this.turnRelayManager.recordP2PSuccess();
      } else if (pc.connectionState === 'failed') {
        this.turnRelayManager.recordP2PFailure();
      } else if (pc.connectionState === 'closed') {
        this.callbacks.onFatalDisconnect?.();
      }
    };

    pc.oniceconnectionstatechange = () => {
      this.computeAndSetSafetyCode(pc);
      iceManager.handleStateChange(pc.connectionState, pc.iceConnectionState, pc, isCaller);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.turnRelayManager.recordP2PSuccess();
      } else if (pc.iceConnectionState === 'failed') {
        this.turnRelayManager.recordP2PFailure();
      }
    };

    // Setup Telemetry Monitor
    if (this.telemetryMonitor) {
      this.telemetryMonitor.stop();
      this.telemetryMonitor = null;
    }

    const monitor = new NetworkTelemetryMonitor(pc, async (snapshot) => {
      this.callbacks.onTelemetrySnapshot?.(snapshot);
      if (snapshot && snapshot.rttMs !== null && snapshot.rttMs !== undefined) {
        this.callbacks.onQualityChange?.(getQualityRating(snapshot.rttSeconds));
      }

      // Dynamic Adaptive Headroom Scaling for Packet Pacer
      if (snapshot) {
        this.packetPacer.updateHeadroom({
          bufferOccupancy: snapshot.avgJitterBufferDelayMs ? Math.min(100, Math.round(snapshot.avgJitterBufferDelayMs / 2)) : undefined,
          loss: snapshot.effectiveLossRate,
          jitter: snapshot.jitterMs,
          rtt: snapshot.rttMs ?? undefined
        });
      }

      // Adaptive Bitrate & Jitter Buffer & Packet Pacing Evaluation
      const evaluation = this.bitrateController.evaluate(snapshot);
      if (evaluation.tierChanged) {
        this.callbacks.onTierChange?.(evaluation.currentTier, evaluation.targetBitrateBps);
        const audioSender = pc.getSenders?.()?.find((s: any) => s.track && s.track.kind === 'audio');
        if (audioSender) {
          await applySenderBitrate(audioSender, evaluation.targetBitrateBps);
          this.callbacks.onLog?.(evaluation.reason, 'info');
        }

        // 1. Dynamic Jitter Buffer Target Adjustment
        this.jitterController.applyForTier(evaluation.currentTier.name, pc);

        // 2. Packet Pacing & Traffic Shaping
        await this.packetPacer.applyForTierObject(evaluation.currentTier, pc);
      }

      // 3. Dynamic 14 kbps Acoustic Quality Crossover Evaluation
      const preferred = this.callbacks.getPreferredCodec();
      const currentActive = this.callbacks.getActiveCodec();

      if (preferred === 'auto') {
        const crossover = evaluateCodecCrossover({
          snapshot,
          currentCodec: currentActive,
          consecutiveHealthyTicks: this.crossoverHealthyTicks,
          simdSupported: lyraWasmLoader.checkCompatibility().simd
        });
        this.crossoverHealthyTicks = crossover.consecutiveHealthyTicks;
        if (crossover.codecChanged) {
          lyraManager.setActiveCodec(crossover.targetCodec);
          this.callbacks.onCodecChange?.(crossover.targetCodec);
          this.callbacks.onLog?.(crossover.reason, 'info');
        }

        // Asymmetry-Aware Lyra Bitrate Scaling (3.2 -> 6.0 -> 9.2 kbps)
        const activeOrTarget = !crossover.codecChanged ? currentActive : crossover.targetCodec;
        if (activeOrTarget === 'lyra' && snapshot) {
          const bps = snapshot.availableOutgoingBitrate || 0;
          const outboundLoss = snapshot.outboundLossRate || 0;
          const inboundLoss = snapshot.inboundLossRate || 0;
          const effectiveLoss = Math.max(outboundLoss, inboundLoss);

          let targetLyraBitrate: LyraBitrate = 3200;
          if (bps >= 10000 && effectiveLoss < 0.04) {
            targetLyraBitrate = 9200;
          } else if (bps >= 6500 && effectiveLoss < 0.08) {
            targetLyraBitrate = 6000;
          } else {
            targetLyraBitrate = 3200;
          }

          const currentStats = lyraManager.getStats();
          if (currentStats && currentStats.bitrateBps !== targetLyraBitrate) {
            lyraManager.setBitrate(targetLyraBitrate);
            this.callbacks.onLog?.(`Lyra v2 scaled to ${(targetLyraBitrate / 1000).toFixed(1)} kbps (Uplink: ${bps > 0 ? Math.round(bps / 1000) + 'k' : 'N/A'}, Loss: ${(effectiveLoss * 100).toFixed(1)}%)`, 'info');
          }
        }
      }
    }, { intervalMs: TIMINGS.STATS_POLL_INTERVAL_MS || 1000 });

    monitor.start();
    this.telemetryMonitor = monitor;

    // Attach Lyra neural transform streams to audio senders and receivers
    try {
      const audioSenders = pc.getSenders?.()?.filter((s: any) => s.track && s.track.kind === 'audio');
      if (audioSenders && audioSenders.length > 0) {
        audioSenders.forEach((s: any) => lyraTransformController.attachSender(s));
      }
      const audioReceivers = pc.getReceivers?.()?.filter((r: any) => r.track && r.track.kind === 'audio');
      if (audioReceivers && audioReceivers.length > 0) {
        audioReceivers.forEach((r: any) => lyraTransformController.attachReceiver(r));
      }
    } catch (e: any) {
      console.warn('Lyra transform attachment notice:', e);
    }

    // Enforce initial jitter buffer target and pacing
    const initialTier = this.bitrateController.getCurrentTier();
    this.jitterController.applyForTier(initialTier.name, pc);
    this.packetPacer.applyForTierObject(initialTier, pc).catch(() => {});
  }

  /**
   * Compute Safety Code and dispatch over DataChannel
   */
  public async computeAndSetSafetyCode(pc: RTCPeerConnection): Promise<void> {
    const localSdp = pc.currentLocalDescription?.sdp || pc.localDescription?.sdp;
    const remoteSdp = pc.currentRemoteDescription?.sdp || pc.remoteDescription?.sdp;

    if (localSdp && remoteSdp) {
      try {
        const code = await generateSafetyCode(localSdp, remoteSdp);
        if (code) {
          this.callbacks.onSafetyCode?.(code);
          const dc = this.safetyChannel || (pc as any)._safetyChannel;
          if (dc && dc.readyState === 'open') {
            try { dc.send(JSON.stringify({ type: 'safety_code', code })); } catch (e: any) {}
          } else if (dc) {
            dc.onopen = () => {
              try { dc.send(JSON.stringify({ type: 'safety_code', code })); } catch (e: any) {}
            };
          }
        }
      } catch (err: any) {
        this.callbacks.onLog?.(`Safety code generation failed: ${err.message}`, 'warn');
      }
    }
  }

  /**
   * Reset session and tear down active monitors
   */
  public detach(): void {
    if (this.telemetryMonitor) {
      this.telemetryMonitor.stop();
      this.telemetryMonitor = null;
    }

    if (this.iceRestartManager) {
      this.iceRestartManager.reset();
      this.iceRestartManager = null;
    }

    if (this.safetyInterval) {
      clearInterval(this.safetyInterval);
      this.safetyInterval = null;
    }

    this.bitrateController.reset();
    this.crossoverHealthyTicks = 0;
    this.safetyChannel = null;
    this.attachedPc = null;
    this.isInitialized = false;

    if (typeof window !== 'undefined') {
      (window as any).__SECUREVOICE_ACTIVE_PC__ = null;
    }
  }

  public reset(): void {
    this.detach();
  }
}
