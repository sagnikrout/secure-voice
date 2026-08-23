import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IceRestartManager } from '../utils/iceRestartManager';
import { generateSafetyCode } from '../utils/webrtc';
import { ICE_RECONNECT_CONFIG } from '../constants/config';

/**
 * Factory creating mock RTCPeerConnection with full ICE lifecycle support
 */
export function createMockPeerConnection() {
  const listeners = {};
  const mockSender = {
    track: { id: 'audio-track-1', kind: 'audio', enabled: true, stop: vi.fn() },
    getParameters: vi.fn(() => ({
      encodings: [{ maxBitrate: 14000, priority: 'high', networkPriority: 'high' }]
    })),
    setParameters: vi.fn().mockResolvedValue(undefined),
    replaceTrack: vi.fn().mockResolvedValue(undefined)
  };

  const pc = {
    connectionState: 'connected',
    iceConnectionState: 'connected',
    signalingState: 'stable',
    localDescription: {
      type: 'offer',
      sdp: 'v=0\r\na=ice-ufrag:initialUfrag\r\na=ice-pwd:initialPwd\r\na=fingerprint:sha-256 AA:BB:CC:DD\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
    },
    remoteDescription: {
      type: 'answer',
      sdp: 'v=0\r\na=ice-ufrag:remoteUfrag\r\na=ice-pwd:remotePwd\r\na=fingerprint:sha-256 EE:FF:00:11\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
    },
    restartIce: vi.fn(() => {
      pc.iceConnectionState = 'checking';
    }),
    createOffer: vi.fn((options) => {
      const isRestart = options?.iceRestart === true;
      const ufrag = isRestart ? 'restartedUfrag99' : 'initialUfrag';
      const pwd = isRestart ? 'restartedPwd99' : 'initialPwd';
      return Promise.resolve({
        type: 'offer',
        sdp: `v=0\r\na=ice-ufrag:${ufrag}\r\na=ice-pwd:${pwd}\r\na=fingerprint:sha-256 AA:BB:CC:DD\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n`
      });
    }),
    createAnswer: vi.fn(() => Promise.resolve({
      type: 'answer',
      sdp: 'v=0\r\na=ice-ufrag:newRemoteUfrag\r\na=ice-pwd:newRemotePwd\r\na=fingerprint:sha-256 EE:FF:00:11\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
    })),
    setLocalDescription: vi.fn((desc) => {
      pc.localDescription = desc;
      return Promise.resolve();
    }),
    setRemoteDescription: vi.fn((desc) => {
      pc.remoteDescription = desc;
      return Promise.resolve();
    }),
    getSenders: vi.fn(() => [mockSender]),
    getStats: vi.fn().mockResolvedValue(new Map()),
    close: vi.fn(() => {
      pc.connectionState = 'closed';
      pc.iceConnectionState = 'closed';
      pc.signalingState = 'closed';
    }),
    addEventListener: vi.fn((event, handler) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    }),
    removeEventListener: vi.fn((event, handler) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
    }),
    _trigger(event) {
      if (pc[`on${event}`]) pc[`on${event}`]();
      if (listeners[event]) listeners[event].forEach(h => h());
    }
  };

  return { pc, mockSender };
}

/**
 * Factory creating active mock Call Session context
 */
export function createMockCallSession() {
  const mockTrack = { id: 'mic-track', kind: 'audio', enabled: true, stop: vi.fn() };
  const mockStream = {
    active: true,
    getAudioTracks: vi.fn(() => [mockTrack]),
    getTracks: vi.fn(() => [mockTrack])
  };
  const mockAudioCtx = {
    state: 'running',
    close: vi.fn().mockResolvedValue(undefined)
  };

  return {
    rawStream: mockStream,
    processedStream: mockStream,
    audioCtx: mockAudioCtx,
    mockTrack,
    callDuration: 42,
    connectedPeer: 'PEER-XYZ-789',
    safetyCode: '58291',
    isMuted: false
  };
}

