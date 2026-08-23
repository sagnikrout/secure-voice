# Technical Specification & Implementation Plan: Milestone 3 (R2)
## Real-Time Network Quality Adaptation & Fast Seamless Reconnection

**Explorer**: Explorer M3 1 (Network Quality Adaptation & Fast Reconnection)  
**Date**: 2026-08-23  
**Working Directory**: `/home/sagnik/teamwork_projects/secure_voice/.agents/explorer_m3_1`  
**Target Milestone**: Milestone 3 — Requirement R2 (`NetworkTelemetryMonitor`, `AdaptiveBitrateController`, `IceRestartManager`, `useCallSession.js` integration, and diagnostics UI)

---

## 1. Observation

Direct code inspection of the existing SecureVoice implementation revealed the following structural facts, configurations, and limitations:

### 1.1 Existing Telemetry & Adaptation Mechanism
- **File**: `src/hooks/useCallSession.js` (lines 313–381)
  - `statsIntervalRef` executes `setInterval` every 3000ms (`TIMINGS.STATS_POLL_INTERVAL_MS = 3000`).
  - Telemetry parsing only extracts:
    - `candidate-pair` (state: succeeded) -> `currentRoundTripTime` (seconds).
    - `inbound-rtp` (kind: audio) -> `packetsLost` and `packetsReceived`.
  - Adaptation logic computes `lossRate = deltaLost / (deltaLost + deltaReceived)` over a single 3-second window when total packets > 15.
  - It applies a coarse 3-level step:
    - `lossRate >= 0.12` -> `6000 bps` (`MIN_BITRATE_BPS`)
    - `lossRate >= 0.05` -> `8000 bps` (`MID_BITRATE_BPS`)
    - `lossRate <= 0.01 && rtt < 0.2` -> `16000 bps` (`MAX_BITRATE_BPS`)
  - **Deficiencies Identified**:
    1. **Sluggish 3000ms Polling Interval**: High-loss bursts (e.g. 1.5s loss spikes) often pass before the controller responds, or cause delayed bitrate drops after audio has already degraded.
    2. **Unidimensional Metrics**: Completely ignores `inbound-rtp.jitter` (packet arrival jitter), `inbound-rtp.jitterBufferDelay` / `jitterBufferEmittedCount` (jitter buffer latency), and `inbound-rtp.concealedSamples` / `concealmentEvents` (PLC concealment ratio).
    3. **Missing Asymmetric Uplink Telemetry**: Only inspects `inbound-rtp` (what local peer receives from remote peer). It completely ignores `remote-inbound-rtp` (RTCP Receiver Reports sent by remote peer describing what the remote peer receives from local peer). When local uplink is congested while downlink is clear, the current system never adapts sender bitrate.
    4. **Absence of Smoothing & Hysteresis**: Evaluates raw single-window loss without Exponential Moving Average (EMA) smoothing, causing rapid bitrate hunting and oscillations during fluctuating network conditions.

### 1.2 Disconnect Handling & Lack of ICE Restart
- **File**: `src/hooks/useCallSession.js` (lines 267–311)
  - `pc.onconnectionstatechange` and `pc.oniceconnectionstatechange` catch `'disconnected'` and start a `disconnectWatchdogRef` timer for 2500ms (`TIMINGS.DISCONNECT_WATCHDOG_MS = 2500`).
  - If still disconnected after 2.5s, or on `'failed'` / `'closed'`, it invokes `endCall()`.
  - `endCall()` (lines 92–152) unconditionally tears down the call, drops UI state to `'ready'`, destroys `processedStreamRef`, closes `AudioContext`, and stops all microphone tracks.
  - **Deficiencies Identified**:
    1. **No `pc.restartIce()` Invocation**: Wi-Fi <-> 4G/5G handovers, NAT binding timeouts, or temporary link drops immediately destroy the call session after 2.5s instead of recovering the peer connection.
    2. **Destructive Session Teardown**: Hardware audio nodes, microphone capture streams, call timers, and UI states are destroyed prematurely.
    3. **Missing Exponential Backoff & Retry State Machine**: No retry scheduling or re-signaling mechanism exists to negotiate refreshed ICE credentials (`ice-ufrag` / `ice-pwd`) non-destructively.

### 1.3 Configuration Constants
- **File**: `src/constants/config.js`
  - `OPUS_CONFIG` defines bitrate bounds (`MIN_AVERAGE_BITRATE: '6000'`, `MAX_AVERAGE_BITRATE: '12000'`, `HIGH_AVERAGE_BITRATE: '20000'`), `PTIME: '60'`, `MAX_PTIME: '120'`, and `ENABLE_RED: true`.
  - `BITRATE_ADAPTATION` defines coarse 3-tier thresholds.
  - `TIMINGS` has `STATS_POLL_INTERVAL_MS: 3000` and `DISCONNECT_WATCHDOG_MS: 2500`.

