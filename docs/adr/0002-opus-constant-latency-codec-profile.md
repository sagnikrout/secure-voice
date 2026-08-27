# ADR-0002: Opus codec profile and adaptive survival ladder

## Status
Accepted

## Context
Variable bitrate audio causes bandwidth spikes that overflow router queues on constrained cellular/satellite links, causing latency jitter and acoustic packet size leakage.

## Decision
We enforce a specialized Opus Constant Bitrate (CBR) and Wideband profile with In-Band FEC and an asymmetric adaptive ladder:
1. Deterministic packet sizes and uniform transmission timing.
2. Narrowband and wideband rate adaptation matching network link constraints.
3. Lock-step packetization time (`ptime=40`) reducing packet rate and protocol overhead.
4. Adaptive multi-tier ladder: Asymmetric step-down (instant 1-tick on loss) and step-up (4 sustained healthy ticks) with dynamic pacing.

## Consequences
### Positive
- High intelligibility under packet loss (up to 50%).
- Prevents bufferbloat and router queue starvation on satellite links.
- Mitigates acoustic traffic analysis from variable packet lengths.

### Negative and tradeoffs
- Audio frequency response is limited to voiceband in low-bandwidth survival tiers.
