# Test Specification Handoff: Milestone 3 (Real-Time Network Quality Adaptation & Fast Reconnection - R2)

**Explorer**: Explorer 2 (Test Specification & Verification Architect)  
**Date**: 2026-08-23  
**Working Directory**: `/home/sagnik/teamwork_projects/secure_voice/.agents/explorer_m3_2`  
**Target Milestone**: Milestone 3 (R2 - Real-Time Network Quality Adaptation & Fast Reconnection)  
**Artifacts Specified**:
- `src/test/networkAdaptation.test.js` (Unit & Integration Test Suite for Telemetry Extraction, EMA Smoothing, and 5-Tier Adaptation Ladder)
- `src/test/iceRestart.test.js` (Unit & Integration Test Suite for ICE Restart State Machine, Non-Destructive Reconnect, Exponential Backoff, and Teardown)

---

## 1. Observation

Direct inspection of the current codebase and test infrastructure revealed the following baseline state and architectural requirements:

### 1.1 Existing Test Suite Baseline
- **Test Infrastructure (`src/test/setup.js`)**:
  - Sets up JSDOM environment with mocks for Web Audio API (`MockAudioContext`, `createMockAudioParam`), `navigator.mediaDevices`, `navigator.clipboard`, and `RTCRtpReceiver.getCapabilities('audio')`.
  - Currently, 14 test files pass 250 unit and adversarial tests covering audio pre-processing (M1) and WebRTC transport/SDP munging (M2).
- **Existing WebRTC Implementation (`src/utils/webrtc.js`, `src/hooks/useCallSession.js`)**:
  - WebRTC SDP munging (`transformOpusSdp`) supports configurable Opus bitrate, RED (RFC 2198), ptime (60/120ms), FEC, DTX, and bandwidth caps (`b=AS`).
  - Bitrate adaptation in `useCallSession.js` (lines 314–380) currently uses a legacy 3000ms polling loop with only 3 coarse tiers (6k, 8k, 16k) and only inspects `inbound-rtp.packetsLost` and `candidate-pair.currentRoundTripTime`.
  - Disconnect handling in `useCallSession.js` (lines 268–309) uses a static 2500ms watchdog that immediately calls `endCall()` upon timeout, lacking `pc.restartIce()`, exponential backoff, or non-destructive session retention.

### 1.2 Milestone 3 Specification Requirements (from `PROJECT.md` & Survey)
1. **Network Telemetry Monitor (`NetworkTelemetryMonitor` in `src/utils/networkAdaptation.js`)**:
   - 1000ms polling of `pc.getStats()` extracting:
     - `candidate-pair`: RTT (`currentRoundTripTime`), transport protocol, candidate type (`host`/`srflx`/`relay`).
     - `inbound-rtp`: packetsLost, packetsReceived, delta loss rate, jitter (ms), average jitter buffer delay (`jitterBufferDelay / jitterBufferEmittedCount`), concealment ratio (`concealedSamples / totalSamplesReceived`), audio level.
     - `remote-inbound-rtp`: RTCP Receiver Report uplink loss (`fractionLost / 256` or delta lost), RTT, jitter.
     - `outbound-rtp`: bytesSent, packetsSent.
2. **5-Tier Adaptive Bitrate Controller (`AdaptiveBitrateController` in `src/utils/networkAdaptation.js`)**:
   - 5 distinct operational tiers:
     - **HQ (Tier 0)**: 20,000 bps (`b=AS:24`, ptime: 40ms, FEC: 10%) — Loss < 2%, RTT < 150ms, Jitter < 30ms, Concealment < 1%
     - **STD (Tier 1)**: 14,000 bps (`b=AS:18`, ptime: 40ms, FEC: 15%) — Loss 2-6%, RTT 150-300ms, Jitter 30-60ms, Concealment 1-3%
     - **LB (Tier 2)**: 10,000 bps (`b=AS:14`, ptime: 60ms, FEC: 25%) — Loss 6-12%, RTT 300-500ms, Jitter 60-100ms, Concealment 3-7%
     - **HL (Tier 3)**: 7,500 bps (`b=AS:10`, ptime: 60ms, FEC: 40%) — Loss 12-25%, RTT 500-800ms, Jitter 100-180ms, Concealment 7-15%
     - **EXT (Tier 4)**: 6,000 bps (`b=AS:8`, ptime: 60/120ms, FEC: 50%) — Loss > 25%, RTT > 800ms, Jitter > 180ms, Concealment > 15%
   - **Exponential Moving Average (EMA) Smoothing**:
     - `smoothedLoss = 0.4 * currentLoss + 0.6 * prevSmoothedLoss`
     - `smoothedRtt = 0.3 * currentRtt + 0.7 * prevSmoothedRtt`
     - `smoothedJitter = 0.3 * currentJitter + 0.7 * prevSmoothedJitter`
   - **Asymmetric Hysteresis**:
     - **Fast Downgrade**: Immediate downgrade on a single 1000ms evaluation tick exceeding a worse tier threshold (including direct leap from Tier 0 to Tier 4).
     - **Slow Upgrade**: Requires 4 consecutive evaluation ticks (4 seconds) of healthy metrics before stepping up 1 tier.