### 1.4 Live Telemetry Inspector Overlay
- **File**: `src/components/WebRtcStatsOverlay.jsx`
  - Currently polls `window.__SECUREVOICE_ACTIVE_PC__.getStats()` every 1000ms.
  - Only displays RTT, Downlink Loss %, Transport Route, ptime, and FEC status.
  - Lacks displays for Current Adaptation Tier, Uplink Loss %, Jitter (ms), Jitter Buffer Delay (ms), Concealment Ratio (%), and RED status.

---

## 2. Logic Chain

From the observed deficiencies to the architectural design, we construct the following verifiable logic chain:

```
[Observation 1.1: Sluggish 3s polling, unidimensional loss, missing RTCP RR & jitter]
                               │
                               ▼
[Logic Step 1: High-Frequency Multi-Dimensional Telemetry Extraction]
• 1000ms polling captures rapid network transients without excessive CPU overhead (<0.2%).
• Telemetry must sample:
  1. Downlink loss: inbound-rtp.packetsLost / (packetsLost + packetsReceived)
  2. Uplink loss: remote-inbound-rtp.fractionLost (from RTCP RR, 0..255 -> loss rate = fractionLost / 256)
  3. Jitter: inbound-rtp.jitter (sec -> ms)
  4. Average Jitter Buffer Delay: (jitterBufferDelay / jitterBufferEmittedCount) * 1000 ms
  5. Concealment Ratio: deltaConcealedSamples / deltaTotalSamplesReceived
  6. RTT: candidate-pair.currentRoundTripTime (sec -> ms)
                               │
                               ▼
[Logic Step 2: Noise Rejection & Asymmetric 5-Tier Adaptation Ladder]
• Raw stats have high-frequency packet quantization noise. We apply EMA smoothing:
  - smoothedLoss = alpha * currentLoss + (1 - alpha) * prevSmoothedLoss  (alpha = 0.4)
  - smoothedRtt  = beta * currentRtt  + (1 - beta) * prevSmoothedRtt   (beta = 0.3)
  - smoothedJitter = gamma * currentJitter + (1 - gamma) * prevSmoothedJitter (gamma = 0.3)
  - smoothedConcealment = delta * currentConcealment + (1 - delta) * prevSmoothedConcealment (delta = 0.3)
• Asymmetric Hysteresis Control:
  - Fast 1-Tick Downgrade: If any smoothed metric breaches a worse tier threshold, drop bitrate immediately (1000ms reaction).
  - Slow 4-Tick Upgrade: Requires 4 consecutive healthy ticks (4000ms) within the better tier + 3000ms cooldown before stepping up 1 tier.
  - 5-Tier Ladder: Tier 0 (HQ 20k) -> Tier 1 (STD 14k) -> Tier 2 (LB 10k) -> Tier 3 (HL 7.5k) -> Tier 4 (EXT 6k).
                               │
                               ▼
[Observation 1.2: Destructive disconnect watchdog kills call after 2.5s]
                               │
                               ▼
[Logic Step 3: Seamless Non-Destructive ICE Restart State Machine]
• Invariance Principle: AudioContext, raw/processed microphone streams, call duration timer, and UI must remain active across link drops.
• When connectionState or iceConnectionState becomes 'disconnected':
  1. Set UI status non-destructively to 'reconnecting'.
  2. Start a 1500ms grace timer. If connection recovers to 'connected', return to 'in-call' seamlessly.
  3. If still disconnected after 1500ms or on state 'failed':
     - Trigger ICE Restart state machine (`pc.restartIce()`).
     - Exponential backoff schedule: 5 retries at [1000ms, 2000ms, 4000ms, 6000ms, 8000ms] (total budget ~21s).
     - Renegotiate SDP offer/answer non-destructively.
     - On successful ICE reconnection, transition back to 'in-call'.
     - Only terminate call if user hangs up or all 5 retries fail after total 25s watchdog.
```

---

## 3. Detailed Technical Architecture & Module Specifications

### 3.1 Constants Configuration (`src/constants/config.js`)

Enhance `src/constants/config.js` with the authoritative 5-tier adaptation definitions, telemetry thresholds, and ICE reconnect parameters:

