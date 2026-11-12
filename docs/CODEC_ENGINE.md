# Adaptive Codec & Network Engine

This document specifies the internal behavior of the SecureVoice network adaptation and adaptive Opus codec ladder.

## Codec Architecture
SecureVoice uses Opus Fullband / Wideband VBR paired with real-time hardware-accelerated RNNoise v0.2 WebAssembly neural noise suppression. It dynamically scales transmission parameters based on real-time network telemetry.

### Telemetry Sampling
The engine polls `RTCPeerConnection` statistics every 1000 milliseconds to calculate:
- Round Trip Time (RTT) in milliseconds
- Packet loss fraction and total packets lost
- Playout jitter in milliseconds
- Sample concealment ratio

### 6-Tier 2G/Satellite Survival Ladder

| Tier | Name | Target Bitrate | Bandwidth Cap | Packetization (`ptime`) | FEC Loss Ratio | DTX State |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | `HQ` (2G Stable) | 8.0 kbps | 10.0 kbps | 40 ms | 15% | Disabled (continuous voice) |
| **1** | `STD` (2G Normal) | 6.5 kbps | 8.0 kbps | 40 ms | 20% | Disabled |
| **2** | `LB` (2G Congested) | 5.2 kbps | 7.0 kbps | 60 ms | 30% | Enabled (silence suppression) |
| **3** | `HL` (2G High Loss) | 4.5 kbps | 6.0 kbps | 80 ms | 45% | Enabled |
| **4** | `EXT` (2G Extreme) | 3.2 kbps | 5.0 kbps | 100 ms | 55% | Enabled |
| **5** | `MIN` (Emergency Floor) | 2.4 kbps | 4.0 kbps | 100 ms | 65% | Enabled |

Broadband profiles (Wi-Fi, 4G, 5G) operate at Tier 10 (`BROADBAND_HQ`, 40 kbps, 48 kHz Fullband HD) and Tier 11 (`BROADBAND_STD`, 24 kbps, 48 kHz HD).

### Adaptation Dynamics & Hysteresis
To prevent rapid flapping on unstable wireless links:
1. **Downgrade Response**: 1 tick (1000 ms). If packet loss or RTT exceeds tier thresholds, the engine immediately drops to a lower tier to preserve connection stability.
2. **Upgrade Hysteresis**: 8 ticks (8000 ms). Upgrades require 8 consecutive seconds of stable metrics below the target tier threshold.
3. **EMA Metric Smoothing**: RTT, packet loss, and jitter are filtered using Exponential Moving Averages (`alpha = 0.25`) to resist transient packet spikes.

## Packet Loss Concealment & Playout Resilience
1. **RFC 2198 Redundancy (RED)**: Active by default with dynamic payload type 63. Bundles redundant payload fragments of preceding packets to survive up to 50% random packet loss without audible clipping.
2. **Opus In-band FEC**: Configured via SDP munging (`useinbandfec=1`) with dynamically scaled packet loss percentages up to 65%.
3. **Dual-Clamped Jitter Buffer**: Clamps `jitterBufferTarget` and `playoutDelayHint` to prevent NetEQ pitch-shifting artifacts on high-jitter networks.
