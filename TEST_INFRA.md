# E2E Test Infra: SecureVoice

## Test Philosophy
- Opaque-box, requirement-driven testing covering extreme network degradation.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Interaction + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | 6-Stage Web Audio Denoise & Voice Isolation | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 2 | Mic Stream Management & Cleanup | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 3 | Dynamic Opus SDP Munging | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | RFC 2198 RED Audio Redundancy | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 5 | Sender Encoding Priority & DSCP | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 6 | Real-Time Telemetry Monitor | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | 5-Tier Adaptive Bitrate Ladder | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 8 | Seamless ICE Restart & Fast Reconnection | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Cross-Platform Benchmark Harness | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 10 | 5-Profile Network Impairment Suite | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 11 | Unit & Integration Test Matrix | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 12 | End-to-End Verification & Coverage Hardening | ORIGINAL_REQUEST Acceptance | 5 | 5 | ✓ |

## Test Architecture
- **Unit & Integration Test Runner**: `vitest run`
  - Location: `src/test/`
  - Test suites: `audio.test.js`, `webrtc.test.js`, `networkAdaptation.test.js`, `iceRestart.test.js`, `audioRouting.test.js`, `formatters.test.js`, `useAudioDevices.test.js`, `AudioSettingsModal.test.jsx`, `InfoModal.test.jsx`, `RecentCalls.test.jsx`, `App.test.jsx`.
- **E2E & Network Impairment Simulation Runner**: `node scripts/simulate-network-impairments.js` and `node scripts/webrtc-simulation-runner.js`
  - Automated 2-peer call establishment, audio flow verification, simulated CDP network impairments, ICE restart trigger, and telemetry checks.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Sub-6kbps Bandwidth Throttling (6kbps uplink / 8kbps downlink) | F3, F5, F6, F7 | High |
| 2 | Extreme Burst Packet Loss (30%–50% packet loss) | F3, F4, F6, F7 | High |
| 3 | High Latency (800ms RTT) & Jitter (100ms) with Voice Formants | F1, F6, F7 | High |
| 4 | Network Interruption & Seamless ICE Restart (Wi-Fi to Cellular) | F8, F6 | High |
| 5 | Noisy Environment Mic Pre-Processing & Voice Isolation | F1, F2 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature (baseline functionality).
- Tier 2: ≥5 test cases per feature (boundaries, extreme loss, minimum bitrates, null handling).
- Tier 3: Pairwise coverage of major feature interactions (e.g. noise gate + low bitrate, packet loss + RED negotiation).
- Tier 4: ≥5 realistic application scenarios.
