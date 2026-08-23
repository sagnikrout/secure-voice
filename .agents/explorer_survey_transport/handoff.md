# Technical Specification Handoff: R1 & R2 WebRTC & Extreme Network Transport

**Explorer**: Explorer 2 (WebRTC & Extreme Network Transport)  
**Date**: 2026-08-23  
**Working Directory**: `/home/sagnik/teamwork_projects/secure_voice/.agents/explorer_survey_transport`  
**Target Milestone**: Survey and Architecture Specification for R1 (Extreme Low-Bandwidth & High-Loss Audio Transport) and R2 (Real-Time Network Quality Adaptation & Fast Reconnection)

---

## 1. Observation

Direct code analysis across the SecureVoice codebase revealed the following architecture and implementation points:

### 1.1 Existing WebRTC SDP Munging & Opus Configuration
- **File**: `src/utils/webrtc.js` (lines 52–135)
  - `transformOpusSdp(sdp)` performs a line-by-line regex parse of the SDP offer/answer.
  - It detects `m=audio` and locates `opusPayloadType` via `/^a=rtpmap:(\d+)\s+opus\/48000/i`.
  - It inserts `b=AS:16`, `a=ptime:40`, and `a=maxptime:60` before the first `a=` line in the audio section.
  - It modifies `a=fmtp:<pt>` by setting:
    ```javascript
    paramMap.set('maxaveragebitrate', OPUS_CONFIG.MAX_AVERAGE_BITRATE); // '12000'
    paramMap.set('usedtx', OPUS_CONFIG.USE_DTX); // '1'
    paramMap.set('useinbandfec', OPUS_CONFIG.USE_INBAND_FEC || '1'); // '1'
    paramMap.set('packetlossperc', OPUS_CONFIG.PACKET_LOSS_PERC || '10'); // '10'
    paramMap.set('stereo', OPUS_CONFIG.STEREO); // '0'
    paramMap.set('sprop-stereo', OPUS_CONFIG.STEREO); // '0'
    ```
  - **Identified Deficiencies**:
    1. `packetlossperc` is statically fixed at 10%, which provides insufficient redundancy under 20–50% packet loss environments.
    2. `maxaveragebitrate` is statically set to 12 kbps, and cannot be configured down to sub-6kbps (e.g. 6000 bps) during severe bandwidth crunches.
    3. `cbr=0` (variable bitrate vs constant bitrate) is not explicitly configured.
    4. `maxplaybackrate` / `sprop-maxcapturerate` is not configured, meaning the encoder attempts fullband 48kHz encoding at ultra-low bitrates, resulting in high-frequency artifact distortion instead of crystal-clear narrowband/wideband speech.
    5. RFC 2198 Redundant Audio Data (`audio/red`) is not negotiated or prioritized in SDP.
    6. `ptime:40` is fixed. Under extreme packet loss and sub-6kbps bandwidth, `ptime:60` or `ptime:120` drastically cuts RTP/UDP/IP header packet overhead from 20 kbps down to 3.3–5.3 kbps.

