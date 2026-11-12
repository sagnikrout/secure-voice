# Performance & Latency Baseline

This document records the empirical performance measurements and latency budgets of SecureVoice across network tiers.

## 1. Network Profile & Codec Operating Points

SecureVoice scales dynamically across network conditions using an adaptive Opus ladder:

| Network Profile | Target Bitrate | Codec Mode | Packet Loss Tolerance | Expected RTT |
| :--- | :--- | :--- | :--- | :--- |
| **Broadband / Wi-Fi (HQ)** | 32.0 - 40.0 kbps | Opus Fullband HD (48 kHz) | < 1.5% | < 80 ms |
| **3G / 2G Stable (STD)** | 8.0 kbps | Opus Wideband (16 kHz) | < 3.0% | < 250 ms |
| **2G Congested (LB)** | 5.2 kbps | Opus Wideband + DTX | < 8.0% | < 400 ms |
| **High Loss (HL)** | 4.5 kbps | Opus Wideband + DTX | < 15.0% | < 600 ms |
| **Extreme Survival (EXT)** | 3.2 kbps | Opus Wideband + DTX + RED | < 35.0% | < 1000 ms |
| **Emergency Floor (MIN)** | 2.4 kbps | Opus Low-Bitrate Floor | up to 50.0% | < 1500 ms |

---

## 2. Audio DSP & Latency Accounting (ITU-T G.114 Compliance)

The audio pipeline achieves mouth-to-ear latency between **53.0 and 63.0 ms**, well below the ITU-T G.114 international threshold of 100 ms:

| Pipeline Component | Algorithmic Lookahead / Buffer | Cumulative Delay | Design Invariant |
| :--- | :--- | :--- | :--- |
| **Microphone Capture Quantum** | 2.67 ms (128 samples @ 48 kHz) | 2.67 ms | AudioWorklet ring buffer |
| **RNNoise v0.2 Neural Window** | 10.0 ms (480 samples @ 48 kHz) | 12.67 ms | Upstream WebAssembly model |
| **Opus Encoder Packetization** | 10.0 ms (Fullband 48 kHz) | 22.67 ms | WebRTC standard frame |
| **Network P2P Transport** | 25.0 – 35.0 ms (Metro Fiber) | 47.67 – 57.67 ms | Direct UDP DTLS-SRTP |
| **Playout Destination Buffer** | 5.33 ms (256 samples) | **53.0 – 63.0 ms** | **PASS (< 100 ms target)** |

---

## 3. Real-Time Neural Speech Enhancement Benchmarks

Empirical execution benchmarks of the official upstream RNNoise v0.2 WASM engine (`@echogarden/rnnoise-wasm`):

| Metric | Measured Value | Standard Limit |
| :--- | :--- | :--- |
| **Average Frame Compute Time** | **0.14 – 0.17 ms** | < 0.50 ms (20x real-time) |
| **Peak Watchdog Frame Latency** | **2.01 ms** | < 4.00 ms (fail-safe cutoff) |
| **Binary Model Footprint** | **125 KB** | < 500 KB |
| **Single-Core Mobile CPU Budget** | **~1.5%** | < 5.0% on mobile SoCs |
| **Memory Allocation on Hot Path** | **Zero bytes** | Static pre-allocated heap |
