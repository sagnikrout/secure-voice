# ADR-0004: Centralized Client-Side Web Audio Resource Management

## Status
**Accepted**

## Context
Complex Web Audio DSP pipelines (filters, noise gates, compressors, analysers) and MediaStream tracks can leak memory or remain active in browser heap if not cleanly disconnected and stopped prior to `AudioContext` teardown, particularly during rapid device switching or frequent calls.

## Decision
Introduce [`AudioResourceManager`](file:///c:/Users/sagni/OneDrive/Desktop/Secure%20Voice/src/utils/resourceManager.ts) as a centralized lifecycle manager:
1. **Explicit Tracking**: Registers every created `AudioContext`, connected `AudioNode`, and active `MediaStreamTrack`.
2. **Deterministic Cleanup**: Cancels scheduled `AudioParam` automations, disconnects all node graphs, halts hardware media tracks, and closes contexts.
3. **Atomic Device Switching**: Integrates with device switching to cleanly dispose of superseded audio pipelines while retaining call state.

## Consequences
### Positive
- Zero memory leakage across hundreds of consecutive call connections and device swaps.
- Prevents microphone hardware indicators from lingering after call termination.
- Diagnostic statistics (`getStats()`) enable automated memory leak verification in CI.

### Negative / Tradeoffs
- Audio components must explicitly register dynamically allocated nodes with the manager.