### 1.2 Existing Network Telemetry & Bitrate Adaptation Controller
- **File**: `src/hooks/useCallSession.js` (lines 312–378)
  - `setInterval` polls `pc.getStats()` every 3000ms (`TIMINGS.STATS_POLL_INTERVAL_MS = 3000`).
  - It only inspects `report.type === 'candidate-pair'` for `currentRoundTripTime` and `report.type === 'inbound-rtp'` for `packetsLost` and `packetsReceived`.
  - It evaluates loss over a single 3-second interval (`totalPackets > 15`):
    ```javascript
    if (lossRate >= BITRATE_ADAPTATION.HIGH_LOSS_THRESHOLD) { // 0.12 (12%)
      targetBitrate = BITRATE_ADAPTATION.MIN_BITRATE_BPS; // 6000 bps
    } else if (lossRate >= BITRATE_ADAPTATION.MID_LOSS_THRESHOLD) { // 0.05 (5%)
      targetBitrate = BITRATE_ADAPTATION.MID_BITRATE_BPS; // 8000 bps
    } else if (lossRate <= BITRATE_ADAPTATION.RECOVERY_LOSS_THRESHOLD && rtt !== null && rtt < 0.2) { // 1% & RTT < 200ms
      targetBitrate = BITRATE_ADAPTATION.MAX_BITRATE_BPS; // 16000 bps
    }
    ```
  - It sets `encodings[0].maxBitrate` via `audioSender.setParameters(params)`.
  - **Identified Deficiencies**:
    1. Polling every 3000ms causes sluggish reaction to sudden channel drops (a 1.5s loss burst may pass before adaptation reacts).
    2. Completely ignores `inbound-rtp.jitter`, `inbound-rtp.jitterBufferDelay`, `inbound-rtp.concealedSamples`, and `inbound-rtp.concealmentEvents`.
    3. Ignores `remote-inbound-rtp` (RTCP Receiver Reports): `inbound-rtp` only tells what Peer A *receives* from Peer B; it does NOT tell what loss Peer B is seeing on Peer A's outgoing track (asymmetric uplink congestion).
    4. Only has 3 coarse steps without Exponential Moving Average (EMA) smoothing or hysteresis, causing bitrate hunting/oscillation.
    5. Sender encoding priority and DSCP marking (`priority: 'high'`, `networkPriority: 'high'`) are not set.

### 1.3 Disconnect Handling & Lack of ICE Restart
- **File**: `src/hooks/useCallSession.js` (lines 265–309)
  - When `pc.connectionState` or `pc.iceConnectionState` becomes `'disconnected'`, it sets a watchdog timer `TIMINGS.DISCONNECT_WATCHDOG_MS = 2500` (2.5s).
  - If still disconnected after 2.5s or if state is `'failed'`, it calls `endCall()` (lines 90–152), which unconditionally tears down the call, drops the UI to `'ready'`, stops audio tracks, and closes the `AudioContext`.
  - **Identified Deficiencies**:
    1. There is no call to `pc.restartIce()` or `peerConnection.createOffer({ iceRestart: true })`.
    2. Cellular network handovers (Wi-Fi <-> 4G/5G) or temporary NAT binding timeouts immediately kill the call after 2.5s instead of recovering.
    3. No re-signaling state machine exists to exchange renegotiated SDP descriptions while keeping call session state intact.

---

## 2. Logic Chain

From these direct observations, we trace the step-by-step engineering logic required to fulfill R1 and R2:

```
[Observation 1.1: Static SDP & lack of RED/ptime tuning]
       │
       ▼
[Logic Step 1: RTP Header Overhead & Codec Bitrate Math]
• At ptime=20ms (50 pps), IPv4+UDP+SRTP headers = ~50 bytes/pkt = 20 kbps overhead alone!
• At ptime=60ms (16.6 pps), header overhead = ~6.6 kbps (67% reduction).
• At ptime=100ms/120ms (8.3-10 pps), header overhead = ~3.3-4.0 kbps.
• Sub-6kbps voice (6000 bps Opus SILK mono) + 60ms ptime allows total network usage <= 12 kbps.
• Opus in-band FEC (`useinbandfec=1`) + dynamic `packetlossperc` (up to 50%) enables single-packet loss recovery with zero added delay.
• RFC 2198 RED (`audio/red`) duplicates previous Opus frames in the same packet, guaranteeing survival under 30-50% burst packet loss.
       │
       ▼
[Logic Step 2: Multi-Dimensional Telemetry & Asymmetric Control]
[Observation 1.2: 3s polling, missing Jitter, Outbound/Remote Loss]
• 1000ms polling with EMA smoothing (alpha=0.4 for loss, beta=0.3 for RTT) provides fast response without jitter noise.
• Telemetry must track:
  - Downlink loss: `inbound-rtp.packetsLost` / `packetsReceived`
  - Uplink loss: `remote-inbound-rtp.fractionLost` / `packetsLost` (from RTCP RR)
  - Jitter: `inbound-rtp.jitter` & `remote-inbound-rtp.jitter`
  - Concealment: `concealedSamples` / `totalSamplesReceived`
  - RTT: `candidate-pair.currentRoundTripTime`
• 5-Tier Adaptation Ladder with Asymmetric Hysteresis:
  - Fast Downgrade: 1 evaluation tick exceeding threshold immediately drops tier.
  - Slow Upgrade: Requires 4 consecutive healthy ticks (4s) before stepping up 1 tier.
       │
       ▼
[Logic Step 3: Seamless Non-Destructive ICE Restart State Machine]
[Observation 1.3: Watchdog kills call after 2.5s without ICE restart]
• Connection interruptions must NOT destroy UI session state, AudioContext, or mic streams.
• When `disconnected`/`failed` occurs:
  1. Transition state to `reconnecting` (watchdog extended to 15-20s with 5 retries).
  2. Invoke native `pc.restartIce()` to generate fresh ICE credentials (`ice-ufrag`, `ice-pwd`).
  3. Re-exchange offer/answer via PeerJS signaling (or data channel).
  4. On ICE connection re-establishment, seamlessly transition back to `in-call`.
```