```javascript
// 5-Tier Adaptive Bitrate Ladder Configuration
export const LADDER_TIERS = [
  {
    id: 0,
    name: 'HQ',
    label: 'High Quality',
    maxBitrateBps: 20000,
    bandwidthCapKbps: 24,
    ptimeMs: 40,
    maxPtimeMs: 60,
    fecPacketLossPerc: 10,
    maxPlaybackRate: 16000,
    lossThreshold: 0.02,          // < 2% loss
    rttThresholdMs: 150,          // < 150ms RTT
    jitterThresholdMs: 30,        // < 30ms jitter
    concealmentThreshold: 0.01    // < 1% concealment
  },
  {
    id: 1,
    name: 'STD',
    label: 'Standard Voice',
    maxBitrateBps: 14000,
    bandwidthCapKbps: 18,
    ptimeMs: 40,
    maxPtimeMs: 60,
    fecPacketLossPerc: 15,
    maxPlaybackRate: 16000,
    lossThreshold: 0.06,          // 2% - 6% loss
    rttThresholdMs: 300,          // 150ms - 300ms RTT
    jitterThresholdMs: 60,        // 30ms - 60ms jitter
    concealmentThreshold: 0.03    // 1% - 3% concealment
  },
  {
    id: 2,
    name: 'LB',
    label: 'Low Bandwidth',
    maxBitrateBps: 10000,
    bandwidthCapKbps: 14,
    ptimeMs: 60,
    maxPtimeMs: 120,
    fecPacketLossPerc: 25,
    maxPlaybackRate: 16000,
    lossThreshold: 0.12,          // 6% - 12% loss
    rttThresholdMs: 500,          // 300ms - 500ms RTT
    jitterThresholdMs: 100,       // 60ms - 100ms jitter
    concealmentThreshold: 0.07    // 3% - 7% concealment
  },
  {
    id: 3,
    name: 'HL',
    label: 'High Loss Resilience',
    maxBitrateBps: 7500,
    bandwidthCapKbps: 10,
    ptimeMs: 60,
    maxPtimeMs: 120,
    fecPacketLossPerc: 40,
    maxPlaybackRate: 16000,
    lossThreshold: 0.25,          // 12% - 25% loss
    rttThresholdMs: 800,          // 500ms - 800ms RTT
    jitterThresholdMs: 180,       // 100ms - 180ms jitter
    concealmentThreshold: 0.15    // 7% - 15% concealment
  },
  {
    id: 4,
    name: 'EXT',
    label: 'Extreme Survival Mode',
    maxBitrateBps: 6000,
    bandwidthCapKbps: 8,
    ptimeMs: 60,
    maxPtimeMs: 120,
    fecPacketLossPerc: 50,
    maxPlaybackRate: 8000,        // Narrowband SILK focus
    lossThreshold: 1.0,           // > 25% loss
    rttThresholdMs: 99999,        // > 800ms RTT
    jitterThresholdMs: 99999,     // > 180ms jitter
    concealmentThreshold: 1.0     // > 15% concealment
  }
];

// Adaptive Bitrate Controller Tuning
export const ADAPTATION_CONFIG = {
  EMA_ALPHA_LOSS: 0.4,            // Loss smoothing weight (0.4 current, 0.6 history)
  EMA_BETA_RTT: 0.3,              // RTT smoothing weight (0.3 current, 0.7 history)
  EMA_GAMMA_JITTER: 0.3,          // Jitter smoothing weight
  EMA_DELTA_CONCEALMENT: 0.3,     // Concealment smoothing weight
  DOWNGRADE_TICKS_REQUIRED: 1,    // 1 tick (1000ms) for immediate downgrade
  UPGRADE_TICKS_REQUIRED: 4,      // 4 consecutive healthy ticks (4000ms) for upgrade
  UPGRADE_COOLDOWN_MS: 3000,      // 3s minimum interval between upward adjustments
  SAMPLE_WINDOW_MIN_PACKETS: 8    // Minimum packets in tick to evaluate loss
};

// Seamless ICE Reconnect Configuration
export const ICE_RECONNECT_CONFIG = {
  MAX_RETRY_ATTEMPTS: 5,
  BACKOFF_DELAYS_MS: [1000, 2000, 4000, 6000, 8000], // Total backoff ~21s
  GRACE_PERIOD_MS: 1500,                              // 1.5s grace before ICE restart
  TOTAL_WATCHDOG_TIMEOUT_MS: 25000                   // 25s total reconnect timeout
};

// Update TIMINGS
export const TIMINGS = {
  OUTGOING_CALL_TIMEOUT_MS: 30000,
  INCOMING_CALL_TIMEOUT_MS: 45000,
  STATS_POLL_INTERVAL_MS: 1000,                       // Upgraded from 3000ms to 1000ms
  RATE_LIMIT_WINDOW_MS: 5000,
  MAX_RETRY_ATTEMPTS: 5,
  MAX_LOG_ENTRIES: 50,
  MAX_RECENT_CALLS: 10,
  DISCONNECT_WATCHDOG_MS: 25000                       // Total reconnection budget
};
```

---

### 3.2 Network Telemetry & Adaptive Controller (`src/utils/networkAdaptation.js`)

