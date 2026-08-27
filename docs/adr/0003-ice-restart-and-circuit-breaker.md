# ADR-0003: Fast reconnection and ICE circuit breaker

## Status
Accepted

## Context
Transient link interruptions (such as cellular cell handovers or Wi-Fi to LTE transitions) cause WebRTC peer connections to enter disconnected states. Tearing down the entire call session creates jarring disconnections, destroys hardware audio contexts, and interrupts call duration timers. Conversely, retrying indefinitely on permanently severed networks wastes battery and causes reconnection storms.

## Decision
Implement a fast reconnection state machine with grace monitoring and a circuit breaker:
1. 1500ms grace period: Allows transient connection dips to self-heal without triggering costly SDP renegotiation.
2. Exponential backoff: Schedule `[1000, 2000, 4000, 6000, 8000]ms` across 5 retries.
3. Preservation of pipeline: Keeps `AudioContext`, microphone tracks, and call duration running during recovery.
4. Circuit breaker pattern: Trips to `'open'` after 5 failures within 5 minutes, enforcing a 60-second cooldown before allowing `'half-open'` probe attempts.

## Consequences
### Positive
- Seamless recovery from transient mobile cell drops without restarting call UI.
- Prevents infinite retry loops and CPU/battery drain on dead networks.
- Emits structured diagnostics for telemetry and troubleshooting.

### Negative and tradeoffs
- Requires synchronization of state machine across both local and remote peers.