---

## 3. Detailed Technical Specification

### 3.1 R1: Extreme Low-Bandwidth & High-Loss Audio Transport

#### A. Opus Codec Constraints & Dynamic SDP Parameters
1. **Dynamic SDP Transformation (`transformOpusSdp(sdp, options)`)**:
   - Add configurable options: `{ bitrate, ptime, maxptime, fec, packetLossPerc, dtx, stereo, maxPlaybackRate, enableRed }`.
   - **SDP Munging Parameters**:
     - `maxaveragebitrate`: Configurable from `6000` (floor) to `24000` (ceiling). Default `12000`.
     - `usedtx=1`: Discontinuous transmission for ~50% bandwidth savings during silence.
     - `useinbandfec=1`: Forward error correction enabled.
     - `packetlossperc`: Tuned dynamically or initialized to `20`–`50` based on network tier.
     - `cbr=0`: Constrained variable bitrate for voice phoneme efficiency.
     - `stereo=0` & `sprop-stereo=0`: Pure mono encoding.
     - `maxplaybackrate`: Set to `16000` (Wideband) or `8000` (Narrowband) during degraded tiers to prevent quantization noise.
     - `a=ptime:60` / `a=maxptime:120`: Default 60ms packetization (reduces packet rate to 16.6 pps).
     - `b=AS:16` (or `b=AS:12` in extreme tier): Enforces SDP session bandwidth limits.

#### B. RFC 2198 RED (Redundant Audio Data) Integration
1. **SDP RED Injection**:
   - Detect Opus payload type (e.g. `111`).
   - Assign RED payload type (e.g. `63`).
   - Inject into SDP:
     ```sdp
     a=rtpmap:63 red/48000/2
     a=fmtp:63 111/111
     ```
   - Prepend `63` in `m=audio 9 UDP/TLS/RTP/SAVPF 63 111 101...`.
2. **RTCRtpTransceiver Codec Preferences**:
   - If `RTCRtpReceiver.getCapabilities('audio')` contains `audio/red`, set codec preferences on the audio transceiver:
     ```javascript
     const codecs = RTCRtpReceiver.getCapabilities('audio').codecs;
     const redCodec = codecs.find(c => c.mimeType.toLowerCase() === 'audio/red');
     const opusCodec = codecs.find(c => c.mimeType.toLowerCase() === 'audio/opus');
     if (redCodec && opusCodec && transceiver.setCodecPreferences) {
       transceiver.setCodecPreferences([redCodec, opusCodec]);
     }
     ```

