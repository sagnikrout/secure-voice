# ADR-0004: Client-side audio resource management

## Status
Accepted

## Context
Web Audio DSP pipelines (filters, noise gates, compressors, analysers) and MediaStream tracks can leak memory or remain active in browser heap if not cleanly disconnected and stopped prior to `AudioContext` teardown, particularly during rapid device switching or frequent calls.

## Decision
Introduce `AudioResourceManager` as a centralized lifecycle manager:
1. Explicit tracking: Registers every created `AudioContext`, connected `AudioNode`, and active `MediaStreamTrack`.
2. Deterministic cleanup: Cancels scheduled `AudioParam` automations, disconnects all node graphs, halts hardware media tracks, and closes contexts.
3. Atomic device switching: Integrates with device switching to cleanly dispose of superseded audio pipelines while retaining call state.

## Consequences
### Positive
- Zero memory leakage across consecutive call connections and device swaps.
- Prevents microphone hardware indicators from lingering after call termination.
- Diagnostic statistics (`getStats()`) enable automated memory leak verification in CI.

### Negative and tradeoffs
- Audio components must explicitly register dynamically allocated nodes with the manager.