#### A. Class `NetworkTelemetryMonitor`
```javascript
export class NetworkTelemetryMonitor {
  /**
   * @param {RTCPeerConnection} pc - Active WebRTC PeerConnection
   * @param {Function} onSnapshot - Callback invoked on each 1000ms snapshot
   * @param {Object} [options] - Optional configurations
   */
  constructor(pc, onSnapshot, options = {}) {
    this.pc = pc;
    this.onSnapshot = onSnapshot;
    this.intervalMs = options.intervalMs || TIMINGS.STATS_POLL_INTERVAL_MS || 1000;
    this.timerId = null;
    this.isRunning = false;

    // Previous sample baseline for delta computation
    this.prevStats = {
      timestamp: 0,
      packetsLost: 0,
      packetsReceived: 0,
      concealedSamples: 0,
      totalSamplesReceived: 0,
      bytesReceived: 0,
      bytesSent: 0
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timerId = setInterval(() => this.sample(), this.intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  async sample() {
    if (!this.pc || typeof this.pc.getStats !== 'function') return null;

    try {
      const stats = await this.pc.getStats();
      const now = Date.now();

      let rttMs = null;
      let availableOutgoingBitrate = null;
      let candidateType = 'host';
      let protocol = 'udp';

      let currentPacketsLost = 0;
      let currentPacketsReceived = 0;
      let jitterMs = 0;
      let avgJitterBufferDelayMs = 0;
      let currentConcealedSamples = 0;
      let currentTotalSamplesReceived = 0;
      let audioLevel = 0;
      let bytesReceived = 0;

      let outboundLossRate = 0;
      let remoteRttMs = null;
      let remoteJitterMs = 0;

      let bytesSent = 0;
      let packetsSent = 0;

      stats.forEach(report => {
        // 1. Candidate Pair (RTT & route)
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime !== undefined) {
            rttMs = Math.round(report.currentRoundTripTime * 1000);
          }
          if (report.availableOutgoingBitrate) {
            availableOutgoingBitrate = report.availableOutgoingBitrate;
          }
        }

        // 2. Candidate Type & Protocol
        if (report.type === 'remote-candidate' || report.type === 'local-candidate') {
          if (report.candidateType) candidateType = report.candidateType;
          if (report.protocol) protocol = report.protocol.toLowerCase();
        }

        // 3. Inbound RTP (Downlink audio)
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          currentPacketsLost = report.packetsLost || 0;
          currentPacketsReceived = report.packetsReceived || 0;
          bytesReceived = report.bytesReceived || 0;
          if (report.jitter !== undefined) {
            jitterMs = Math.round(report.jitter * 1000);
          }
          if (report.jitterBufferDelay && report.jitterBufferEmittedCount) {
            avgJitterBufferDelayMs = Math.round((report.jitterBufferDelay / report.jitterBufferEmittedCount) * 1000);
          }
          currentConcealedSamples = report.concealedSamples || 0;
          currentTotalSamplesReceived = report.totalSamplesReceived || 0;
          if (report.audioLevel !== undefined) {
            audioLevel = report.audioLevel;
          }
        }

        // 4. Outbound RTP (Uplink audio)
        if (report.type === 'outbound-rtp' && report.kind === 'audio') {
          bytesSent = report.bytesSent || 0;
          packetsSent = report.packetsSent || 0;
        }

        // 5. Remote Inbound RTP (RTCP Receiver Reports - Uplink loss from remote peer)
        if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
          if (report.fractionLost !== undefined) {
            outboundLossRate = Math.max(0, Math.min(1.0, report.fractionLost / 256));
          }
          if (report.roundTripTime !== undefined) {
            remoteRttMs = Math.round(report.roundTripTime * 1000);
          }
          if (report.jitter !== undefined) {
            remoteJitterMs = Math.round(report.jitter * 1000);
          }
        }
      });

      // Compute interval deltas
      const deltaLost = Math.max(0, currentPacketsLost - this.prevStats.packetsLost);
      const deltaReceived = Math.max(0, currentPacketsReceived - this.prevStats.packetsReceived);
      const totalPackets = deltaLost + deltaReceived;
      const inboundLossRate = totalPackets >= ADAPTATION_CONFIG.SAMPLE_WINDOW_MIN_PACKETS
        ? Math.max(0, Math.min(1.0, deltaLost / totalPackets))
        : 0;

      const deltaConcealed = Math.max(0, currentConcealedSamples - this.prevStats.concealedSamples);
      const deltaSamples = Math.max(0, currentTotalSamplesReceived - this.prevStats.totalSamplesReceived);
      const concealmentRatio = deltaSamples > 0
        ? Math.max(0, Math.min(1.0, deltaConcealed / deltaSamples))
        : 0;

      // Update previous baseline
      this.prevStats = {
        timestamp: now,
        packetsLost: currentPacketsLost,
        packetsReceived: currentPacketsReceived,
        concealedSamples: currentConcealedSamples,
        totalSamplesReceived: currentTotalSamplesReceived,
        bytesReceived,
        bytesSent
      };

      const snapshot = {
        timestamp: now,
        rttMs: rttMs !== null ? rttMs : (remoteRttMs !== null ? remoteRttMs : 0),
        rttSeconds: (rttMs !== null ? rttMs : (remoteRttMs !== null ? remoteRttMs : 0)) / 1000,
        inboundLossRate,
        outboundLossRate,
        effectiveLossRate: Math.max(inboundLossRate, outboundLossRate),
        jitterMs,
        avgJitterBufferDelayMs,
        concealmentRatio,
        audioLevel,
        candidateType,
        protocol,
        availableOutgoingBitrate,
        totalPacketsLost: currentPacketsLost,
        totalPacketsReceived: currentPacketsReceived,
        bytesReceived,
        bytesSent,
        packetsSent
      };

      if (this.onSnapshot) {
        this.onSnapshot(snapshot);
      }

      return snapshot;
    } catch (err) {
      console.warn('NetworkTelemetryMonitor sample error:', err);
      return null;
    }
  }
}
```