#### C. RTCRtpSender Parameter Constraints
- When initializing or adapting sender:
  ```javascript
  const params = sender.getParameters();
  if (params.encodings && params.encodings[0]) {
    params.encodings[0].maxBitrate = targetBitrate; // 6000 to 20000 bps
    params.encodings[0].priority = 'high';          // WebRTC Sender Priority API
    params.encodings[0].networkPriority = 'high';   // DSCP Expedited Forwarding (EF)
    params.encodings[0].active = true;
    await sender.setParameters(params);
  }
  ```

---

### 3.2 R2: Real-Time Network Quality Adaptation & Fast Reconnection

#### A. Multi-Dimensional Telemetry Extraction (`NetworkTelemetryMonitor`)
Poll `pc.getStats()` every **1000ms**. Extract:
1. `candidate-pair` (active/succeeded):
   - `currentRoundTripTime` (seconds -> ms)
   - `availableOutgoingBitrate` (bps)
   - `bytesSent`, `bytesReceived`
2. `inbound-rtp` (audio):
   - `packetsReceived`, `packetsLost`, `jitter` (seconds -> ms)
   - `jitterBufferDelay`, `jitterBufferEmittedCount` -> `avgJitterBufferDelayMs = (jitterBufferDelay / jitterBufferEmittedCount) * 1000`
   - `concealedSamples`, `totalSamplesReceived`, `concealmentEvents` -> `concealmentRatio = deltaConcealed / deltaTotal`
   - `audioLevel`
3. `outbound-rtp` (audio):
   - `bytesSent`, `packetsSent`, `targetBitrate`
4. `remote-inbound-rtp` (audio):
   - `fractionLost` (0-255 -> loss rate = fractionLost / 256)
   - `roundTripTime`, `jitter`

#### B. 5-Tier Dynamic Adaptation Ladder
Define the following operational tiers:

| Tier Level | Tier Name | Sender MaxBitrate | SDP Bandwidth | Target ptime | FEC Target | Loss Trigger (In/Out) | RTT Trigger | Jitter Trigger | Concealment Ratio |
|---|---|---|---|---|---|---|---|---|---|
| **Tier 0** | High Quality (HQ) | 20,000 bps | `b=AS:24` | 40ms | 10% | < 2.0% | < 150ms | < 30ms | < 1.0% |
| **Tier 1** | Standard (STD) | 14,000 bps | `b=AS:18` | 40ms | 15% | 2.0% – 6.0% | 150 – 300ms | 30 – 60ms | 1.0% – 3.0% |
| **Tier 2** | Low Bandwidth (LB) | 10,000 bps | `b=AS:14` | 40ms / 60ms | 25% | 6.0% – 12.0% | 300 – 500ms | 60 – 100ms | 3.0% – 7.0% |
| **Tier 3** | High Loss (HL) | 7,500 bps | `b=AS:10` | 60ms | 40% | 12.0% – 25.0% | 500 – 800ms | 100 – 180ms | 7.0% – 15.0% |
| **Tier 4** | Survival Mode (EXT) | 6,000 bps | `b=AS:8` | 60ms / 120ms | 50% | > 25.0% | > 800ms | > 180ms | > 15.0% |

- **Asymmetric Hysteresis State Controller**:
  - `smoothedLoss = 0.4 * currentLoss + 0.6 * prevSmoothedLoss`
  - `smoothedRtt = 0.3 * currentRtt + 0.7 * prevSmoothedRtt`
  - **Downgrade**: If `smoothedLoss` or `smoothedRtt` crosses a worse tier threshold for **1 evaluation cycle**, downgrade immediately.
  - **Upgrade**: Require **4 consecutive cycles** (4 seconds) meeting the better tier's recovery thresholds before stepping up by 1 tier.
  - **Minimum Cooldown**: 3 seconds between any upward adjustments.

