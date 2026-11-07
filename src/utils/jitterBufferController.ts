/**
 * JitterBufferController — Dynamic jitter buffer target adjustment.
 *
 * RTCRtpReceiver.jitterBufferTarget (ms) controls how much audio the browser
 * pre-buffers before playback. The default (~80ms) is fixed.
 *
 * On low-latency clean links: reduce to ~20ms for instant real-time response.
 * On high-jitter / high-loss links: increase up to 400ms so the NetEQ decoder
 * has sufficient margin to reorder packets and apply packet loss concealment
 * without stuttering or audio underruns.
 */

import { LADDER_TIERS } from '../constants/config';

export class JitterBufferController {
  onLog?: (msg: string, level?: string) => void;
  currentTargetMs: number;

  /**
   * Target jitter buffer delays (ms) mapped per adaptive tier
   * Low-latency on clean broadband (35-40ms), scaling smoothly to absorb 2G/fluctuating packet bursts (280ms)
   */
  static TIER_TARGETS: Record<string, number> = {
    HQ: 160,
    STD: 200,
    LB: 250,
    HL: 300,
    EXT: 350,
    ULTRA: 400
  };

  constructor(options: any = {}) {
    this.onLog = options.onLog;
    this.currentTargetMs = 80;
  }

  /**
   * Get target delay in ms for a tier name
   * @param {string} tierName
   * @returns {number}
   */
  getTargetForTier(tierName) {
    if (!tierName || typeof tierName !== 'string') return 80;
    const name = tierName.toUpperCase();
    return JitterBufferController.TIER_TARGETS[name] || 80;
  }

  /**
   * Apply jitter buffer target for a specific tier on all active audio receivers
   * @param {string} tierName
   * @param {RTCPeerConnection} pc
   * @returns {number|null} Applied target ms or null if unsupported
   */
  applyForTier(tierName, pc) {
    if (!pc || typeof pc.getReceivers !== 'function') {
      return null;
    }

    const targetMs = this.getTargetForTier(tierName);
    this.currentTargetMs = targetMs;

    try {
      const receivers = pc.getReceivers();
      if (!Array.isArray(receivers) || receivers.length === 0) {
        return null;
      }

      let applied = false;
      for (const receiver of receivers) {
        if (receiver && receiver.track && receiver.track.kind === 'audio') {
          // 1. Modern W3C jitterBufferTarget (ms)
          if ('jitterBufferTarget' in receiver) {
            try {
              receiver.jitterBufferTarget = targetMs;
              applied = true;
            } catch (err) {}
          }
          // 2. Standard playoutDelayHint (seconds) for constant deterministic queue delay
          if ('playoutDelayHint' in receiver) {
            try {
              receiver.playoutDelayHint = targetMs / 1000;
              applied = true;
            } catch (err) {}
          }
        }
      }

      if (applied) {
        this.onLog?.(`Jitter buffer target adjusted to ${targetMs}ms (${tierName} tier)`, 'info');
        return targetMs;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Compute continuous elastic shock-absorber delay based on live jitter and loss
   * @param {number} jitterMs
   * @param {number} lossRate (0.0 to 1.0)
   * @returns {number} Delay in ms (35 - 280)
   */
  computeTargetFromMetrics(jitterMs: number = 0, lossRate: number = 0): number {
    const validJitter = Number.isFinite(jitterMs) ? Math.max(0, jitterMs) : 0;
    const validLoss = Number.isFinite(lossRate) ? Math.max(0, Math.min(1.0, lossRate)) : 0;
    const base = 35;
    const jitterComponent = Math.min(190, Math.round(validJitter * 2.2));
    const lossComponent = Math.min(55, Math.round(validLoss * 120));
    return Math.max(35, Math.min(280, base + jitterComponent + lossComponent));
  }

  /**
   * Apply continuous elastic shock-absorber target to active receivers
   */
  applyContinuousTarget(metrics: { jitterMs?: number; lossRate?: number }, pc: RTCPeerConnection): number | null {
    if (!pc || typeof pc.getReceivers !== 'function') return null;
    const targetMs = this.computeTargetFromMetrics(metrics?.jitterMs, metrics?.lossRate);
    
    // Only apply if target has drifted by at least 15ms to prevent noisy re-adjustments
    if (Math.abs(this.currentTargetMs - targetMs) < 15) {
      return this.currentTargetMs;
    }

    this.currentTargetMs = targetMs;
    try {
      const receivers = pc.getReceivers();
      if (!Array.isArray(receivers) || receivers.length === 0) return null;

      let applied = false;
      for (const receiver of receivers) {
        if (receiver && receiver.track && receiver.track.kind === 'audio') {
          if ('jitterBufferTarget' in receiver) {
            try {
              (receiver as any).jitterBufferTarget = targetMs;
              applied = true;
            } catch (err) {}
          }
          if ('playoutDelayHint' in receiver) {
            try {
              receiver.playoutDelayHint = targetMs / 1000;
              applied = true;
            } catch (err) {}
          }
        }
      }
      return applied ? targetMs : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Apply target based on numeric tier index (0-5)
   * @param {number} tierIndex
   * @param {RTCPeerConnection} pc
   * @returns {number|null}
   */
  applyForTierIndex(tierIndex, pc) {
    const tier = LADDER_TIERS[tierIndex] || LADDER_TIERS[0];
    return this.applyForTier(tier.name, pc);
  }
}
