# ADR-0003: Non-Destructive Fast Reconnection & ICE Circuit Breaker

## Status
**Accepted**

## Context
Transient link interruptions (e.g. cellular cell handovers, Wi-Fi to LTE transitions) cause WebRTC peer connections to enter disconnected states. Tearing down the entire call session creates jarring disconnections, destroys hardware audio contexts, and interrupts call duration timers. Conversely, retrying indefinitely on permanently severed networks wastes battery and causes reconnection storms.

## Decision
Implement a **Non-Destructive Fast Reconnection State Machine with Grace Monitoring and a Circuit Breaker**:
1. **1500ms Grace Period**: Allows transient connection dips to self-heal without triggering costly SDP renegotiation.
2. **Exponential Backoff**: Schedule `[1000, 2000, 4000, 6000, 8000]ms` across 5 retries.
3. **Preservation of Pipeline**: Keeps `AudioContext`, microphone tracks, and call duration running during recovery.
4. **Circuit Breaker Pattern**: Trips to `'open'` after 5 failures within 5 minutes, enforcing a 60-second cooldown before allowing `'half-open'` probe attempts.

## Consequences
### Positive
- Seamless recovery from transient mobile cell drops without restarting call UI.
- Prevents infinite retry loops and CPU/battery drain on dead networks.
- Emits structured diagnostics for telemetry and troubleshooting.

### Negative / Tradeoffs
- Requires synchronization of state machine across both local and remote peers.