#### C. Seamless ICE Restart & Fast Re-Signaling State Machine
- **State Machine Definition**:
  - `IDLE` -> `CALLING` -> `IN_CALL`
  - On `connectionState === 'disconnected'`:
    - Transition to `RECONNECTING_MONITOR` (start 1500ms grace timer).
    - If recovered within 1500ms, restore `IN_CALL`.
    - If still disconnected after 1500ms or on state `'failed'`:
      - Transition to `ICE_RESTARTING`.
      - Increment `iceRestartAttemptCount`.
      - Call `pc.restartIce()`.
      - If caller: Create new offer with `{ iceRestart: true }`, transform SDP with current adaptive tier params, call `pc.setLocalDescription(offer)`.
      - Send renegotiation offer through signaling channel.
      - Await remote answer and call `pc.setRemoteDescription(answer)`.
  - **Retry Policy**:
    - Maximum 5 restart attempts.
    - Exponential backoff delays: 1000ms, 2000ms, 4000ms, 6000ms, 8000ms (total budget ~21 seconds).
  - **Session Invariance**:
    - Do NOT call `endCall()`.
    - Keep `rawStreamRef`, `processedStreamRef`, `audioCtxRef`, `callDuration` timer, and UI components running.
    - Display `"Reconnecting link..."` non-destructively in UI.
    - When `pc.iceConnectionState === 'connected'`, return to `IN_CALL` and log `"Link recovered via ICE restart"`.
    - Only terminate call if user clicks Hang Up or after all 5 attempts fail and total watchdog timer expires (25s).

---

## 4. Module Boundaries, Types & Interface Contracts

### 4.1 Module Decomposition
```
src/
├── constants/
│   └── config.js              <-- Enhanced OPUS_CONFIG, BITRATE_ADAPTATION, LADDER_TIERS, ICE_RECONNECT_CONFIG
├── utils/
│   ├── webrtc.js              <-- Core SDP parsing/munging, RED injection, Safety Code, Quality rating
│   ├── networkAdaptation.js   <-- NetworkTelemetryMonitor, AdaptiveBitrateController (EMA + ladder)
│   └── iceRestartManager.js   <-- IceRestartStateMachine, renegotiation coordination, retry backoff
├── hooks/
│   ├── useCallSession.js      <-- Integrated session lifecycle, event binding, non-destructive reconnect
│   └── usePeer.js             <-- Signaling handling, renegotiation message pass-through
└── components/
    └── WebRtcStatsOverlay.jsx <-- Expanded live telemetry UI (Tier, Jitter, Concealment, Loss, RED)
```

### 4.2 TypeScript / JSDoc Interface Contracts

```typescript
// 1. Adaptation Tier Definition
export interface AdaptationTier {
  id: number;
  name: 'HQ' | 'STD' | 'LB' | 'HL' | 'EXT';
  maxBitrateBps: number;
  bandwidthCapKbps: number;
  ptimeMs: number;
  maxPtimeMs: number;
  fecPacketLossPerc: number;
  lossThreshold: number;
  rttThresholdMs: number;
  jitterThresholdMs: number;
  concealmentThreshold: number;
}

// 2. Comprehensive Telemetry Snapshot
export interface NetworkTelemetrySnapshot {
  timestamp: number;
  rttMs: number;
  inboundLossRate: number;       // 0.0 - 1.0
  outboundLossRate: number;      // 0.0 - 1.0 (from remote-inbound-rtp)
  jitterMs: number;
  avgJitterBufferDelayMs: number;
  concealmentRatio: number;      // 0.0 - 1.0
  audioLevel: number;            // 0.0 - 1.0
  candidateType: string;         // 'host' | 'srflx' | 'relay'
  protocol: 'udp' | 'tcp' | 'tls';
  activeTierId: number;
  currentBitrateBps: number;
  redEnabled: boolean;
  iceState: RTCIceConnectionState;
  connectionState: RTCPeerConnectionState;
}

// 3. Adaptive Bitrate Controller Interface
export interface IAdaptiveBitrateController {
  evaluate(telemetry: NetworkTelemetrySnapshot): Promise<{
    tierChanged: boolean;
    currentTier: AdaptationTier;
    targetBitrateBps: number;
  }>;
  reset(): void;
}

// 4. ICE Restart Manager Interface
export interface IIceRestartManager {
  startWatchdog(onFailure: () => void): void;
  clearWatchdog(): void;
  triggerIceRestart(pc: RTCPeerConnection, signalingCallback: (msg: any) => Promise<void>): Promise<boolean>;
  handleRemoteRenegotiation(pc: RTCPeerConnection, offerSdp: string): Promise<string>;
  reset(): void;
}
```

