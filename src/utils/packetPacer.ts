/**
 * PacketPacer — Smooth packet burst transmission to eliminate router queue drops
 * with Adaptive Dynamic Headroom Scaling.
 *
 * WebRTC's default pacing can sometimes burst multiple audio frames simultaneously,
 * causing shallow router buffers on cellular/satellite links to overflow and drop packets.
 *
 * This utility applies:
 * 1. RTCRtpSender encoding `priority` and `networkPriority` markings (DSCP Expedited Forwarding).
 * 2. Dynamic bitrate pacing headroom (10% - 25% margin) based on real-time buffer occupancy and loss.
 * 3. Dynamic adjustment matching the active adaptive ladder tier.
 */

import { PacketPacerMetrics } from '../types';

export class PacketPacer {
  onLog?: (msg: string, level?: string) => void;
  headroomFactor: number;
  minHeadroomFactor: number;
  maxHeadroomFactor: number;

  /**
   * Sender priority mappings per tier
   */
  static TIER_PRIORITIES: Record<string, { priority: RTCPriorityType; networkPriority: RTCPriorityType }> = {
    HQ: { priority: 'high', networkPriority: 'high' },
    STD: { priority: 'high', networkPriority: 'high' },
    LB: { priority: 'high', networkPriority: 'high' },
    HL: { priority: 'high', networkPriority: 'high' },
    EXT: { priority: 'high', networkPriority: 'high' },
    ULTRA: { priority: 'high', networkPriority: 'high' }
  };

  constructor(options: any = {}) {
    this.onLog = options.onLog;
    this.headroomFactor = typeof options.headroomFactor === 'number' ? options.headroomFactor : 0.85; // 15% default headroom
    this.minHeadroomFactor = typeof options.minHeadroomFactor === 'number' ? options.minHeadroomFactor : 0.75; // 25% max headroom
    this.maxHeadroomFactor = typeof options.maxHeadroomFactor === 'number' ? options.maxHeadroomFactor : 0.90; // 10% min headroom
  }

  /**
   * Update pacing headroom based on dynamic network telemetry
   */
  updateHeadroom(metrics: PacketPacerMetrics): number {
    if (!metrics) return this.headroomFactor;

    const { bufferOccupancy, loss, jitter } = metrics;
    let adjusted = false;

    // Buffer congestion, high loss or high jitter -> increase headroom (lower headroomFactor)
    if ((bufferOccupancy !== undefined && bufferOccupancy > 75) || (loss !== undefined && loss > 0.12) || (jitter !== undefined && jitter > 80)) {
      if (this.headroomFactor > this.minHeadroomFactor) {
        this.headroomFactor = Math.max(this.minHeadroomFactor, +(this.headroomFactor - 0.02).toFixed(2));
        adjusted = true;
      }
    }
    // Clean underutilized network -> reduce headroom (raise headroomFactor)
    else if (
      (bufferOccupancy !== undefined && bufferOccupancy < 25 || loss !== undefined && loss < 0.03) &&
      (jitter === undefined || jitter < 40)
    ) {
      if (this.headroomFactor < this.maxHeadroomFactor) {
        this.headroomFactor = Math.min(this.maxHeadroomFactor, +(this.headroomFactor + 0.01).toFixed(2));
        adjusted = true;
      }
    }

    if (adjusted) {
      this.onLog?.(`Pacer headroom dynamically adjusted to ${this.getHeadroomPercent()}% (factor: ${this.headroomFactor})`, 'debug');
    }

    return this.headroomFactor;
  }

  /**
   * Get current headroom percentage (10% - 25%)
   */
  getHeadroomPercent(): number {
    return Math.round((1 - this.headroomFactor) * 100);
  }

  /**
   * Explicitly set headroom factor
   */
  setHeadroomFactor(factor: number): void {
    this.headroomFactor = Math.max(this.minHeadroomFactor, Math.min(this.maxHeadroomFactor, factor));
  }

  /**
   * Apply pacing encoding parameters to active audio sender
   * @param {string} tierName
   * @param {number} tierMaxBitrateBps
   * @param {RTCPeerConnection} pc
   * @returns {Promise<boolean>} True if parameters were successfully applied
   */
  async applyForTier(tierName: string, tierMaxBitrateBps: number, pc: any): Promise<boolean> {
    if (!pc || typeof pc.getSenders !== 'function') {
      return false;
    }

    try {
      const senders = pc.getSenders();
      if (!Array.isArray(senders)) return false;

      const audioSender = senders.find((s: any) => s && s.track && s.track.kind === 'audio');
      if (!audioSender || typeof audioSender.getParameters !== 'function' || typeof audioSender.setParameters !== 'function') {
        return false;
      }

      const params = audioSender.getParameters();
      if (!params || !Array.isArray(params.encodings) || params.encodings.length === 0) {
        return false;
      }

      const tierPriority = PacketPacer.TIER_PRIORITIES[tierName?.toUpperCase()] || { priority: 'high', networkPriority: 'high' };
      const pacedBitrate = Math.max(3000, Math.floor(tierMaxBitrateBps * this.headroomFactor));

      params.encodings[0].priority = tierPriority.priority;
      params.encodings[0].networkPriority = tierPriority.networkPriority;
      params.encodings[0].maxBitrate = pacedBitrate;

      await audioSender.setParameters(params);
      this.onLog?.(`Packet pacer applied: ${pacedBitrate} bps (${this.getHeadroomPercent()}% headroom) with ${tierPriority.networkPriority} priority (${tierName})`, 'info');
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Convenience helper taking full tier object
   */
  async applyForTierObject(tier: any, pc: any): Promise<boolean> {
    if (!tier) return false;
    return this.applyForTier(tier.name, tier.maxBitrateBps, pc);
  }
}