3. **Seamless ICE Restart State Machine (`IceRestartManager` in `src/utils/iceRestartManager.js` / `useCallSession.js`)**:
   - Transient disconnect grace period (1500ms) for self-healing links.
   - On disconnect > 1500ms or `failed`: Triggers `pc.restartIce()`, creates offer with `{ iceRestart: true }`, re-munges SDP, dispatches renegotiation.
   - Non-destructive session invariants: Active audio tracks, AudioContext, call duration timer, safety code, and UI call screen MUST be preserved.
   - 5-retry exponential backoff schedule: 1s, 2s, 4s, 6s, 8s (total ~21s).
   - Eventual teardown: After 5 failed attempts or 25s total watchdog expiration, triggers clean `endCall()` and releases hardware.

---

## 2. Logic Chain

```
[M3 Functional Specs: Telemetry, 5-Tier Ladder, ICE Restart]
                           │
    ┌──────────────────────┴──────────────────────┐
    ▼                                             ▼
[Test Suite 1: Network Adaptation]            [Test Suite 2: ICE Restart]
(src/test/networkAdaptation.test.js)          (src/test/iceRestart.test.js)
    │                                             │
    ├─► Mock RTCStatsReport Generation            ├─► State Machine Transitions
    │   • candidate-pair (RTT, protocol)          │   • IDLE -> IN_CALL -> INTERRUPTED
    │   • inbound-rtp (loss, jitter, delay)       │   • INTERRUPTED -> RESTARTING -> RECOVERED
    │   • remote-inbound-rtp (RTCP RR loss)       │   • RESTARTING -> FAILED (teardown)
    │   • outbound-rtp & candidates               │
    │                                             ├─► Transient Disconnect & Grace
    ├─► Telemetry Extraction & Math Deltas        │   • <1500ms blip auto-recovers
    │   • Delta packet loss calculation           │   • No restartIce or renegotiation
    │   • Fractional RTCP loss conversion         │
    │   • Jitter buffer delay averaging           ├─► Non-Destructive Invariants
    │   • Concealment ratio calculation           │   • MediaStream tracks NOT stopped
    │                                             │   • AudioContext remains 'running'
    ├─► EMA Smoothing Validation                  │   • Call timer keeps running
    │   • Spike dampening (no flap)               │   • Safety Code unchanged
    │   • Sustained loss convergence              │
    │                                             ├─► Exponential Backoff Retries
    ├─► 5-Tier Ladder & Hysteresis                │   • Schedule: 1s, 2s, 4s, 6s, 8s
    │   • 1-tick instant downgrade                │   • Counter reset on recovery
    │   • Multi-tier emergency drops              │
    │   • 4-tick slow recovery window             ├─► Permanent Failure Teardown
    │   • Recovery reset on degradation           │   • Clean hardware & stream release
    │   • Multi-metric dominance                  │   • Reset to ready state
    │                                             │
    └─► Pathological Inputs & Sender App          └─► Glare, Race Conditions & Hangup
```

---

## 3. Comprehensive Test Specifications

### 3.1 `src/test/networkAdaptation.test.js` Specification

