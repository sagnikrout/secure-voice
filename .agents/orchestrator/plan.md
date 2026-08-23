# Orchestration Plan — SecureVoice

## Goal
Build production-ready, ultra-resilient voice calling for SecureVoice under extreme network degradation (sub-6kbps, 30–50% packet loss, high latency/jitter, packet duplication/RED, dynamic WebRTC SDP/Opus tuning, network adaptation, ICE reconnection, Web Audio pre-processing pipeline, and full test/benchmark suite).

## Phases
1. **Phase 0: Survey**
   - Explorer 1: Project structure, dependencies, package.json, build system, existing code/tests.
   - Explorer 2: WebRTC transport, SDP munging, Opus parameter tuning (FEC, DTX, bitrates, ptime, RED/duplication), network stats monitoring & adaptation, ICE restart / fast reconnection.
   - Explorer 3: Audio pre-processing pipeline (Web Audio API, highpass, bandpass, dynamic compression, gain, noise gating/voice isolation), benchmark scripts & test harness.
2. **Phase 1: Architecture & Decomposition**
   - Synthesize survey findings into `PROJECT.md` with Feature Inventory, Milestones, and Interface Contracts.
   - Setup `TEST_INFRA.md` for the E2E Testing Track.
3. **Phase 2: Milestone Execution (Implementation & E2E Testing Tracks)**
   - Milestone 1: Audio Pre-Processing & Voice Isolation Pipeline.
   - Milestone 2: Extreme Low-Bandwidth & High-Loss Audio Transport (Opus tuning, dynamic FEC/DTX/bitrate, RED packet duplication).
   - Milestone 3: Network Quality Adaptation Engine & Seamless Reconnection / ICE Restart.
   - Milestone 4: Automated Impairment Benchmarks & Comprehensive Unit/Integration Test Suite.
   - Final Milestone: Pass 100% E2E tests, clean build, and adversarial coverage hardening.
4. **Phase 3: Verification & Reporting**
   - Full test run, benchmark validation, build check.
   - Handoff and completion report to Sentinel.