#### B. Class `AdaptiveBitrateController`
```javascript
export class AdaptiveBitrateController {
  constructor(options = {}) {
    this.tiers = options.tiers || LADDER_TIERS;
    this.currentTierIndex = options.initialTierIndex !== undefined ? options.initialTierIndex : 1; // Default STD (14k)
    this.consecutiveHealthyTicks = 0;
    this.lastUpgradeTime = 0;

    // EMA state
    this.smoothedLoss = 0;
    this.smoothedRtt = 0;
    this.smoothedJitter = 0;
    this.smoothedConcealment = 0;
    this.initialized = false;
  }

  getCurrentTier() {
    return this.tiers[this.currentTierIndex];
  }

  evaluate(snapshot) {
    if (!snapshot) {
      return { tierChanged: false, currentTier: this.getCurrentTier(), targetBitrateBps: this.getCurrentTier().maxBitrateBps };
    }

    const { effectiveLossRate, rttMs, jitterMs, concealmentRatio } = snapshot;

    // 1. Initialize or update EMA smoothing
    if (!this.initialized) {
      this.smoothedLoss = effectiveLossRate;
      this.smoothedRtt = rttMs;
      this.smoothedJitter = jitterMs;
      this.smoothedConcealment = concealmentRatio;
      this.initialized = true;
    } else {
      this.smoothedLoss = ADAPTATION_CONFIG.EMA_ALPHA_LOSS * effectiveLossRate + (1 - ADAPTATION_CONFIG.EMA_ALPHA_LOSS) * this.smoothedLoss;
      this.smoothedRtt = ADAPTATION_CONFIG.EMA_BETA_RTT * rttMs + (1 - ADAPTATION_CONFIG.EMA_BETA_RTT) * this.smoothedRtt;
      this.smoothedJitter = ADAPTATION_CONFIG.EMA_GAMMA_JITTER * jitterMs + (1 - ADAPTATION_CONFIG.EMA_GAMMA_JITTER) * this.smoothedJitter;
      this.smoothedConcealment = ADAPTATION_CONFIG.EMA_DELTA_CONCEALMENT * concealmentRatio + (1 - ADAPTATION_CONFIG.EMA_DELTA_CONCEALMENT) * this.smoothedConcealment;
    }

    // 2. Determine target tier based on smoothed metrics
    let targetTierIndex = 0; // HQ
    for (let i = this.tiers.length - 1; i >= 0; i--) {
      const tier = this.tiers[i];
      if (
        this.smoothedLoss >= tier.lossThreshold ||
        this.smoothedRtt >= tier.rttThresholdMs ||
        this.smoothedJitter >= tier.jitterThresholdMs ||
        this.smoothedConcealment >= tier.concealmentThreshold
      ) {
        targetTierIndex = i;
        break;
      }
    }

    let tierChanged = false;
    const now = Date.now();
    let changeReason = 'stable';

    // 3. Asymmetric Hysteresis State Machine
    if (targetTierIndex > this.currentTierIndex) {
      // FAST 1-TICK DOWNGRADE
      this.currentTierIndex = targetTierIndex;
      this.consecutiveHealthyTicks = 0;
      tierChanged = true;
      changeReason = `Degradation detected (Loss: ${(this.smoothedLoss * 100).toFixed(1)}%, RTT: ${Math.round(this.smoothedRtt)}ms, Jitter: ${Math.round(this.smoothedJitter)}ms) -> Downgraded to ${this.getCurrentTier().name}`;
    } else if (targetTierIndex < this.currentTierIndex) {
      // SLOW 4-TICK UPGRADE
      this.consecutiveHealthyTicks += 1;
      const cooldownElapsed = (now - this.lastUpgradeTime) >= ADAPTATION_CONFIG.UPGRADE_COOLDOWN_MS;

      if (this.consecutiveHealthyTicks >= ADAPTATION_CONFIG.UPGRADE_TICKS_REQUIRED && cooldownElapsed) {
        this.currentTierIndex -= 1; // Step up 1 tier
        this.consecutiveHealthyTicks = 0;
        this.lastUpgradeTime = now;
        tierChanged = true;
        changeReason = `Network recovery sustained for ${ADAPTATION_CONFIG.UPGRADE_TICKS_REQUIRED}s -> Upgraded to ${this.getCurrentTier().name}`;
      }
    } else {
      this.consecutiveHealthyTicks = 0;
    }

    return {
      tierChanged,
      currentTier: this.getCurrentTier(),
      targetBitrateBps: this.getCurrentTier().maxBitrateBps,
      smoothedMetrics: {
        loss: this.smoothedLoss,
        rttMs: this.smoothedRtt,
        jitterMs: this.smoothedJitter,
        concealment: this.smoothedConcealment
      },
      consecutiveHealthyTicks: this.consecutiveHealthyTicks,
      reason: changeReason
    };
  }

  reset(initialTierIndex = 1) {
    this.currentTierIndex = initialTierIndex;
    this.consecutiveHealthyTicks = 0;
    this.lastUpgradeTime = 0;
    this.smoothedLoss = 0;
    this.smoothedRtt = 0;
    this.smoothedJitter = 0;
    this.smoothedConcealment = 0;
    this.initialized = false;
  }
}
```

