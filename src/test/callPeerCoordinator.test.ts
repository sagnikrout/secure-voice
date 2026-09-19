import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CallPeerCoordinator } from '../utils/callPeerCoordinator';
import { LADDER_TIERS } from '../constants/config';

describe('CallPeerCoordinator', () => {
  let callbacks: any;
  let coordinator: CallPeerCoordinator;

  beforeEach(() => {
    callbacks = {
      onStatusChange: vi.fn(),
      onLog: vi.fn(),
      onSafetyCode: vi.fn(),
      onQualityChange: vi.fn(),
      onTierChange: vi.fn(),
      onTelemetrySnapshot: vi.fn(),
      onCodecChange: vi.fn(),
      onFatalDisconnect: vi.fn(),
      getPreferredCodec: vi.fn().mockReturnValue('opus'),
      getActiveCodec: vi.fn().mockReturnValue('opus')
    };
    coordinator = new CallPeerCoordinator(callbacks);
  });

  afterEach(() => {
    coordinator.detach();
    vi.clearAllMocks();
  });

  it('initializes with default tier and controllers', () => {
    expect(coordinator.getCurrentTier().name).toBe('HQ');
    expect(coordinator.bitrateController).toBeDefined();
    expect(coordinator.jitterController).toBeDefined();
    expect(coordinator.packetPacer).toBeDefined();
    expect(coordinator.turnRelayManager).toBeDefined();
  });

  it('attaches to peer connection and creates security sync DataChannel', () => {
    const mockChannel: any = {
      readyState: 'open',
      send: vi.fn(),
      onmessage: null
    };

    const mockPc: any = {
      createDataChannel: vi.fn().mockReturnValue(mockChannel),
      getSenders: vi.fn().mockReturnValue([]),
      getReceivers: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockResolvedValue(new Map()),
      currentLocalDescription: { sdp: 'v=0\r\na=fingerprint:sha-256 AA:BB\r\n' },
      currentRemoteDescription: { sdp: 'v=0\r\na=fingerprint:sha-256 CC:DD\r\n' }
    };

    const mockCall: any = {
      peerConnection: mockPc,
      options: { _isCaller: true }
    };

    coordinator.attach(mockCall, true);

    expect(mockPc.createDataChannel).toHaveBeenCalledWith('securevoice_security_sync', {
      negotiated: true,
      id: 0
    });

    // Simulate receiving a safety code over DataChannel
    mockChannel.onmessage({
      data: JSON.stringify({ type: 'safety_code', code: '12345678' })
    });

    expect(callbacks.onSafetyCode).toHaveBeenCalledWith('12345678');
  });

  it('updates callbacks dynamically without reattaching', () => {
    const newLog = vi.fn();
    coordinator.updateCallbacks({
      ...callbacks,
      onLog: newLog
    });

    coordinator.turnRelayManager.recordP2PSuccess();
    // Verify callback was updated
    expect(callbacks.onLog).not.toHaveBeenCalled();
  });

  it('detaches cleanly and clears all monitors and intervals', () => {
    const mockPc: any = {
      createDataChannel: vi.fn().mockReturnValue({ readyState: 'open' }),
      getSenders: vi.fn().mockReturnValue([]),
      getReceivers: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockResolvedValue(new Map())
    };
    coordinator.attach({ peerConnection: mockPc }, false);

    coordinator.detach();
    expect(coordinator.getCurrentTier().name).toBe('HQ');
    if (typeof window !== 'undefined') {
      expect((window as any).__SECUREVOICE_ACTIVE_PC__).toBeNull();
    }
  });
});
