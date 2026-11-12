# Testing

SecureVoice uses Vitest for unit and integration testing, Playwright for automated browser network simulations, and tsx benchmark scripts for audio and SDP verification.

## Test commands

| Type | Command | Scope |
| :--- | :--- | :--- |
| Unit and integration | `npm test` | All 30 test files (443 tests) in `src/test/` |
| Typecheck and build | `npm run build` | `tsc && vite build && tsx scripts/generate-sri.ts` |
| Dependency check | `npm run check:deps` | `tsx scripts/validate-dependencies.ts` |
| Resilience benchmark | `npm run benchmark` | `tsx scripts/benchmark-network-resilience.ts` |
| Network simulation | `npm run test:network` | `tsx scripts/simulate-network-impairments.ts` |
| WebRTC simulation | `npm run test:sim` | `tsx scripts/webrtc-simulation-runner.ts` |

## Test files (`src/test/`)

- `App.test.tsx`: Root UI mounting, theme detection, and input validation.
- `AudioSettingsModal.test.tsx`: Device selection dropdowns and audio test chime triggers.
- `RecentCalls.test.tsx`: Call history, missed call indicators, and dial buttons.
- `audio.test.ts`: Web Audio node graph, noise gate timers, and loopback recorder.
- `audioAdversarial.test.ts`: Fault handling for audio context failures and broken tracks.
- `audioAdversarialDeep.test.ts`: Boundary values for RMS levels and buffer edges.
- `audioAdversarialDynamics.test.ts`: Attack and release timing on gain nodes.
- `audioPipelineBenchmark.test.ts`: Frame execution latency benchmarks and performance constraints.
- `audioProfiles.test.ts`: DSP parameter validation for acoustic profile presets.
- `audioRouting.test.ts`: Output device routing and Android audio focus callbacks.
- `auditoryFeedback.test.ts`: Synthesized audio tones and state notifications.
- `callPeerCoordinator.test.ts`: Peer connection state management and call coordination.
- `chaosEngineering.test.ts`: Extreme packet loss and network chaos resilience.
- `circuitBreaker.test.ts`: ICE restart rate limiting and circuit breakers.
- `coreEngine.test.ts`: Integrated TelecomEngine and AudioEngine orchestration.
- `e2eSignaling.test.ts`: End-to-end encrypted signaling envelopes and ephemeral forward secrecy teardown.
- `formatters.test.ts`: Peer ID formatting, duration timestamps, and safety codes.
- `fuzzing.test.ts`: Randomized fuzz testing for SDP munging and safety code generation.
- `iceRestart.test.ts`: Non-destructive ICE restarts and backoff retry logic.
- `networkAdaptation.test.ts`: Bitrate stepping, EMA smoothing, and hysteresis.
- `neuralPipeline.test.ts`: Official upstream RNNoise v0.2 WebAssembly neural noise suppression pipeline.
- `qrCode.test.ts`: Optical air-gapped QR code URI encoding and payload parsing.
- `resilienceFeatures.test.ts`: Jitter buffer target clamping and DSCP packet marking.
- `resourceManager.test.ts`: Web Audio context and node lifecycle tracking.
- `signalingTransports.test.ts`: Pluggable signaling transports and anti-downgrade protections.
- `structuredLogger.test.ts`: Structured diagnostic event logging and production silencing.
- `useAudioDevices.test.ts`: Hardware device enumeration.
- `webrtc.test.ts`: SDP modification, RED injection, and safety code math.
- `webrtcAdversarial.test.ts`: Corrupted SDP strings and boundary bitrates.
- `webrtcStateAdversarial.test.ts`: Connection state race conditions and invalid calls.