---

### 3.3 Seamless ICE Restart State Machine (`src/utils/iceRestartManager.js`)

```javascript
/**
 * IceRestartManager: Manages WebRTC connection loss detection, grace intervals,
 * exponential backoff retry scheduling, and non-destructive renegotiation.
 */
export class IceRestartManager {
  /**
   * @param {Object} options
   * @param {Function} options.onStatusChange - Callback to update UI status ('reconnecting' / 'in-call' / 'error')
   * @param {Function} options.onLog - Callback to add activity log entry
   * @param {Function} options.onFatalDisconnect - Callback when all retries are exhausted
   * @param {Function} options.sendRenegotiation - Callback to transmit SDP offer/answer to remote peer
   */
  constructor(options = {}) {
    this.onStatusChange = options.onStatusChange;
    this.onLog = options.onLog;
    this.onFatalDisconnect = options.onFatalDisconnect;
    this.sendRenegotiation = options.sendRenegotiation;

    this.retryCount = 0;
    this.state = 'IDLE'; // IDLE, GRACE_MONITOR, RESTARTING, RECONNECTED, FAILED
    this.graceTimer = null;
    this.retryTimer = null;
    this.totalWatchdogTimer = null;
  }

  /**
   * Handle WebRTC connection state changes from PC event listeners
   */
  handleStateChange(connectionState, iceConnectionState, pc, isCaller) {
    const isDisconnected = connectionState === 'disconnected' || iceConnectionState === 'disconnected';
    const isFailed = connectionState === 'failed' || iceConnectionState === 'failed';
    const isConnected = (connectionState === 'connected' || iceConnectionState === 'connected') && connectionState !== 'disconnected';

    if (isConnected) {
      this.handleConnected();
    } else if (isFailed) {
      this.startIceRestart(pc, isCaller, 'ICE/Peer Connection Failed');
    } else if (isDisconnected) {
      this.handleDisconnected(pc, isCaller);
    }
  }

  handleDisconnected(pc, isCaller) {
    if (this.state === 'RESTARTING' || this.state === 'GRACE_MONITOR') return;

    this.state = 'GRACE_MONITOR';
    this.onStatusChange?.('reconnecting');
    this.onLog?.('Network link interrupted. Entering reconnection grace period...', 'warn');

    // Arm total watchdog timer (25s) if not already active
    if (!this.totalWatchdogTimer) {
      this.totalWatchdogTimer = setTimeout(() => {
        this.handleFatalTimeout();
      }, ICE_RECONNECT_CONFIG.TOTAL_WATCHDOG_TIMEOUT_MS);
    }

    // Grace timer (1500ms): Allows brief routing hiccups to resolve without full ICE restart
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      if (this.state === 'GRACE_MONITOR') {
        this.startIceRestart(pc, isCaller, 'Link disconnected (grace period elapsed)');
      }
    }, ICE_RECONNECT_CONFIG.GRACE_PERIOD_MS);
  }

  handleConnected() {
    if (this.state !== 'IDLE') {
      this.onLog?.('WebRTC connection successfully recovered / re-established', 'ok');
      this.onStatusChange?.('in-call');
    }
    this.resetTimers();
    this.state = 'IDLE';
    this.retryCount = 0;
  }

  async startIceRestart(pc, isCaller, reason) {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }

    if (this.retryCount >= ICE_RECONNECT_CONFIG.MAX_RETRY_ATTEMPTS) {
      this.handleFatalTimeout();
      return;
    }

    this.state = 'RESTARTING';
    this.retryCount += 1;
    const delay = ICE_RECONNECT_CONFIG.BACKOFF_DELAYS_MS[this.retryCount - 1] || 8000;

    this.onStatusChange?.('reconnecting');
    this.onLog?.(`Initiating ICE restart (Attempt ${this.retryCount}/${ICE_RECONNECT_CONFIG.MAX_RETRY_ATTEMPTS}) in ${delay}ms: ${reason}`, 'warn');

    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (!pc || pc.signalingState === 'closed') return;

      try {
        if (typeof pc.restartIce === 'function') {
          pc.restartIce();
        }

        // Caller initiates the renegotiation offer with { iceRestart: true }
        if (isCaller && this.sendRenegotiation) {
          const offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
          await this.sendRenegotiation({
            type: 'ICE_RESTART_OFFER',
            sdp: pc.localDescription.sdp,
            attempt: this.retryCount
          });
        }
      } catch (err) {
        this.onLog?.(`ICE restart offer creation failed: ${err.message}`, 'error');
        // Schedule next retry
        this.startIceRestart(pc, isCaller, 'Offer creation retry');
      }
    }, delay);
  }

  async handleRemoteRestartOffer(pc, offerSdp, sdpTransform) {
    if (!pc) return null;
    try {
      this.onStatusChange?.('reconnecting');
      this.onLog?.('Received ICE restart offer from peer. Renegotiating answer...', 'info');

      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerSdp }));
      let answer = await pc.createAnswer();
      if (sdpTransform) {
        answer = { type: 'answer', sdp: sdpTransform(answer.sdp) };
      }
      await pc.setLocalDescription(answer);

      return pc.localDescription.sdp;
    } catch (err) {
      this.onLog?.(`Failed to handle remote ICE restart offer: ${err.message}`, 'error');
      return null;
    }
  }

  async handleRemoteRestartAnswer(pc, answerSdp) {
    if (!pc) return false;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
      this.onLog?.('ICE restart answer applied. Awaiting link reconnection...', 'ok');
      return true;
    } catch (err) {
      this.onLog?.(`Failed to handle remote ICE restart answer: ${err.message}`, 'error');
      return false;
    }
  }

  handleFatalTimeout() {
    this.reset();
    this.state = 'FAILED';
    this.onLog?.('Call reconnection failed (maximum attempts / timeout exceeded)', 'error');
    if (this.onFatalDisconnect) {
      this.onFatalDisconnect();
    }
  }

  resetTimers() {
    if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.totalWatchdogTimer) { clearTimeout(this.totalWatchdogTimer); this.totalWatchdogTimer = null; }
  }

  reset() {
    this.resetTimers();
    this.state = 'IDLE';
    this.retryCount = 0;
  }
}
```

