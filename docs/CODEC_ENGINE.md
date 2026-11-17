# Codec and network adaptation

SecureVoice configures WebRTC audio and adjusts selected transmission settings using connection statistics. Browser implementations differ, and not every SDP setting is honored on every platform. The values in source are configuration targets, not guaranteed wire behavior.

## Implementation locations

- src/constants/config.ts: codec defaults, adaptation profiles, and thresholds.
- src/core/telecomEngine.ts: call and peer-connection coordination.
- src/utils/networkAdaptation.ts: statistics evaluation and adaptation decisions.
- src/utils/webrtc.ts: SDP helper functions.
- src/test/networkAdaptation.test.ts and src/test/webrtc.test.ts: related tests.

## Adaptation inputs

The implementation reads WebRTC statistics, including packet loss and connection timing where the browser exposes them, and compares them with configured thresholds. It uses smoothing and separate downgrade/upgrade behavior to reduce rapid profile changes. Exact behavior is determined by the current code and tests, not by a fixed network-tier guarantee.

## Audio resilience

The application configures Opus options such as bitrate, packetization, discontinuous transmission, and in-band forward error correction. Some settings are expressed through SDP and may be ignored or interpreted differently by a browser. Do not assume a particular bitrate, packet-loss recovery rate, or audio quality on a given connection.

## Testing changes

When changing codec or adaptation behavior:

1. Update the relevant configuration and focused tests together.
2. Run npm test and npm run build.
3. If network behavior changed, run npm run test:network and/or npm run test:sim.
4. Describe benchmark conditions and device/browser details when reporting results. A simulation is not a substitute for real network measurements.