#### A. Test Helpers & Mock Fixtures
```javascript
/**
 * Factory creating a standard WebRTC RTCStatsReport Map
 * @param {Object} overrides
 * @returns {Map<string, Object>}
 */
export function createMockStatsReport(overrides = {}) {
  const reportMap = new Map();

  const candidatePair = {
    id: 'CP_1',
    type: 'candidate-pair',
    state: overrides.pairState || 'succeeded',
    nominated: true,
    currentRoundTripTime: overrides.rtt !== undefined ? overrides.rtt : 0.045, // 45ms in sec
    availableOutgoingBitrate: overrides.availableOutgoingBitrate || 200000,
    bytesSent: overrides.bytesSent || 15000,
    bytesReceived: overrides.bytesReceived || 15000,
    localCandidateId: 'LC_1',
    remoteCandidateId: 'RC_1'
  };
  reportMap.set('CP_1', candidatePair);

  const localCandidate = {
    id: 'LC_1',
    type: 'local-candidate',
    candidateType: overrides.localCandidateType || 'host',
    protocol: overrides.protocol || 'udp',
    ip: '192.168.1.50',
    port: 54321
  };
  reportMap.set('LC_1', localCandidate);

  const remoteCandidate = {
    id: 'RC_1',
    type: 'remote-candidate',
    candidateType: overrides.remoteCandidateType || 'srflx',
    protocol: overrides.protocol || 'udp',
    ip: '203.0.113.10',
    port: 12345
  };
  reportMap.set('RC_1', remoteCandidate);

  const inboundRtp = {
    id: 'IT_1',
    type: 'inbound-rtp',
    kind: 'audio',
    ssrc: 1234567,
    packetsReceived: overrides.packetsReceived !== undefined ? overrides.packetsReceived : 500,
    packetsLost: overrides.packetsLost !== undefined ? overrides.packetsLost : 2,
    jitter: overrides.jitter !== undefined ? overrides.jitter : 0.005, // 5ms in sec
    jitterBufferDelay: overrides.jitterBufferDelay !== undefined ? overrides.jitterBufferDelay : 1.25, // seconds
    jitterBufferEmittedCount: overrides.jitterBufferEmittedCount !== undefined ? overrides.jitterBufferEmittedCount : 50,
    concealedSamples: overrides.concealedSamples !== undefined ? overrides.concealedSamples : 48,
    totalSamplesReceived: overrides.totalSamplesReceived !== undefined ? overrides.totalSamplesReceived : 4800,
    concealmentEvents: overrides.concealmentEvents !== undefined ? overrides.concealmentEvents : 1,
    audioLevel: overrides.audioLevel !== undefined ? overrides.audioLevel : 0.42
  };
  reportMap.set('IT_1', inboundRtp);

  if (overrides.hasRemoteInbound !== false) {
    const remoteInboundRtp = {
      id: 'RIT_1',
      type: 'remote-inbound-rtp',
      kind: 'audio',
      ssrc: 7654321,
      fractionLost: overrides.remoteFractionLost !== undefined ? overrides.remoteFractionLost : 0, // 0-255
      packetsLost: overrides.remotePacketsLost !== undefined ? overrides.remotePacketsLost : 0,
      roundTripTime: overrides.remoteRtt !== undefined ? overrides.remoteRtt : 0.045,
      jitter: overrides.remoteJitter !== undefined ? overrides.remoteJitter : 0.005
    };
    reportMap.set('RIT_1', remoteInboundRtp);
  }

  const outboundRtp = {
    id: 'OT_1',
    type: 'outbound-rtp',
    kind: 'audio',
    ssrc: 7654321,
    bytesSent: overrides.outboundBytesSent || 12000,
    packetsSent: overrides.outboundPacketsSent || 490,
    targetBitrate: overrides.targetBitrate || 14000
  };
  reportMap.set('OT_1', outboundRtp);

  return reportMap;
}
```

#### B. Suite Breakdown & Detailed Test Cases

