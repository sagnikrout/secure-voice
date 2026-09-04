# Changelog

All notable changes to SecureVoice are documented in this file.

## [v3.6.0] - 2026-09-04

### Fixed (Android stability)
- Added `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` to foreground service declaration, fixing a `SecurityException` crash on Android 14+.
- Added missing permissions: `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`.
- Created native notification channel in `MainActivity.onCreate()` to prevent crashes when the OS restarts the service before the WebView loads.
- Added `BLUETOOTH_CONNECT` runtime permission guard to `AudioRoutingPlugin.java` to prevent crashes on Android 12+.
- Added `network_security_config.xml` for explicit TLS enforcement.
- Hardware back button now minimizes the app instead of destroying it, preserving the WebRTC connection.

### Fixed (Call reliability)
- Eliminated re-instantiation of `AdaptiveBitrateController`, `JitterBufferController`, `PacketPacer`, and `TurnRelayManager` on every React render (lazy initialization pattern).
- Fixed stale closure in the telemetry callback that broke codec crossover logic after dynamic codec switches.
- Added race condition guard to `acquireMicrophone()` preventing concurrent `getUserMedia` calls from leaking orphaned mic streams.
- Safety code computation interval is now properly cleared on early call drops.
- All unmanaged `setTimeout` calls in `bindCallEvents` are now tracked and cleared in `endCall()`.
- Remote `track.onended` now uses a 2-second debounce to prevent false-positive hangups during WebRTC renegotiation.
- Fixed `usePeer` reconnection timeout leak on component unmount.
- Fixed `useAudioDevices` setState-after-unmount memory leak.
- Auditory feedback tones now cancel pending sequences before starting new ones, preventing overlapping sounds.
- Theme hook now listens for OS dark/light mode changes in real time.

### Improved (UX)
- Widened app shell from 380px to 480px for modern phone screens.
- Increased all header button touch targets from 32px to 40px.
- Increased Recent Calls action buttons from 28px to 36px.
- Increased Copy button and Close button touch targets to meet 44px mobile minimum.
- Restructured incoming call modal: Answer button is now full-width on top, Decline and Block are side-by-side below.
- Responsive breakpoint raised from 340px to 440px so all phone screens get the mobile-optimized layout.
- Audio visualizer canvas now scales by `devicePixelRatio` for crisp rendering on high-DPI displays.
- WebRTC stats grid uses responsive `auto-fit` layout instead of hardcoded 3-column grid.
- Security verification modal buttons meet 44px touch target minimum.

## [v3.5.2] - 2026-08-29

### Added
- Implemented native local notifications (`@capacitor/local-notifications`) for incoming calls to allow users to answer from outside the app without compromising P2P privacy.

### Fixed
- Removed accidentally reintroduced "info" button and dead `InfoModal` code.
- Synchronized Android `versionName` and `versionCode` in Gradle configs.

## [v3.5.1] - 2026-08-29

### Changed
- Repository hygiene: removed legacy IDE configuration folders and consolidated .github community health files.
- Removed redundant individual release notes in favor of a unified CHANGELOG.
- Cleaned up remote GitHub release history.

## [v3.5.0] - 2026-08-26

### Added
- Google Lyra v2 neural speech codec integration (SoundStream and LyraGAN architecture) operating at 3.2 kbps for sub-1 kB/s wideband voice calling.
- WebAssembly 128-bit SIMD capability detection and off-thread neural worker (`lyraWorker.ts`).
- WebRTC Encoded Transform (`RTCRtpScriptTransform` / `createEncodedStreams`) pipeline with magic frame header serialization and sequence tracking.
- Autoregressive generative neural Packet Loss Concealment (PLC) synthesizing missing frames without NetEQ pitch-shifting.
- Low-latency 16 kHz polyphase AudioWorklet resampler and 20ms (320-sample) ring-buffered framing (`lyraAudioWorklet.ts`).
- Voice Codec Engine selector in audio settings modal and live diagnostics overlay displaying neural data rates and PLC synthesis metrics.
- Automatic graceful fallback to Opus SILK on legacy or non-SIMD client runtimes.

## [v3.4.0] - 2026-08-26

### Added
- Opus Wideband HD Voice engine (16 kHz sampling, Variable Bit Rate, 14 kbps Pareto optimal bitrate).
- 40ms lock-step packetization (`ptime=40`, `maxptime=60`) reducing RTP packet header overhead by 50%.
- Dual-clamped playout delay control setting both `RTCRtpReceiver.jitterBufferTarget` and `RTCRtpReceiver.playoutDelayHint` for constant deterministic latency.
- Ingest audio conditioning with 48 kHz high-fidelity microphone capture constraints.
- Extended Web Audio DSP pipeline with 8.5 kHz lowpass filter, 2.8 kHz (+2.0 dB) voice formant presence EQ, and smoothed dynamics compressor.
- Synchronous startup pacing with DSCP Expedited Forwarding (DiffServ 46) prioritization.

### Fixed
- Fixed `RTCPeerConnection` constructor crash caused by empty username or password on TURN server entries when environment variables are unset.
- Configured default OpenRelay credentials fallback (`openrelayproject`) for public TURN servers.
- Added defensive validation in `TurnRelayManager` to filter unauthenticated TURN servers before passing configuration to WebRTC.

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
- Packet aggregation (`ptime=80..100`, `maxptime=120`) dropping packet rate to 10 to 12.5 pkts/sec and cutting header overhead by 80%.
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