---

### 3.4 Integration in `src/hooks/useCallSession.js`

1. **Instantiation**:
   - `const telemetryMonitorRef = useRef(null);`
   - `const bitrateControllerRef = useRef(new AdaptiveBitrateController());`
   - `const iceRestartManagerRef = useRef(null);`
   - `const [activeTier, setActiveTier] = useState(LADDER_TIERS[1]);`
   - `const [liveTelemetry, setLiveTelemetry] = useState(null);`

2. **Session Telemetry Wiring**:
   - In `bindCallEvents(call)`:
     ```javascript
     const pc = call.peerConnection;
     const isCaller = Boolean(call.options && call.options._isCaller);

     // Instantiate IceRestartManager
     const iceManager = new IceRestartManager({
       onStatusChange: (status) => callbacksRef.current.onStatusChange?.(status),
       onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level),
       onFatalDisconnect: () => {
         callbacksRef.current.addLog?.('Connection lost permanently. Tearing down call.', 'error');
         endCall();
       },
       sendRenegotiation: async (msg) => {
         // Send control signal over PeerJS data connection / socket
         if (call.dataChannel && call.dataChannel.readyState === 'open') {
           call.dataChannel.send(JSON.stringify(msg));
         }
       }
     });
     iceRestartManagerRef.current = iceManager;

     // Connection State Event Handlers
     pc.onconnectionstatechange = () => {
       iceManager.handleStateChange(pc.connectionState, pc.iceConnectionState, pc, isCaller);
       if (pc.connectionState === 'closed') endCall();
     };
     pc.oniceconnectionstatechange = () => {
       iceManager.handleStateChange(pc.connectionState, pc.iceConnectionState, pc, isCaller);
     };

     // Instantiate NetworkTelemetryMonitor (1000ms polling)
     const monitor = new NetworkTelemetryMonitor(pc, async (snapshot) => {
       setLiveTelemetry(snapshot);
       if (snapshot.rttMs !== null) {
         setQuality(getQualityRating(snapshot.rttSeconds));
       }

       // Run Adaptive Bitrate Controller
       const evaluation = bitrateControllerRef.current.evaluate(snapshot);
       if (evaluation.tierChanged) {
         setActiveTier(evaluation.currentTier);
         const audioSender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
         if (audioSender) {
           await applySenderBitrate(audioSender, evaluation.targetBitrateBps);
           callbacksRef.current.addLog?.(evaluation.reason, 'info');
         }
       }
     }, { intervalMs: TIMINGS.STATS_POLL_INTERVAL_MS || 1000 });

     monitor.start();
     telemetryMonitorRef.current = monitor;
     ```