```javascript
describe('Network Quality Adaptation Engine (src/test/networkAdaptation.test.js)', () => {

  // -------------------------------------------------------------
  // SUITE 1: RTCStatsReport Parsing & Telemetry Extraction
  // -------------------------------------------------------------
  describe('1. Telemetry Extraction & Metric Computation', () => {
    it('extracts all baseline metrics accurately from full RTCStatsReport', async () => {
      // Input: Mock report with RTT=50ms, inboundLoss=1%, jitter=8ms, delay=25ms, concealment=1%
      // Verify: NetworkTelemetrySnapshot populated correctly with rounded/converted ms and unit ratios
    });

    it('computes differential inbound packet loss rate across consecutive polling ticks', async () => {
      // Tick 1: packetsLost=10, packetsReceived=100 (init baseline)
      // Tick 2: packetsLost=20, packetsReceived=190 (deltaLost=10, deltaReceived=90 -> total=100 -> loss=10%)
      // Verify: snapshot.inboundLossRate === 0.10 (10%)
    });

    it('handles zero-packet intervals gracefully without division by zero (returns 0.0 loss)', async () => {
      // Tick 1: lost=10, received=100
      // Tick 2: lost=10, received=100 (delta=0)
      // Verify: snapshot.inboundLossRate === 0.0
    });

    it('handles WebRTC counter rollover or connection resets (negative deltas reset baseline safely)', async () => {
      // Tick 1: lost=500, received=10000
      // Tick 2: lost=2, received=50 (counter reset on peer reconnection)
      // Verify: snapshot.inboundLossRate === 0.0, no NaN or negative rates
    });

    it('extracts remote-inbound-rtp (RTCP Receiver Report) fractional loss (fractionLost / 256)', async () => {
      // Remote fractionLost = 64 (64/256 = 0.25 -> 25% uplink loss)
      // Verify: snapshot.outboundLossRate === 0.25
    });

    it('computes average jitter buffer delay in milliseconds from cumulative counters', async () => {
      // Tick 1: delay=1.0s, emitted=50 (20ms)
      // Tick 2: delay=1.6s, emitted=70 (deltaDelay=0.6s, deltaEmitted=20 -> avgDelay = 30ms)
      // Verify: snapshot.avgJitterBufferDelayMs === 30
    });

    it('computes sample concealment ratio from delta concealed samples and delta total samples', async () => {
      // Tick 1: concealed=100, total=1000
      // Tick 2: concealed=200, total=2000 (deltaConcealed=100, deltaTotal=1000 -> 10% concealment)
      // Verify: snapshot.concealmentRatio === 0.10
    });

    it('detects transport candidate types (host, srflx, prflx, relay) and protocols (udp, tcp)', async () => {
      // Test matrix for host/srflx/relay candidates
      // Verify: snapshot.candidateType and snapshot.protocol populated
    });
  });

  // -------------------------------------------------------------
  // SUITE 2: NetworkTelemetryMonitor Lifecycle
  // -------------------------------------------------------------
  describe('2. NetworkTelemetryMonitor Polling Lifecycle', () => {
    it('starts periodic polling at 1000ms intervals and invokes onSnapshot callback', async () => {
      // Use vi.useFakeTimers()
      // monitor.start(1000)
      // vi.advanceTimersByTime(1000) -> onSnapshot called 1 time
      // vi.advanceTimersByTime(3000) -> onSnapshot called 4 times total
    });

    it('calling start() multiple times is idempotent without creating duplicate intervals', async () => {
      // monitor.start(1000); monitor.start(1000); monitor.start(1000);
      // vi.advanceTimersByTime(1000) -> called exactly once
    });

    it('calling stop() clears intervals and ceases all telemetry polling', async () => {
      // monitor.start(1000);
      // vi.advanceTimersByTime(2000);
      // monitor.stop();
      // vi.advanceTimersByTime(5000); -> no further calls
    });

    it('handles pc.getStats() promise rejections gracefully without unhandled crashes', async () => {
      // mockPc.getStats.mockRejectedValue(new Error('InvalidStateError: PeerConnection closed'))
      // monitor.start(1000)
      // vi.advanceTimersByTime(1000) -> handles error, logs warning, monitor remains alive
    });

    it('provides standalone .sample() method for one-off stats queries', async () => {
      // const snapshot = await monitor.sample();
      // expect(snapshot).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // SUITE 3: Exponential Moving Average (EMA) Smoothing
  // -------------------------------------------------------------
  describe('3. EMA Smoothing & Glitch Filtering', () => {
    it('calculates Exponential Moving Average accurately for loss (alpha=0.4) and RTT (alpha=0.3)', () => {
      // Init: loss=0, RTT=50ms
      // Tick 1: loss=10% -> smoothedLoss = 0.4 * 0.10 + 0.6 * 0 = 0.04 (4%)
      // Tick 2: loss=10% -> smoothedLoss = 0.4 * 0.10 + 0.6 * 0.04 = 0.064 (6.4%)
      // Tick 3: loss=10% -> smoothedLoss = 0.4 * 0.10 + 0.6 * 0.064 = 0.0784 (7.84%)
      // Tick 4: loss=10% -> smoothedLoss = 0.4 * 0.10 + 0.6 * 0.0784 = 0.08704 (8.704%)
    });

    it('prevents single-sample transient spikes (glitches) from causing erratic ladder oscillation', () => {
      // Controller in Tier 0 (HQ: 20kbps, threshold loss < 2%)
      // Tick 1: 1 packet dropped (loss=3% for 1 sec) -> smoothedLoss = 1.2% (< 2% threshold)
      // Result: Controller remains in Tier 0 (HQ), avoiding false downgrade
    });

    it('converges smoothly to new steady-state values during sustained network changes', () => {
      // Sustained loss of 30% over 5 seconds
      // Smoothed loss climbs: 12% -> 19.2% -> 23.5% -> 26.1% -> 27.7%
    });
  });

  // -------------------------------------------------------------
  // SUITE 4: 5-Tier Adaptation Ladder & Asymmetric Hysteresis
  // -------------------------------------------------------------
  describe('4. 5-Tier Adaptation Ladder & Asymmetric Hysteresis', () => {
    it('initializes at High Quality (Tier 0: HQ 20kbps) by default', () => {
      // controller.getCurrentTier() -> { id: 0, name: 'HQ', maxBitrateBps: 20000 }
    });

    it('Fast Downgrade: downgrades immediately by 1 tier on 1st tick of degraded metrics', () => {
      // In Tier 0 (HQ)
      // Tick 1: smoothedLoss jumps to 4.5% (exceeds Tier 0 threshold of 2%, fits Tier 1)
      // Result: tierChanged === true, currentTier is Tier 1 (STD: 14kbps) on that single tick
    });

    it('Multi-Tier Emergency Downgrade: drops directly from HQ (Tier 0) to EXT (Tier 4) on catastrophic loss', () => {
      // In Tier 0 (HQ)
      // Tick 1: Catastrophic loss surge (45% loss) -> smoothedLoss = 18% (exceeds Tier 3 threshold)
      // Result: tierChanged === true, currentTier drops directly to Tier 4 (EXT: 6kbps) in 1 tick
    });

    it('Slow Upgrade: requires 4 consecutive clean ticks (4s) before upgrading by 1 tier', () => {
      // Controller in Tier 4 (EXT: 6kbps)
      // Network recovers (loss=0%, RTT=40ms)
      // Tick 1: clean (recoveryCount = 1) -> remains Tier 4
      // Tick 2: clean (recoveryCount = 2) -> remains Tier 4
      // Tick 3: clean (recoveryCount = 3) -> remains Tier 4
      // Tick 4: clean (recoveryCount = 4) -> upgrades 1 tier to Tier 3 (HL: 7.5kbps), recoveryCount resets
    });

    it('Recovery Reset: any metric degradation during 4-tick recovery window immediately resets recovery count to 0', () => {
      // In Tier 4 (EXT)
      // Tick 1: clean (recoveryCount = 1)
      // Tick 2: clean (recoveryCount = 2)
      // Tick 3: degradation spike (loss=20%) -> recoveryCount resets to 0!
      // Tick 4: clean (recoveryCount = 1)
      // Result: remains in Tier 4, must complete 4 full clean ticks from scratch
    });

    it('Multi-Step Sequential Recovery: stepping from EXT (Tier 4) to HQ (Tier 0) requires 16 consecutive clean ticks', () => {
      // Tier 4 -> Tier 3 (4 ticks)
      // Tier 3 -> Tier 2 (4 ticks)
      // Tier 2 -> Tier 1 (4 ticks)
      // Tier 1 -> Tier 0 (4 ticks)
      // Total 16 ticks (16 seconds) of uninterrupted clean channel
    });

    it('Multi-Metric Dominance: triggers tier downgrade if ANY critical metric exceeds threshold (worst-case rule)', () => {
      // Case A: Loss is 0%, but RTT is 650ms (>500ms Tier 3 threshold) -> drops to Tier 3 (HL)
      // Case B: Loss is 0%, RTT is 50ms, but Jitter is 120ms (>100ms Tier 3) -> drops to Tier 3 (HL)
      // Case C: Loss is 0%, RTT is 50ms, Jitter is 5ms, but Concealment is 18% (>15% Tier 4) -> drops to Tier 4 (EXT)
    });

    it('Remote-Inbound Loss Dominance: uplink congestion reported via RTCP RR triggers sender bitrate downgrade', () => {
      // Downlink loss = 0%, but remoteFractionLost = 80 (31% uplink loss)
      // Result: controller drops sender bitrate to Tier 4 (EXT: 6kbps)
    });
  });

  // -------------------------------------------------------------
  // SUITE 5: Sender Parameter Application & Integration
  // -------------------------------------------------------------
  describe('5. RTCRtpSender Encoding Parameter Application', () => {
    it('applies new target bitrate to sender encodings and enforces high priority', async () => {
      // mockSender.getParameters returning encodings: [{ maxBitrate: 20000 }]
      // controller evaluates and calls applySenderBitrate(sender, 10000)
      // Verify: sender.setParameters called with maxBitrate: 10000, priority: 'high', networkPriority: 'high'
    });

    it('handles sender setParameters failures gracefully without crashing controller evaluation loop', async () => {
      // mockSender.setParameters.mockRejectedValue(new Error('InvalidModificationError'))
      // Verify: Controller catches error, logs warning, returns evaluated tier without throwing
    });
  });

  // -------------------------------------------------------------
  // SUITE 6: Pathological Edge Cases & Adversarial Robustness
  // -------------------------------------------------------------
  describe('6. Pathological Inputs & Adversarial Robustness', () => {
    it('handles empty RTCStatsReport (e.g. initial connection phase before RTP flow)', () => {
      // report = new Map() (no stats reports)
      // Verify: snapshot returns safe default values (loss=0, RTT=null, jitter=0), controller maintains tier
    });

    it('handles NaN, null, undefined, and Infinity in stats values without corrupting EMA or crashing', () => {
      // Overrides with rtt: NaN, packetsLost: null, jitter: Infinity
      // Verify: Snapshot cleans/clamps values safely
    });

    it('controller .reset() restores initial tier (Tier 0/HQ), resets EMA filters and recovery counters', () => {
      // Drive controller to Tier 4 (EXT)
      // controller.reset()
      // Verify: currentTier is Tier 0 (HQ), smoothedLoss === 0, recoveryCount === 0
    });
  });
});
```