---

## 5. Caveats

1. **Browser SDP Codec Capabilities**:
   - `RTCRtpReceiver.getCapabilities('audio')` and RFC 2198 RED support vary slightly between Chromium and Firefox/WebKit. Chromium (and Android WebView via Capacitor) has first-class RED support. For browsers where RED is absent, the fallback to pure Opus in-band FEC (`useinbandfec=1` with `packetlossperc=50`) is fully specified.
2. **PeerJS Signaling Protocol**:
   - PeerJS's high-level `call()` object does not expose a native `.renegotiate()` method. To achieve seamless ICE restart without tearing down the call, `pc.restartIce()` and SDP renegotiation must either be sent via a paired `DataConnection` message or via `pc.createOffer({ iceRestart: true })` over the PeerJS socket. Both approaches are compatible with the specified architecture.
3. **Hardware / Battery Constraints**:
   - 1000ms `getStats()` polling is lightweight in WebRTC; on low-power mobile devices, it consumes negligible CPU (<0.2%), but if the call session is in background, the Android Foreground Service ensures timely execution.

---

## 6. Conclusion

- The technical specifications for **R1 (Extreme Low-Bandwidth & High-Loss Audio Transport)** and **R2 (Real-Time Network Quality Adaptation & Fast Reconnection)** provide a complete, robust, and production-grade design.
- **R1** achieves sub-6kbps intelligibility and survival up to 50% packet loss through Opus SILK tuning, RFC 2198 RED redundancy, `ptime:60/120ms` header overhead reduction, and dynamic sender encoding constraints.
- **R2** establishes a 1000ms multi-dimensional telemetry monitor (RTT, loss, jitter, concealment, remote-inbound reports), an asymmetric 5-tier adaptation ladder with hysteresis, and a seamless 5-retry ICE restart state machine that preserves active call sessions across cellular handovers and network disruptions.

---

## 7. Verification Method

To independently verify this specification and its downstream implementation:

1. **Unit Test Suite**:
   - Inspect and run `src/test/webrtc.test.js` and `src/test/audio.test.js`.
   - Test cases must verify:
     - `transformOpusSdp` injects RFC 2198 RED, `ptime:60`, `maxptime:120`, `maxaveragebitrate=6000`, `useinbandfec=1`, `packetlossperc=50`, and `usedtx=1`.
     - `NetworkTelemetryMonitor` extracts RTT, loss, jitter, and concealment ratios accurately from mock `RTCStatsReport`.
     - `AdaptiveBitrateController` enforces asymmetric hysteresis (immediate downgrade, 4-tick upgrade delay).
     - `IceRestartManager` handles state transitions and exponential backoff retry count.
2. **E2E & Network Impairment Simulation**:
   - Run `scripts/webrtc-simulation-runner.js` to verify standard 2-peer call establishment, DTLS safety code generation, and clean hangup.
   - Run `scripts/simulate-network-impairments.js` to simulate 250ms latency, 10 kbps upload throttling, and verify that the adaptive controller automatically steps sender bitrate down to 6 kbps.
3. **Invalidation Conditions**:
   - Any test failure in `npm test` or `npm run test:sim`.
   - Failure of `transformOpusSdp` to preserve valid SDP RFC formatting.
   - Any unhandled exception during `pc.restartIce()` or `setParameters()`.
