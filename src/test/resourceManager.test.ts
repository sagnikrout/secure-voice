import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioResourceManager } from '../utils/resourceManager';

describe('AudioResourceManager (Web Audio & MediaStream Lifecycle Management)', () => {
  let manager: AudioResourceManager;

  beforeEach(() => {
    manager = new AudioResourceManager();
  });

  it('initializes with zero tracked resources', () => {
    const stats = manager.getStats();
    expect(stats.trackedContexts).toBe(0);
    expect(stats.trackedNodes).toBe(0);
    expect(stats.trackedStreams).toBe(0);
    expect(stats.trackedTracks).toBe(0);
  });

  it('registers and tracks AudioContext and AudioNode instances', () => {
    const mockNode1 = { disconnect: vi.fn() } as unknown as AudioNode;
    const mockNode2 = { disconnect: vi.fn() } as unknown as AudioNode;
    const mockCtx = {
      state: 'running',
      close: vi.fn().mockResolvedValue(undefined)
    } as unknown as AudioContext;

    manager.registerContext(mockCtx);
    manager.registerNode(mockCtx, mockNode1);
    manager.registerNode(mockCtx, mockNode2);

    const stats = manager.getStats();
    expect(stats.trackedContexts).toBe(1);
    expect(stats.trackedNodes).toBe(2);
  });

  it('registers array and record of AudioNodes', () => {
    const mockNode1 = { disconnect: vi.fn() } as unknown as AudioNode;
    const mockNode2 = { disconnect: vi.fn() } as unknown as AudioNode;
    const mockCtx = {
      state: 'running',
      close: vi.fn().mockResolvedValue(undefined)
    } as unknown as AudioContext;

    manager.registerNodes(mockCtx, { highPass: mockNode1, lowPass: mockNode2 });
    expect(manager.getStats().trackedNodes).toBe(2);

    manager.registerNodes(mockCtx, [mockNode1]);
    // Duplicate node should not increment set count
    expect(manager.getStats().trackedNodes).toBe(2);
  });

  it('registers MediaStream and automatically tracks its tracks', () => {
    const mockTrack1 = { stop: vi.fn(), enabled: true } as unknown as MediaStreamTrack;
    const mockTrack2 = { stop: vi.fn(), enabled: true } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: vi.fn(() => [mockTrack1, mockTrack2])
    } as unknown as MediaStream;

    manager.registerStream(mockStream);

    const stats = manager.getStats();
    expect(stats.trackedStreams).toBe(1);
    expect(stats.trackedTracks).toBe(2);
  });

  it('cleanupContext disconnects all nodes, cancels scheduled params, and closes context', async () => {
    const cancelGain = vi.fn();
    const cancelFreq = vi.fn();
    const mockNode1 = {
      disconnect: vi.fn(),
      gain: { cancelScheduledValues: cancelGain }
    } as unknown as AudioNode;
    const mockNode2 = {
      disconnect: vi.fn(),
      frequency: { cancelScheduledValues: cancelFreq }
    } as unknown as AudioNode;
    const mockCtx = {
      state: 'running',
      close: vi.fn().mockResolvedValue(undefined)
    } as unknown as AudioContext;

    manager.registerNodes(mockCtx, [mockNode1, mockNode2]);
    expect(manager.getStats().trackedNodes).toBe(2);

    await manager.cleanupContext(mockCtx);

    expect(mockNode1.disconnect).toHaveBeenCalled();
    expect(mockNode2.disconnect).toHaveBeenCalled();
    expect(cancelGain).toHaveBeenCalled();
    expect(cancelFreq).toHaveBeenCalled();
    expect(mockCtx.close).toHaveBeenCalled();

    const stats = manager.getStats();
    expect(stats.trackedContexts).toBe(0);
    expect(stats.trackedNodes).toBe(0);
  });

  it('cleanupStream stops all tracks and releases stream reference', () => {
    const mockTrack1 = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mockTrack2 = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: vi.fn(() => [mockTrack1, mockTrack2])
    } as unknown as MediaStream;

    manager.registerStream(mockStream);
    expect(manager.getStats().trackedStreams).toBe(1);

    manager.cleanupStream(mockStream);
    expect(mockTrack1.stop).toHaveBeenCalled();
    expect(mockTrack2.stop).toHaveBeenCalled();
    expect(manager.getStats().trackedStreams).toBe(0);
    expect(manager.getStats().trackedTracks).toBe(0);
  });

  it('cleanupAll cleanly releases everything', async () => {
    const mockTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mockStream = { getTracks: vi.fn(() => [mockTrack]) } as unknown as MediaStream;
    const mockNode = { disconnect: vi.fn() } as unknown as AudioNode;
    const mockCtx = { state: 'running', close: vi.fn().mockResolvedValue(undefined) } as unknown as AudioContext;

    manager.registerStream(mockStream);
    manager.registerNode(mockCtx, mockNode);

    expect(manager.getStats().trackedStreams).toBe(1);
    expect(manager.getStats().trackedContexts).toBe(1);

    await manager.cleanupAll();

    expect(mockTrack.stop).toHaveBeenCalled();
    expect(mockNode.disconnect).toHaveBeenCalled();
    expect(mockCtx.close).toHaveBeenCalled();

    const finalStats = manager.getStats();
    expect(finalStats.trackedContexts).toBe(0);
    expect(finalStats.trackedNodes).toBe(0);
    expect(finalStats.trackedStreams).toBe(0);
    expect(finalStats.trackedTracks).toBe(0);
  });

  it('handles 100 consecutive rapid reconnection cycles without memory accumulation', async () => {
    for (let i = 0; i < 100; i++) {
      const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
      const stream = { getTracks: vi.fn(() => [track]) } as unknown as MediaStream;
      const node = { disconnect: vi.fn() } as unknown as AudioNode;
      const ctx = { state: 'running', close: vi.fn().mockResolvedValue(undefined) } as unknown as AudioContext;

      manager.registerStream(stream);
      manager.registerNode(ctx, node);
      await manager.cleanupAll();
    }

    const finalStats = manager.getStats();
    expect(finalStats.trackedContexts).toBe(0);
    expect(finalStats.trackedNodes).toBe(0);
    expect(finalStats.trackedStreams).toBe(0);
    expect(finalStats.trackedTracks).toBe(0);
  });
});
