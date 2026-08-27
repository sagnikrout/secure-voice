# Performance and latency baseline

This document records the performance measurements derived from the SecureVoice automated network impairment benchmarks (`npm run benchmark`).

## 1. Quality crossover points

SecureVoice dynamically scales its audio engine across an adaptive ladder. The codec engine switches between **Google Lyra V2** (for low-bandwidth resilience) and **Opus Wideband HD** based on RTCPeerConnection statistics.

| Network profile | Target bitrate | Codec | Packet loss tolerance | Expected RTT latency |
| :--- | :--- | :--- | :--- | :--- |
| Broadband / LTE (HQ) | 8.0 - 14.0 kbps | Opus Wideband | < 1.5% | < 160ms |
| 3G / 2G stable (STD) | 6.5 kbps | Opus Narrowband | < 4.0% | < 280ms |
| 2G EDGE congested (LB) | 5.2 kbps | Lyra V2 Neural | < 8.0% | < 400ms |
| High loss (HL) | 4.5 kbps | Lyra V2 Neural | < 15.0% | < 600ms |
| Extreme survival (EXT) | 3.2 kbps | Lyra V2 Neural | up to 35% | up to 1200ms |

The crossover boundary occurs at 14 kbps headroom. Below 14 kbps, Lyra V2 is selected for bit efficiency.

## 2. Jitter buffer and packet resiliency

WebRTC clients handle jitter buffer sizing through NetEQ. SecureVoice configures the Session Description Protocol (SDP) to maintain resiliency under adversarial network conditions:

- **RFC 2198 redundancy (RED)**: RED is injected into the SDP (`useinbandfec=1`). This allows Opus and Lyra frames to bundle duplicate payload fragments of the preceding packet, covering up to 35% random packet loss without audio artifacts.
- **Constant bit rate (CBR)**: `cbr=1` is enforced when running in low-bandwidth survival tiers to prevent packet size spikes.
- **Packetization time (ptime)**: Ptime is scaled from 20ms in high-quality modes to 100ms in extreme mode, reducing IP/UDP/RTP header overhead.

## 3. Exponential moving average smoothing and hysteresis

To prevent rapid tier oscillation on unstable connections, the adaptive controller uses Exponential Moving Average (EMA) smoothing for RTT and packet loss.
- **Downgrade hysteresis**: 1 tick (1000ms). If network metrics degrade past a tier threshold, the system steps down immediately.
- **Upgrade hysteresis**: 4 ticks (4000ms). The system requires 4 consecutive seconds of stable metrics before upgrading the tier.