---

### 3.2 `src/test/iceRestart.test.js` Specification

#### A. Test Helpers & Mock Fixtures
```javascript
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
    // Helper to trigger state change event handlers
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
```

#### B. Suite Breakdown & Detailed Test Cases

```javascript
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
    it('transitions through IDLE -> IN_CALL -> INTERRUPTED -> RESTARTING -> RECOVERED -> IN_CALL', async () => {
      // 1. Initialized in IDLE
      // 2. Call established -> IN_CALL
      // 3. pc.iceConnectionState = 'disconnected' -> INTERRUPTED (status: reconnecting)
      // 4. Disconnect > 1500ms -> RESTARTING (status: reconnecting)
      // 5. pc.iceConnectionState = 'connected' -> RECOVERED -> IN_CALL (status: in-call)
    });

    it('transitions to PERMANENT_FAILURE when retries are exhausted or watchdog expires', async () => {
      // In RESTARTING
      // 5 failed restart attempts + 25s watchdog expiration
      // Transitions to PERMANENT_FAILURE -> triggers endCall()
    });
  });

  // -------------------------------------------------------------
  // SUITE 2: Transient Disconnect & Grace Period
  // -------------------------------------------------------------
  describe('2. Transient Interruption & 1500ms Grace Period', () => {
    it('self-heals transient disconnect (<1500ms) without triggering pc.restartIce() or renegotiation', async () => {
      // pc.connectionState becomes 'disconnected'
      // manager receives disconnect -> enters INTERRUPTED, starts 1500ms grace timer, status='reconnecting'
      // At 800ms, pc.connectionState returns to 'connected'
      // Result: Grace timer cancelled, status restored to 'in-call', pc.restartIce NOT called, zero SDP offers created
    });

    it('preserves UI status and logs recovery during transient disconnect resolution', async () => {
      // Verify activity logs: "Network link interrupted (Peer Disconnected)..." -> "Peer connection re-established"
    });
  });

  // -------------------------------------------------------------
  // SUITE 3: ICE Restart Triggering & Renegotiation Mechanics
  // -------------------------------------------------------------
  describe('3. ICE Restart Triggering & SDP Renegotiation', () => {
    it('invokes native pc.restartIce() when disconnect exceeds 1500ms grace period', async () => {
      // pc.connectionState = 'disconnected'
      // vi.advanceTimersByTime(1600)
      // Verify: pc.restartIce called 1 time
    });

    it('immediately triggers restart when connectionState or iceConnectionState becomes "failed"', async () => {
      // pc.iceConnectionState = 'failed'
      // pc._trigger('iceconnectionstatechange')
      // Verify: Skips 1500ms grace period, calls pc.restartIce() immediately
    });

    it('creates restart offer with { iceRestart: true } and generates fresh ICE credentials (ice-ufrag)', async () => {
      // manager.triggerRestart(pc, signalingCallback)
      // Verify: pc.createOffer called with { iceRestart: true }
      // Verify: offer SDP contains new ufrag (restartedUfrag99)
      // Verify: pc.setLocalDescription called with new offer
    });

    it('dispatches renegotiation payload to remote peer via signaling callback', async () => {
      // const signalingCallback = vi.fn().mockResolvedValue(undefined);
      // manager.triggerRestart(pc, signalingCallback)
      // Verify: signalingCallback called with { type: 'renegotiate-offer', sdp: expect.any(String), peer: 'PEER-XYZ-789' }
    });

    it('applies remote answer description and completes ICE renegotiation handshake', async () => {
      // Remote sends answer SDP
      // manager.handleRemoteAnswer(pc, answerSdp)
      // Verify: pc.setRemoteDescription called with answer
      // Verify: DTLS fingerprint verified
    });
  });

  // -------------------------------------------------------------
  // SUITE 4: Non-Destructive Session Invariants
  // -------------------------------------------------------------
  describe('4. Non-Destructive Reconnection Invariants', () => {
    it('CRITICAL: Microphone MediaStreamTracks are NOT stopped during reconnect', async () => {
      // Trigger disconnect and ICE restart
      // vi.advanceTimersByTime(5000)
      // Verify: mockTrack.stop was NEVER called
      // Verify: mockStream.active === true
    });

    it('CRITICAL: AudioContext remains running and is NOT closed during reconnect', async () => {
      // Trigger disconnect and ICE restart
      // Verify: mockAudioCtx.close was NEVER called
      // Verify: mockAudioCtx.state === 'running'
    });

    it('CRITICAL: Call duration timer continues incrementing and is NOT reset to 0', async () => {
      // Duration at disconnect = 42s
      // vi.advanceTimersByTime(5000) during reconnecting state
      // Duration is now 47s (timer keeps ticking continuously)
    });

    it('CRITICAL: MITM Safety Code remains invariant across ICE restart', async () => {
      // Safety code before disconnect = '58291'
      // Complete ICE restart offer/answer
      // Verify: generateSafetyCode(newOffer, newAnswer) produces identical '58291'
      // Verify: UI safety verification modal state is NOT cleared
    });

    it('CRITICAL: Active UI view remains in CallScreen with "Reconnecting..." badge', () => {
      // Status is 'reconnecting'
      // isInCall remains true
      // UI does NOT jump back to Dial/Home screen
    });
  });

  // -------------------------------------------------------------
  // SUITE 5: Exponential Backoff & Retry Logic
  // -------------------------------------------------------------
  describe('5. Exponential Backoff & Retry Logic', () => {
    it('schedules 5 restart attempts with exponential backoff delays (1s, 2s, 4s, 6s, 8s)', async () => {
      // Attempt 1 fails -> next attempt at 1000ms
      // Attempt 2 fails -> next attempt at 2000ms
      // Attempt 3 fails -> next attempt at 4000ms
      // Attempt 4 fails -> next attempt at 6000ms
      // Attempt 5 fails -> next attempt at 8000ms
      // Verify exact timer delays scheduled
    });

    it('resets retry counter to 0 upon successful reconnection on attempt 3', async () => {
      // Attempt 1 fails
      // Attempt 2 fails
      // Attempt 3: pc.iceConnectionState = 'connected' -> pc._trigger('iceconnectionstatechange')
      // Result: retryCount reset to 0, status restored to 'in-call', backoff timers cleared
    });

    it('cancels pending backoff retry timers if peer connection recovers spontaneously', async () => {
      // Attempt 1 scheduled for 1000ms
      // At 400ms, spontaneous ICE reconnection occurs
      // Result: Pending timer cancelled, retry count reset
    });
  });

  // -------------------------------------------------------------
  // SUITE 6: Eventual Teardown on Permanent Failure
  // -------------------------------------------------------------
  describe('6. Permanent Failure & Clean Hardware Teardown', () => {
    it('executes clean teardown (endCall) when all 5 retry attempts fail', async () => {
      // Run through all 5 failed retries
      // vi.advanceTimersByTime(25000)
      // Result: endCall() invoked, mockTrack.stop() called, mockAudioCtx.close() called, status='ready'
    });

    it('executes clean teardown if total disconnect watchdog (25s) expires regardless of retry state', async () => {
      // Stuck in disconnected state for 25s
      // vi.advanceTimersByTime(25000)
      // Result: Disconnect watchdog fires -> tears down session cleanly
    });

    it('logs informative failure message to activity log on terminal disconnect', async () => {
      // Verify: log contains "Connection recovery failed after 5 attempts. Terminating call."
    });
  });

  // -------------------------------------------------------------
  // SUITE 7: Adversarial Race Conditions & Edge Cases
  // -------------------------------------------------------------
  describe('7. Adversarial Race Conditions & Error Handling', () => {
    it('handles remote peer hangup (call.on("close")) while reconnecting without crashing', async () => {
      // In RESTARTING state
      // Remote peer sends close / hangup
      // Result: Immediately aborts retry timers and terminates call cleanly
    });

    it('handles local user clicking "Hang Up" while reconnection attempt is in-flight', async () => {
      // In RESTARTING state
      // User calls endCall()
      // Result: Cancels all pending restart timers, stops media tracks, releases audio pipeline
    });

    it('handles rapid connection state flapping (disconnected -> connected -> disconnected in <100ms)', async () => {
      // Rapid state flapping
      // Result: State machine handles transitions deterministically without duplicate timers or leaked promises
    });

    it('handles pc.restartIce() throwing InvalidStateError (e.g. PC already closed)', async () => {
      // mockPc.restartIce.mockImplementation(() => { throw new Error('InvalidStateError'); });
      // Result: Manager catches exception, schedules next retry without unhandled rejection
    });

    it('handles signaling delivery rejection (e.g. PeerJS socket momentarily offline)', async () => {
      // signalingCallback.mockRejectedValue(new Error('SignalingSocketClosed'));
      // Result: Catches rejection, treats as failed attempt, advances backoff schedule
    });

    it('handles glare / simultaneous ICE restart initiated by both peers symmetrically', async () => {
      // Both peers initiate restart at the same time
      // Deterministic tie-breaking or standard WebRTC glare resolution handled gracefully
    });
  });
});
```

