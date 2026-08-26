# Adaptive codec engine

This document specifies the internal behavior of the SecureVoice network adaptation and codec switching engine.

## Codec crossover logic
SecureVoice operates a dual-codec architecture, dynamically switching between Google Lyra V2 and Opus Wideband HD based on real-time network telemetry.

### Telemetry thresholds
The engine monitors the RTCPeerConnection statistics every 1000 milliseconds.

1. **Lyra fallback triggers (Low bandwidth mode)**
   The connection drops to Lyra V2 (3.2 kbps) if any of the following conditions are met:
   - Available outbound bitrate headroom falls below 14 kbps.
   - Packet loss exceeds 4 percent.
   - Round trip time (RTT) exceeds 280 milliseconds.

2. **Opus escalation triggers (High definition mode)**
   The connection elevates to Opus Wideband HD only when a stable broadband link is sustained for 4 consecutive seconds, defined as:
   - Available outbound bitrate headroom is greater than or equal to 14 kbps.
   - Packet loss remains below 1.5 percent.
   - RTT remains below 160 milliseconds.

## Fallback and graceful degradation matrices
1. **WebAssembly failure**: If the environment lacks WebAssembly SIMD hardware support required by Lyra V2, the engine permanently locks to Opus regardless of network constraints to prevent runtime execution faults.
2. **STUN/TURN failover**: If host-level UDP hole punching fails, the connection falls back to symmetric TURN relays. TURN relay utilization does not alter the codec crossover logic directly, but typically introduces higher RTT which forces Lyra mode.
3. **Hardware constraints**: If device CPU utilization triggers thermal throttling, the neural transcoding pipeline may introduce latency. Currently, SecureVoice does not automatically degrade to Opus in response to local CPU stress; it relies strictly on network telemetry.