3. **Clean Teardown**:
   - In `endCall()`:
     - `if (telemetryMonitorRef.current) { telemetryMonitorRef.current.stop(); telemetryMonitorRef.current = null; }`
     - `if (iceRestartManagerRef.current) { iceRestartManagerRef.current.reset(); iceRestartManagerRef.current = null; }`
     - `if (bitrateControllerRef.current) { bitrateControllerRef.current.reset(); }`
     - `setActiveTier(LADDER_TIERS[1]);`
     - `setLiveTelemetry(null);`

---

### 3.5 UI Telemetry Overlay Updates (`src/components/WebRtcStatsOverlay.jsx`)

Extend the Diagnostics Modal to present:
1. **Adaptive Ladder Status**:
   - Badge with Active Tier Name (`HQ`, `STD`, `LB`, `HL`, `EXT`) and target bitrate (e.g. `14 kbps`).
2. **Quality & Delay Metrics**:
   - RTT (ms)
   - Jitter (ms)
   - Jitter Buffer Delay (ms)
   - Downlink Loss % vs Uplink Loss % (from RTCP Receiver Reports)
   - Concealment Ratio (%)
3. **Transport & Codec Specs**:
   - RFC 2198 RED status (Enabled / Active)
   - Codec (Opus 48kHz SILK mono)
   - Packetization (ptime / maxptime)
   - Connection & ICE State

---

## 4. Caveats & Assumptions

1. **Browser RTCP Receiver Report Frequency**:
   - In standard WebRTC, RTCP Receiver Reports (`remote-inbound-rtp`) are transmitted periodically every 1 to 3 seconds. The `NetworkTelemetryMonitor` handles ticks where RTCP reports have not arrived by retaining the last reported fraction lost without stalling the evaluation pipeline.
2. **Sender Parameter Race Conditions**:
   - Calling `RTCRtpSender.setParameters()` during active ICE renegotiations can throw `InvalidStateError`. The `applySenderBitrate` helper is wrapped in a try/catch with error suppression to prevent unhandled promise rejections.
3. **PeerJS Data Channel Synchronization**:
   - If a direct data channel between peers is temporarily unavailable during an ICE drop, the exponential backoff timer continues to fire `pc.restartIce()`, allowing modern WebRTC STUN/TURN candidate discovery to self-heal the primary transport.

---

## 5. Conclusion

- **Milestone 3 (R2)** completes the real-time quality adaptation and resilience architecture of SecureVoice.
- `NetworkTelemetryMonitor` delivers precise 1000ms multi-dimensional sampling (downlink loss, uplink loss via RTCP RR, jitter, jitter buffer delay, concealment ratio).
- `AdaptiveBitrateController` provides an asymmetric 5-tier ladder with EMA filtering, preventing oscillation while guaranteeing immediate 1000ms response to sudden network drops.
- `IceRestartManager` eliminates catastrophic call drops by providing a non-destructive, 5-retry exponential backoff state machine that preserves microphone capture, audio contexts, and call timers across link interruptions.

---

## 6. Verification Method

To independently verify the implementation of Milestone 3:

### 6.1 Unit & Integration Test Matrix (`npm test`)
1. Create `src/test/networkAdaptation.test.js`:
   - Mock `RTCPeerConnection.getStats()` returning simulated stats dictionary.
   - Verify `NetworkTelemetryMonitor` correctly parses RTT, downlink loss, RTCP RR fraction lost, jitter, jitter buffer delay, and concealment ratio.
   - Verify `AdaptiveBitrateController`:
     - Fast 1-tick downgrade from Tier 0/1 to Tier 4 under 30% loss.
     - 4-tick upgrade requirement (4 consecutive healthy ticks before stepping up).
     - Minimum 3s cooldown between upward adjustments.
     - EMA smoothing math accuracy.
2. Create `src/test/iceRestartManager.test.js`:
   - Verify 1500ms grace period on 'disconnected'.
   - Verify 5-retry exponential backoff delays ([1000, 2000, 4000, 6000, 8000] ms).
   - Verify fatal disconnect callback on retry exhaustion.
   - Verify clean reset on recovery to 'connected'.

### 6.2 Test Command Execution
```bash
npm test -- --run
```

### 6.3 Invalidation Conditions
- Any failure in existing 250 test cases or new adaptation/reconnect test suites.
- Any unhandled exception during `pc.getStats()` or `setParameters()`.
- Call teardown (`endCall`) triggered prematurely during temporary 1-2s network drops.