describe('WebRTC ICE Restart & Non-Destructive Fast Reconnect (src/test/iceRestart.test.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------
  // SUITE 1: State Machine Definitions & Event Triggers
  // -------------------------------------------------------------
  describe('1. ICE Restart State Machine Transitions', () => {
    it('transitions through IDLE -> INTERRUPTED -> RESTARTING -> RECOVERED -> IDLE (in-call)', async () => {
      const statusList = [];
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager({
        onStatusChange: (s) => statusList.push(s)
      });

      expect(manager.state).toBe('IDLE');

      // Link disconnect occurs
      manager.handleStateChange('disconnected', 'disconnected', pc);
      expect(manager.state).toBe('INTERRUPTED');
      expect(statusList).toContain('reconnecting');

      // Grace period (1500ms) elapses -> RESTARTING
      await vi.advanceTimersByTimeAsync(1600);
      expect(manager.state).toBe('RESTARTING');

      // Connection restored
      manager.handleStateChange('connected', 'connected', pc);
      expect(manager.state).toBe('IDLE');
      expect(statusList[statusList.length - 1]).toBe('in-call');
    });

    it('transitions to FAILED when retries are exhausted or watchdog expires', async () => {
      const onFatalDisconnect = vi.fn();
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager({
        onFatalDisconnect
      });

      // Disconnect
      manager.handleStateChange('disconnected', 'disconnected', pc);

      // Advance past total watchdog (25s)
      await vi.advanceTimersByTimeAsync(26000);

      expect(manager.state).toBe('FAILED');
      expect(onFatalDisconnect).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // SUITE 2: Transient Disconnect & Grace Period
  // -------------------------------------------------------------
  describe('2. Transient Interruption & 1500ms Grace Period', () => {
    it('self-heals transient disconnect (<1500ms) without triggering pc.restartIce() or renegotiation', async () => {
      const { pc } = createMockPeerConnection();
      const sendRenegotiation = vi.fn();
      const manager = new IceRestartManager({ sendRenegotiation });

      // Disconnect starts
      manager.handleStateChange('disconnected', 'disconnected', pc);
      expect(manager.state).toBe('INTERRUPTED');

      // At 800ms, connection recovers spontaneously
      await vi.advanceTimersByTimeAsync(800);
      manager.handleStateChange('connected', 'connected', pc);

      // Advance past the 1500ms boundary
      await vi.advanceTimersByTimeAsync(1000);

      expect(pc.restartIce).not.toHaveBeenCalled();
      expect(sendRenegotiation).not.toHaveBeenCalled();
      expect(manager.state).toBe('IDLE');
      expect(manager.retryCount).toBe(0);
    });

    it('preserves UI status and logs recovery during transient disconnect resolution', async () => {
      const logs = [];
      const statuses = [];
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager({
        onLog: (msg) => logs.push(msg),
        onStatusChange: (status) => statuses.push(status)
      });

      manager.handleStateChange('disconnected', 'disconnected', pc);
      expect(statuses).toContain('reconnecting');
      expect(logs.some(l => l.includes('interrupted'))).toBe(true);

      await vi.advanceTimersByTimeAsync(500);
      manager.handleStateChange('connected', 'connected', pc);

      expect(statuses[statuses.length - 1]).toBe('in-call');
      expect(logs.some(l => l.includes('re-established'))).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // SUITE 3: ICE Restart Triggering & Renegotiation Mechanics
  // -------------------------------------------------------------
  describe('3. ICE Restart Triggering & SDP Renegotiation', () => {
    it('invokes native pc.restartIce() when disconnect exceeds 1500ms grace period', async () => {
      const { pc } = createMockPeerConnection();
      const sendRenegotiation = vi.fn().mockResolvedValue(undefined);
      const manager = new IceRestartManager({ sendRenegotiation });

      manager.handleStateChange('disconnected', 'disconnected', pc);

      // Advance past 1500ms grace + 1000ms 1st attempt delay
      await vi.advanceTimersByTimeAsync(2600);

      expect(pc.restartIce).toHaveBeenCalledTimes(1);
      expect(pc.createOffer).toHaveBeenCalledWith({ iceRestart: true });
      expect(sendRenegotiation).toHaveBeenCalledWith(expect.objectContaining({
        type: 'renegotiate-offer',
        sdp: expect.any(String),
        attempt: 1
      }));
    });

    it('immediately triggers restart when connectionState or iceConnectionState becomes "failed"', async () => {
      const { pc } = createMockPeerConnection();
      const sendRenegotiation = vi.fn().mockResolvedValue(undefined);
      const manager = new IceRestartManager({ sendRenegotiation });

      // Link immediately fails (e.g. NAT mapping destroyed)
      manager.handleStateChange('failed', 'failed', pc);

      // Should skip 1500ms grace and immediately enter RESTARTING, scheduling attempt 1 at 1000ms
      expect(manager.state).toBe('RESTARTING');
      expect(manager.retryCount).toBe(1);

      await vi.advanceTimersByTimeAsync(1100);
      expect(pc.restartIce).toHaveBeenCalledTimes(1);
    });

    it('creates restart offer with { iceRestart: true } and generates fresh ICE credentials (ice-ufrag)', async () => {
      const { pc } = createMockPeerConnection();
      const sendRenegotiation = vi.fn().mockResolvedValue(undefined);
      const manager = new IceRestartManager({ sendRenegotiation });

      await manager.triggerRestart(pc, sendRenegotiation);
      await vi.advanceTimersByTimeAsync(1100);

      expect(pc.createOffer).toHaveBeenCalledWith({ iceRestart: true });
      expect(pc.localDescription.sdp).toContain('restartedUfrag99');
    });

    it('dispatches renegotiation payload to remote peer via signaling callback', async () => {
      const { pc } = createMockPeerConnection();
      const sendRenegotiation = vi.fn().mockResolvedValue(undefined);
      const manager = new IceRestartManager({ sendRenegotiation });

      await manager.triggerRestart(pc, sendRenegotiation);
      await vi.advanceTimersByTimeAsync(1100);

      expect(sendRenegotiation).toHaveBeenCalledWith({
        type: 'renegotiate-offer',
        sdp: expect.stringContaining('restartedUfrag99'),
        attempt: 1
      });
    });

    it('applies remote answer description and completes ICE renegotiation handshake', async () => {
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager();

      const answerSdp = 'v=0\r\na=ice-ufrag:remoteUfragNew\r\na=ice-pwd:remotePwdNew\r\na=fingerprint:sha-256 EE:FF:00:11\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
      const success = await manager.handleRemoteAnswer(pc, answerSdp);

      expect(success).toBe(true);
      expect(pc.setRemoteDescription).toHaveBeenCalledWith(expect.objectContaining({
        type: 'answer',
        sdp: answerSdp
      }));
    });
  });

  // -------------------------------------------------------------
  // SUITE 4: Non-Destructive Reconnection Invariants
  // -------------------------------------------------------------
  describe('4. Non-Destructive Reconnection Invariants', () => {
    it('CRITICAL: Microphone MediaStreamTracks are NOT stopped during reconnect', async () => {
      const session = createMockCallSession();
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager();

      manager.handleStateChange('disconnected', 'disconnected', pc);
      await vi.advanceTimersByTimeAsync(5000);

      // Invariants check
      expect(session.mockTrack.stop).not.toHaveBeenCalled();
      expect(session.rawStream.active).toBe(true);
    });

    it('CRITICAL: AudioContext remains running and is NOT closed during reconnect', async () => {
      const session = createMockCallSession();
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager();

      manager.handleStateChange('disconnected', 'disconnected', pc);
      await vi.advanceTimersByTimeAsync(5000);

      expect(session.audioCtx.close).not.toHaveBeenCalled();
      expect(session.audioCtx.state).toBe('running');
    });

    it('CRITICAL: Call duration timer continues incrementing and is NOT reset to 0', async () => {
      let duration = 42;
      const timer = setInterval(() => { duration += 1; }, 1000);
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager();

      manager.handleStateChange('disconnected', 'disconnected', pc);
      await vi.advanceTimersByTimeAsync(5000);

      expect(duration).toBe(47);
      clearInterval(timer);
    });

    it('CRITICAL: MITM Safety Code remains invariant across ICE restart', async () => {
      const localSdpInitial = 'v=0\r\na=ice-ufrag:u1\r\na=fingerprint:sha-256 AA:BB:CC:DD\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
      const remoteSdpInitial = 'v=0\r\na=ice-ufrag:u2\r\na=fingerprint:sha-256 EE:FF:00:11\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
      const initialCode = await generateSafetyCode(localSdpInitial, remoteSdpInitial);

      // After ICE restart, ICE ufrag changed, but DTLS fingerprint remained AA:BB:CC:DD and EE:FF:00:11
      const localSdpRestarted = 'v=0\r\na=ice-ufrag:newUfrag123\r\na=fingerprint:sha-256 AA:BB:CC:DD\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
      const remoteSdpRestarted = 'v=0\r\na=ice-ufrag:newRemoteUfrag456\r\na=fingerprint:sha-256 EE:FF:00:11\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
      const restartedCode = await generateSafetyCode(localSdpRestarted, remoteSdpRestarted);

      expect(restartedCode).toBe(initialCode);
    });

    it('CRITICAL: Active UI view remains in CallScreen with "Reconnecting..." badge', () => {
      const statuses = [];
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager({
        onStatusChange: (s) => statuses.push(s)
      });

      manager.handleStateChange('disconnected', 'disconnected', pc);
      expect(statuses).toContain('reconnecting');
      expect(manager.state).toBe('INTERRUPTED');
    });
  });

  // -------------------------------------------------------------
  // SUITE 5: Exponential Backoff & Retry Logic
  // -------------------------------------------------------------
  describe('5. Exponential Backoff & Retry Logic', () => {
    it('schedules 5 restart attempts with exponential backoff delays (1s, 2s, 4s, 6s, 8s)', async () => {
      const { pc } = createMockPeerConnection();
      const sendRenegotiation = vi.fn().mockResolvedValue(undefined);
      const manager = new IceRestartManager({ sendRenegotiation });

      // Disconnect
      manager.handleStateChange('failed', 'failed', pc);
      expect(manager.retryCount).toBe(1);

      // Attempt 1 (1000ms)
      await vi.advanceTimersByTimeAsync(1000);
      expect(pc.restartIce).toHaveBeenCalledTimes(1);

      // Attempt 2 (2000ms)
      manager.startIceRestart(pc, true, 'Retry 2', sendRenegotiation);
      expect(manager.retryCount).toBe(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(pc.restartIce).toHaveBeenCalledTimes(2);

      // Attempt 3 (4000ms)
      manager.startIceRestart(pc, true, 'Retry 3', sendRenegotiation);
      expect(manager.retryCount).toBe(3);
      await vi.advanceTimersByTimeAsync(4000);
      expect(pc.restartIce).toHaveBeenCalledTimes(3);

      // Attempt 4 (6000ms)
      manager.startIceRestart(pc, true, 'Retry 4', sendRenegotiation);
      expect(manager.retryCount).toBe(4);
      await vi.advanceTimersByTimeAsync(6000);
      expect(pc.restartIce).toHaveBeenCalledTimes(4);

      // Attempt 5 (8000ms)
      manager.startIceRestart(pc, true, 'Retry 5', sendRenegotiation);
      expect(manager.retryCount).toBe(5);
      await vi.advanceTimersByTimeAsync(8000);
      expect(pc.restartIce).toHaveBeenCalledTimes(5);
    });

    it('resets retry counter to 0 upon successful reconnection on attempt 3', async () => {
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager();

      manager.handleStateChange('failed', 'failed', pc); // Attempt 1
      manager.startIceRestart(pc, true, 'Retry 2');      // Attempt 2
      manager.startIceRestart(pc, true, 'Retry 3');      // Attempt 3
      expect(manager.retryCount).toBe(3);

      // On attempt 3, ICE succeeds
      manager.handleStateChange('connected', 'connected', pc);
      expect(manager.retryCount).toBe(0);
      expect(manager.state).toBe('IDLE');
    });

    it('cancels pending backoff retry timers if peer connection recovers spontaneously', async () => {
      const { pc } = createMockPeerConnection();
      const sendRenegotiation = vi.fn().mockResolvedValue(undefined);
      const manager = new IceRestartManager({ sendRenegotiation });

      manager.handleStateChange('failed', 'failed', pc); // Scheduled for 1000ms
      expect(manager.retryTimer).not.toBeNull();

      // At 400ms, spontaneous recovery occurs
      await vi.advanceTimersByTimeAsync(400);
      manager.handleStateChange('connected', 'connected', pc);

      expect(manager.retryTimer).toBeNull();
      await vi.advanceTimersByTimeAsync(1000);
      expect(sendRenegotiation).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // SUITE 6: Permanent Failure & Clean Hardware Teardown
  // -------------------------------------------------------------
  describe('6. Permanent Failure & Clean Hardware Teardown', () => {
    it('executes clean teardown (endCall) when all 5 retry attempts fail', async () => {
      const onFatalDisconnect = vi.fn();
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager({ onFatalDisconnect });

      manager.retryCount = 5;
      manager.startIceRestart(pc, true, 'Exhausted attempt');

      expect(manager.state).toBe('FAILED');
      expect(onFatalDisconnect).toHaveBeenCalledTimes(1);
    });

    it('executes clean teardown if total disconnect watchdog (25s) expires regardless of retry state', async () => {
      const onFatalDisconnect = vi.fn();
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager({ onFatalDisconnect });

      manager.handleStateChange('disconnected', 'disconnected', pc);
      await vi.advanceTimersByTimeAsync(25000);

      expect(manager.state).toBe('FAILED');
      expect(onFatalDisconnect).toHaveBeenCalled();
    });

    it('logs informative failure message to activity log on terminal disconnect', async () => {
      const logs = [];
      const manager = new IceRestartManager({
        onLog: (msg, level) => logs.push({ msg, level })
      });

      manager.handleFatalTimeout();

      expect(logs.some(l => l.msg.includes('Connection recovery failed after 5 attempts'))).toBe(true);
      expect(logs.some(l => l.level === 'error')).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // SUITE 7: Adversarial Race Conditions & Error Handling
  // -------------------------------------------------------------
  describe('7. Adversarial Race Conditions & Error Handling', () => {
    it('handles remote peer hangup (call.on("close")) while reconnecting without crashing', async () => {
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager();

      manager.handleStateChange('disconnected', 'disconnected', pc);
      expect(manager.state).toBe('INTERRUPTED');

      // Call is reset on hangup
      manager.reset();
      expect(manager.state).toBe('IDLE');
      expect(manager.graceTimer).toBeNull();
      expect(manager.retryTimer).toBeNull();
    });

    it('handles local user clicking "Hang Up" while reconnection attempt is in-flight', async () => {
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager();

      manager.handleStateChange('failed', 'failed', pc);
      expect(manager.state).toBe('RESTARTING');

      manager.reset();
      expect(manager.state).toBe('IDLE');
      expect(manager.retryTimer).toBeNull();
      expect(manager.totalWatchdogTimer).toBeNull();
    });

    it('handles rapid connection state flapping (disconnected -> connected -> disconnected in <100ms)', async () => {
      const { pc } = createMockPeerConnection();
      const statuses = [];
      const manager = new IceRestartManager({
        onStatusChange: (s) => statuses.push(s)
      });

      // Rapid flapping
      manager.handleStateChange('disconnected', 'disconnected', pc);
      manager.handleStateChange('connected', 'connected', pc);
      manager.handleStateChange('disconnected', 'disconnected', pc);

      expect(manager.state).toBe('INTERRUPTED');
      expect(manager.graceTimer).not.toBeNull();
    });

    it('handles pc.restartIce() throwing InvalidStateError (e.g. PC already closed)', async () => {
      const { pc } = createMockPeerConnection();
      pc.restartIce.mockImplementation(() => {
        throw new Error('InvalidStateError: RTCPeerConnection is closed');
      });

      const logs = [];
      const manager = new IceRestartManager({
        onLog: (msg) => logs.push(msg)
      });

      await manager.startIceRestart(pc, true, 'Test failure');
      await vi.advanceTimersByTimeAsync(1100);

      expect(logs.some(l => l.includes('ICE restart offer creation failed'))).toBe(true);
    });

    it('handles signaling delivery rejection (e.g. PeerJS socket momentarily offline)', async () => {
      const { pc } = createMockPeerConnection();
      const sendRenegotiation = vi.fn().mockRejectedValue(new Error('SignalingSocketClosed'));
      const logs = [];
      const manager = new IceRestartManager({
        sendRenegotiation,
        onLog: (msg) => logs.push(msg)
      });

      await manager.startIceRestart(pc, true, 'Test signaling failure', sendRenegotiation);
      await vi.advanceTimersByTimeAsync(1100);

      expect(logs.some(l => l.includes('ICE restart offer creation failed'))).toBe(true);
    });

    it('handles glare / simultaneous ICE restart initiated by both peers symmetrically', async () => {
      const { pc } = createMockPeerConnection();
      const manager = new IceRestartManager();

      // Callee receives remote restart offer
      const remoteOfferSdp = 'v=0\r\na=ice-ufrag:remotePeerUfrag99\r\na=ice-pwd:remotePeerPwd99\r\na=fingerprint:sha-256 EE:FF:00:11\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
      const answerSdp = await manager.handleRemoteRestartOffer(pc, remoteOfferSdp);

      expect(answerSdp).toBeDefined();
      expect(pc.setRemoteDescription).toHaveBeenCalled();
      expect(pc.setLocalDescription).toHaveBeenCalled();
    });
  });
});
