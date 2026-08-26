# Performance and Latency Baseline

This document formalizes the empirical findings derived from the SecureVoice automated network impairment benchmarks (\
pm run benchmark\). 

## 1. Quality Crossover Points

SecureVoice dynamically scales its audio engine across a 5-tier adaptive ladder. The codec engine switches between **Google Lyra V2** (for extreme low-bandwidth resilience) and **Opus Wideband HD** based on RTCPeerConnection statistics.

| Network Profile | Target Bitrate | Codec | Packet Loss Tolerance | Expected RTT Latency |
| :--- | :--- | :--- | :--- | :--- |
| **Broadband / LTE (HQ)** | 8.0 - 12.0 kbps | Opus Wideband | < 1.5% | < 160ms |
| **3G / 2G Stable (STD)** | 6.5 kbps | Opus Narrowband | < 4.0% | < 280ms |
| **2G EDGE Congested (LB)** | 5.2 kbps | Lyra V2 Neural | < 8.0% | < 400ms |
| **High Loss (HL)** | 4.5 kbps | Lyra V2 Neural | < 15.0% | < 600ms |
| **Extreme Survival (EXT)** | 3.2 kbps | Lyra V2 Neural | up to 35% | up to 1200ms |

*The crossover boundary occurs strictly at **14 kbps** headroom. Below 14 kbps, Lyra V2 outperforms Opus bit-for-bit.*

## 2. Jitter Buffer and Packet Resiliency

WebRTC clients internally handle jitter buffer sizing (NetEQ for audio), but SecureVoice aggressively tunes the Session Description Protocol (SDP) to optimize this buffer's resiliency under adversarial network conditions:

- **RFC 2198 Redundancy (RED)**: We inject RED into the SDP (useinbandfec=1). This allows the Opus and Lyra frames to bundle duplicate payload fragments of the preceding packet, seamlessly covering up to 35% random packet loss without artifacting.
- **Constant Bit Rate (CBR)**: cbr=1 is enforced. By keeping the packet sizes constant, the jitter buffer can estimate the network pipe size much faster, minimizing the time to stabilize after an ICE restart.
- **Packetization Time (ptime)**: Ptime is scaled from 20ms in High-Quality to 100ms in Extreme mode, drastically reducing IP/UDP/RTP header overhead and allowing the jitter buffer to digest larger, but fewer, chunks.

## 3. EMA Smoothing and Hysteresis

To prevent the codec from rapidly alternating (flapping) between tiers on unstable connections, the adaptive controller uses Exponential Moving Average (EMA) smoothing for RTT and packet loss.
- **Downgrade Hysteresis**: 1 tick (1000ms). If the network drops below the threshold, the system degrades instantly.
- **Upgrade Hysteresis**: 4 ticks (4000ms). The system requires 4 consecutive seconds of stable metrics before upgrading the tier, preventing temporary bandwidth spikes from disrupting the audio stream.
