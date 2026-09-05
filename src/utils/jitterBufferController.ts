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
   */
  static TIER_TARGETS: Record<string, number> = {
    HQ: 160,    // Throttled mobile default — variable link needs extra absorption margin
    STD: 200,   // Jittery mobile
    LB: 250,    // Congested
    HL: 300,    // High loss / cell edge
    EXT: 350,   // Severe degradation
    ULTRA: 400  // Satellite / extreme loss
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
