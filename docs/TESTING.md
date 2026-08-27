# Testing

SecureVoice uses Vitest for unit and integration testing, Playwright for automated browser network simulations, and tsx benchmark scripts for audio and SDP verification.

## Test commands

| Type | Command | Scope |
| :--- | :--- | :--- |
| Unit and integration | `npm test` | All 17 suites in `src/test/` |
| Typecheck and build | `npm run build` | `tsc && vite build` |
| Resilience benchmark | `npm run benchmark` | `tsx scripts/benchmark-network-resilience.js` |
| Network simulation | `npm run test:network` | `tsx scripts/simulate-network-impairments.js` |

## Test files (`src/test/`)

- `App.test.tsx`: Root UI mounting and global keyboard handlers.
- `AudioSettingsModal.test.tsx`: Device selection dropdowns and routing triggers.
- `InfoModal.test.tsx`: Specs modal rendering and close actions.
- `RecentCalls.test.tsx`: Call history, missed call indicators, and dial buttons.
- `audio.test.ts`: Web Audio node graph, noise gate timers, and loopback recorder.
- `audioAdversarial.test.ts`: Fault handling for audio context failures and broken tracks.
- `audioAdversarialDeep.test.ts`: Boundary values for RMS levels and buffer edges.
- `audioAdversarialDynamics.test.ts`: Attack and release timing on gain nodes.
- `audioRouting.test.ts`: Output device routing and Android audio focus callbacks.
- `formatters.test.ts`: Peer ID formatting and duration timestamps.
- `iceRestart.test.ts`: Non-destructive ICE restarts and backoff retry logic.
- `networkAdaptation.test.ts`: Bitrate stepping, EMA smoothing, and hysteresis.
- `resilienceFeatures.test.ts`: Jitter buffer target clamping and DSCP packet marking.
- `useAudioDevices.test.ts`: Hardware device enumeration.
- `webrtc.test.ts`: SDP modification, RED injection, and safety code math.
- `webrtcAdversarial.test.ts`: Corrupted SDP strings and boundary bitrates.
- `webrtcStateAdversarial.test.ts`: Connection state race conditions and invalid calls.
