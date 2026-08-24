# Changelog

All notable changes to SecureVoice are documented in this file.

## [v3.2.0] - 2026-08-24

### Added
- Client-Side E2E Encrypted Signaling Layer using Web Crypto ECDH (P-256) and AES-256-GCM.
- Pluggable Transports subsystem including serverless Air-Gapped QR Code and Clipboard signaling (`SV1:...`).
- Dedicated P2P WebRTC DataChannel synchronization for instantaneous verbal safety code verification.
- Centralized `AudioResourceManager` preventing Web Audio parameter memory leaks and dangling node references.
- `IceRestartManager` circuit breaker preventing reconnection storms on dead networks.
- 9-tier extended bitrate ladder (1.2 kbps `ULTRA_LOW` to 24.0 kbps `HQ_PLUS`) with adaptive headroom packet pacing.
- Synthetic oscillator auditory feedback and speech accessibility announcements.

### Security & Hardening
- Hardened Content Security Policy (removed `unsafe-eval`, scoped `connect-src` to valid signaling & media endpoints).
- Disabled Android WebView mixed content (`allowMixedContent: false`).
- Updated Android package identifier to `io.github.sagnikrout.securevoice` to avoid ecosystem naming conflicts.
- Removed pinch-to-zoom restriction from viewport meta for WCAG 2.1 accessibility compliance.
- Removed tracked `.apk` binaries from git index in favor of signed GitHub Releases.

## [v3.1.0] - 2026-08-23

### Added
- Constant bitrate Opus encoding (`cbr=1`) to prevent packet size spikes and reduce queue bloat on cellular connections.
- 8 kHz SILK narrowband encoding (`maxplaybackrate=8000`) for low-bandwidth operation between 3.2 and 8.0 kbps.
- Packet aggregation (`ptime=80..100`, `maxptime=120`) dropping packet rate to 10–12.5 pkts/sec and cutting header overhead by 80%.
- Dynamic NetEQ jitter buffer floor (`RTCRtpReceiver.jitterBufferTarget`) from 120ms (HQ) to 400ms (Ultra) to prevent audio pitch-shifting.
- Traffic shaping and packet pacer with DSCP Expedited Forwarding markings and 85% bandwidth headroom allocation.
- Adaptive TURN manager that ranks relay servers by ping latency and forces relay fallback after repeated P2P failures.
- 6-stage Web Audio pipeline: 80Hz highpass, 2.8kHz peaking EQ, 4.2kHz lowpass, noise gate (-46 dBFS), compressor, and makeup gain.
- TypeScript migration with strict type coverage across WebRTC helpers, audio DSP nodes, and telemetry controllers.

## [v3.0.1] - 2026-08-16

### Added
- Live codec bitrate readout in WebRTC stats overlay.
- Descriptive error messages for failed calls and permission denials.
- Atomic microphone switching with automatic rollback if acquiring the new device fails.
- 5-second rate limit between incoming calls from the same peer to prevent ringing spam.

### Fixed
- AudioContext teardown during mid-call mic changes that previously dropped the call audio.
- Missing busy state response when receiving a second call while already in an active call.
- Oscillator memory leak during ringtone playback.
- Regex parsing for DTLS-SRTP fingerprints across varied SDP formats.
- Android foreground service initialization on cold start.

## [v3.0.0] - 2026-08-16

### Added
- Direct WebRTC DTLS-SRTP peer-to-peer audio encryption with zero relay servers by default.
- 5-digit verbal safety code generated from DTLS fingerprints for verifying connection integrity.
- In-call audio routing between loudspeaker, earpiece, wired headsets, and Bluetooth devices.
- Android APK packaging using Capacitor with foreground notification and wake lock support.
- Responsive dark and light theme interface.

## [v2.10.0] - 2026-08-10

### Added
- Initial WebRTC audio implementation with SDP munging.
- Basic 80Hz highpass filter and simple noise gate.
- Capacitor wrapper for Android builds.
