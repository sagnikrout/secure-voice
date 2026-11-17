# Architecture decision records

These records capture design choices and their tradeoffs. They describe the rationale at the time each decision was made; current implementation details should be checked in source and tests.

| ADR | Decision |
| --- | --- |
| [0001](0001-use-webrtc-p2p-dtls-srtp.md) | Use WebRTC and DTLS-SRTP for media. |
| [0002](0002-opus-constant-latency-codec-profile.md) | Configure Opus for voice and adapt settings to connection conditions. |
| [0003](0003-ice-restart-and-circuit-breaker.md) | Attempt connection recovery before ending a call. |
| [0004](0004-client-side-audio-resource-manager.md) | Track and clean up client audio resources. |
| [0005](0005-pluggable-e2e-encrypted-signaling.md) | Separate signaling transport from call coordination and support encrypted messages. |
