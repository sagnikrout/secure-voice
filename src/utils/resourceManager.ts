/**
 * Audio Resource Manager
 *
 * Implements the Resource Manager pattern for Web Audio and MediaStream lifecycles.
 * Guarantees zero dangling references, cancels scheduled AudioParams, cleanly disconnects
 * all DSP nodes, stops hardware MediaStreamTracks, and closes AudioContexts.
 */

import { AudioResourceManagerStats } from '../types';

export class AudioResourceManager {
  public sharedContext: AudioContext | null = null;
  private contextNodeMap: Map<AudioContext, Set<AudioNode>> = new Map();
  private trackedContexts: Set<AudioContext> = new Set();
  private trackedStreams: Set<MediaStream> = new Set();
  private trackedTracks: Set<MediaStreamTrack> = new Set();

  /**
   * Register an AudioContext for managed lifecycle tracking
   */
  registerContext(context: AudioContext | null | undefined): AudioContext | null {
    if (!context) return null;
    this.trackedContexts.add(context);
    if (!this.contextNodeMap.has(context)) {
      this.contextNodeMap.set(context, new Set());
    }
    return context;
  }

  /**
   * Register a single AudioNode associated with an AudioContext
   */
  registerNode<T extends AudioNode>(context: AudioContext | null | undefined, node: T | null | undefined): T | null {
    if (!node) return null;
    if (context) {
      this.registerContext(context);
      const nodeSet = this.contextNodeMap.get(context);
      if (nodeSet) {
        nodeSet.add(node);
      }
    }
    return node;
  }

  /**
   * Register multiple AudioNodes or a record of nodes
   */
  registerNodes(
    context: AudioContext | null | undefined,
    nodes: Array<AudioNode | null | undefined> | Record<string, any> | null | undefined
  ): void {
    if (!nodes) return;
    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        if (node && typeof (node as any).disconnect === 'function') {
          this.registerNode(context, node as AudioNode);
        }
      }
    } else if (typeof nodes === 'object') {
      for (const key of Object.keys(nodes)) {
        const item = nodes[key];
        if (item && typeof item.disconnect === 'function') {
          this.registerNode(context, item as AudioNode);
        }
      }
    }
  }

  /**
   * Register a MediaStream for managed lifecycle tracking
   */
  registerStream(stream: MediaStream | null | undefined): MediaStream | null {
    if (!stream) return null;
    this.trackedStreams.add(stream);
    if (typeof stream.getTracks === 'function') {
      try {
        const tracks = stream.getTracks();
        if (Array.isArray(tracks)) {
          for (const track of tracks) {
            this.registerTrack(track);
          }
        }
      } catch (e) {}
    }
    return stream;
  }

  /**
   * Register an individual MediaStreamTrack
   */
  registerTrack(track: MediaStreamTrack | null | undefined): MediaStreamTrack | null {
    if (!track) return null;
    this.trackedTracks.add(track);
    return track;
  }

  /**
   * Disconnect and release all nodes for a specific context, then close the context
   */
  async cleanupContext(context: AudioContext | null | undefined): Promise<void> {
    if (!context) return;

    const nodeSet = this.contextNodeMap.get(context);
    if (nodeSet) {
      for (const node of nodeSet) {
        try {
          // Cancel scheduled AudioParams if present to prevent memory retention
          if ((node as any).gain && typeof (node as any).gain.cancelScheduledValues === 'function') {
            try {
              (node as any).gain.cancelScheduledValues(0);
            } catch (e) {}
          }
          if ((node as any).frequency && typeof (node as any).frequency.cancelScheduledValues === 'function') {
            try {
              (node as any).frequency.cancelScheduledValues(0);
            } catch (e) {}
          }
          if (typeof node.disconnect === 'function') {
            node.disconnect();
          }
        } catch (e) {}
      }
      nodeSet.clear();
      this.contextNodeMap.delete(context);
    }

    if (context.state !== 'closed' && typeof context.close === 'function') {
      try {
        await context.close();
      } catch (e) {}
    }

    this.trackedContexts.delete(context);
  }

  /**
   * Stop and unregister a MediaStreamTrack
   */
  cleanupTrack(track: MediaStreamTrack | null | undefined): void {
    if (!track) return;
    try {
      if (typeof track.stop === 'function') {
        track.stop();
      }
    } catch (e) {}
    this.trackedTracks.delete(track);
  }

  /**
   * Stop and release all tracks associated with a MediaStream
   */
  cleanupStream(stream: MediaStream | null | undefined): void {
    if (!stream) return;
    try {
      if (typeof stream.getTracks === 'function') {
        const tracks = stream.getTracks();
        if (Array.isArray(tracks)) {
          for (const track of tracks) {
            this.cleanupTrack(track);
          }
        }
      }
    } catch (e) {}
    this.trackedStreams.delete(stream);
  }

  /**
   * Complete teardown of all tracked Web Audio and MediaStream resources
   */
  async cleanupAll(): Promise<void> {
    // 1. Release all MediaStream tracks
    for (const track of Array.from(this.trackedTracks)) {
      this.cleanupTrack(track);
    }
    this.trackedTracks.clear();

    // 2. Release all MediaStreams
    this.trackedStreams.clear();

    // 3. Disconnect all nodes and close all contexts
    const contexts = Array.from(this.trackedContexts);
    for (const ctx of contexts) {
      await this.cleanupContext(ctx);
    }
    this.trackedContexts.clear();
    this.contextNodeMap.clear();
  }

  /**
   * Return current resource statistics
   */
  getStats(): AudioResourceManagerStats {
    let totalNodes = 0;
    for (const nodeSet of this.contextNodeMap.values()) {
      totalNodes += nodeSet.size;
    }

    return {
      trackedContexts: this.trackedContexts.size,
      trackedNodes: totalNodes,
      trackedStreams: this.trackedStreams.size,
      trackedTracks: this.trackedTracks.size
    };
  }
}

export const audioResourceManager = new AudioResourceManager();