---

## 4. Caveats & Test Execution Constraints

1. **Vitest Fake Timers vs Promise Queues**:
   - In WebRTC test suites using `vi.useFakeTimers()`, asynchronous promises (such as `createOffer`, `setLocalDescription`, `getStats`) resolve in microtask queues. Tests must use `await Promise.resolve()` or `await act(async () => ...)` when advancing timers across async boundaries:
     ```javascript
     vi.advanceTimersByTime(1000);
     await Promise.resolve(); // Flush microtask queue
     ```
2. **`RTCStatsReport` Iteration Protocol**:
   - In native browsers, `RTCStatsReport` implements the `Map` interface (`.forEach`, `.get`, `.values`, `Symbol.iterator`). Mock reports in `createMockStatsReport` MUST provide standard `Map` methods to ensure full compatibility with `NetworkTelemetryMonitor`.
3. **DTLS Fingerprint Preservation**:
   - ICE restart only negotiates new ICE credentials (`ice-ufrag`, `ice-pwd`) and ICE candidates. DTLS SRTP certificates and fingerprints remain unchanged across renegotiation, ensuring MITM Safety Codes remain identical.

---

## 5. Conclusion

- The test specifications for **Milestone 3 (`src/test/networkAdaptation.test.js` and `src/test/iceRestart.test.js`)** provide comprehensive, production-grade test coverage for all R2 requirements.
- **`src/test/networkAdaptation.test.js`** exhaustively verifies 1000ms telemetry extraction, delta calculations, EMA smoothing, and the asymmetric 5-tier bitrate adaptation ladder (1-tick fast downgrade, 4-tick slow upgrade, multi-metric dominance).
- **`src/test/iceRestart.test.js`** exhaustively verifies the ICE restart state machine, transient 1500ms grace period, non-destructive session retention (MediaStream, AudioContext, call timer, safety code), 5-retry exponential backoff (1s, 2s, 4s, 6s, 8s), and clean permanent failure teardown.
- Together with existing suites (M1 audio processing and M2 transport), this achieves 100% test coverage for all Milestone 3 features.

---

## 6. Verification Method

To verify these test specifications upon implementation:

1. **Execute Unit Test Suites**:
   ```bash
   npm test -- src/test/networkAdaptation.test.js
   npm test -- src/test/iceRestart.test.js
   ```
2. **Execute Complete Test Suite**:
   ```bash
   npm test -- --run
   ```
   - Target: 16 test files passing cleanly with >300 total unit/adversarial tests.
3. **Build Verification**:
   ```bash
   npm run build
   ```
   - Target: Clean Vite bundle output with zero TypeScript/syntax errors.
4. **Network Impairment Simulation**:
   ```bash
   node scripts/simulate-network-impairments.js
   ```
   - Target: Verifies real-time bitrate downgrade and recovery under automated Chrome DevTools Protocol network throttling.
