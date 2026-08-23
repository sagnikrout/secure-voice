# ADR-0002: Opus Constant Bitrate (CBR) & Adaptive Survival Ladder

## Status
**Accepted**

## Context
Variable bitrate audio causes bandwidth spikes that overflow router queues on constrained cellular/satellite links, causing latency jitter and acoustic packet size leakage.

## Decision
We enforce a specialized **Opus Constant Bitrate (CBR) profile with In-Band FEC and an asymmetric adaptive ladder**:
1. **CBR Mode (`cbr=1`)**: Guarantees deterministic packet sizes and uniform transmission timing.
2. **Narrowband SILK Limit (`maxplaybackrate=8000`)**: Focuses 100% of the bit budget on human speech intelligibility.
3. **80ms / 100ms Packetization (`ptime=80`)**: Reduces packet transmission rate to ~12.5 pkts/sec, decreasing IP/UDP/RTP protocol overhead.
4. **Adaptive Multi-Tier Ladder**: Asymmetric step-down (instant 1-tick on loss) and step-up (4 sustained healthy ticks) with dynamic pacing.

## Consequences
### Positive
- High intelligibility under extreme packet loss (up to 50%+).
- Prevents bufferbloat and router queue starvation on satellite links.
- Mitigates acoustic traffic analysis from variable packet lengths.

### Negative / Tradeoffs
- Audio frequency response is limited to voiceband (8 kHz / narrowband) unless in wideband mode (`HQ_PLUS`).
