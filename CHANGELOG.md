# Changelog

All notable changes to SecureVoice are documented in this file.

## [v3.7.5] - 2026-09-06

### Fixed (Android signaling reconnect cadence and lifecycle cleanup)
- Tightened ghost collision retry intervals to a 5-second polling cadence across 14 attempts (~70s total) to reclaim permanent IDs within seconds of the cloud signaling server clearing orphaned sockets.
- Added pagehide lifecycle event listener to ensure immediate WebSocket closure frame transmission during mobile WebView disposal.
- Pre-populated user peer ID from local storage during initial state initialization to prevent visual layout shifts and transient generating states.
- Guarded signaling close and disconnected event handlers against active retry timers to prevent spurious error state transitions.

## [v3.7.4] - 2026-09-06

### Fixed (signaling lifecycle and connection stability)
- Eliminated event listener memory leaks and race conditions during PeerJS client dismantling by explicitly removing all listeners before destroying stale instances, preventing dead instances from emitting spurious close or disconnected events into application state.
- Debounced automatic signaling reconnection to eliminate rapid thrashing between reconnecting and error states when socket disruptions occur.
- Implemented a progressive backoff retry schedule (3s to 12s) for temporary ghost collisions on server restarts, retaining the permanent ID while allowing the signaling mesh to clear orphaned sockets without app crashes.
- Added document visibility change listeners to gracefully restore signaling connections when the application returns from background on Android devices.

## [v3.7.3] - 2026-09-05

### Fixed (signaling and state)
- Resolved an edge case where force-quitting the app caused the user's permanent ID to be surrendered and regenerated upon restart. The app will now patiently back off and re-claim the exact same ID from the signaling server once the ghost connection times out, ensuring the ID never changes.

## [v3.7.2] - 2026-09-05

### Fixed (signaling and state)
- Resolved an issue where rapid page reloads caused PeerJS signaling ID collisions by properly terminating the WebSocket connection during the `beforeunload` lifecycle event.
- Ensured newly generated signaling IDs fallback and persist correctly to `localStorage` when collision-induced regeneration occurs.

## [v3.7.1] - 2026-09-05

### Changed (build tools and styling)
- Converted JavaScript build scripts (`vite.config.js`, `scripts/*.js`) to TypeScript executed via `tsx` to unify the repository's typing ecosystem.
- Replaced legacy viewport media queries (`@media`) with modern container queries (`@container`) in `src/index.css` for structurally decoupled responsive design.

## [v3.7.0] - 2026-09-05

### Added (audio processing and native platform integration)
- Dedicated `AudioWorkletProcessor` for real-time downward RMS noise gating (`src/utils/noiseGateWorklet.ts`), running on the dedicated Web Audio rendering thread to eliminate mic processing jitter during UI re-renders, with automatic fallback to the analytical filter in non-worklet environments.
- Reactive native Android `AudioDeviceCallback` in `AudioRoutingPlugin.java` emitting `audioDevicesChanged` events on hardware connection changes (Bluetooth SCO pairing, wired headsets), automatically refreshing available audio outputs in `useAudioDevices`.
- TypeScript declaration merging for W3C `RTCRtpReceiver` extensions (`playoutDelayHint`), removing untyped casts across the jitter buffer controller.

### Changed (styling and mobile integration)
- Modernized mobile layout in `src/index.css` with dynamic viewport unit `100dvh` and safe-area inset padding (`env(safe-area-inset-*)`) on app containers and modal overlays.
- Updated `index.html` viewport with `viewport-fit=cover` and added dynamic `theme-color` meta tags matching dark and light color schemes. Removed legacy debug error overlay scripts.

## [v3.6.3] - 2026-09-05

### Fixed (Android packaging)
- Removed invalid notification meta-data referencing non-existent `capacitor_default_color` resource in `AndroidManifest.xml` that caused AAPT resource linking failures during release packaging.
- Re-synchronized web bundle and verified clean local and CI Android resource processing.

## [v3.6.2] - 2026-09-05

### Changed (asymmetric link adaptation)
- Added `estimatedIncomingBitrate` to telemetry snapshots, calculated from inbound byte deltas to track downlink throughput.
- Evaluated worst-case directional jitter across both inbound (downlink) and remote RTCP (uplink) measurements, preventing high uplink jitter from being masked by clean download streams.
- Updated Lyra dynamic bitrate scaling to account for directional packet loss asymmetry. The encoder now steps down bitrate if the remote peer reports elevated outbound packet loss, preventing uplink bufferbloat even when raw upload bandwidth appears available.

## [v3.6.1] - 2026-09-05

### Changed (audio tuning for throttled mobile networks)
- Lyra v2 is now the default startup codec when WebAssembly SIMD is available. The app previously defaulted to `auto` mode (Opus-first), which is suboptimal for throttled Jio and similar post-cap mobile connections where Lyra consistently outperforms Opus.
- Lyra bitrate scaling thresholds lowered: 9.2 kbps quality is now reached at 10 kbps available bandwidth instead of 9.2 kbps, ensuring maximum Lyra fidelity is active on any throttled link with headroom.
- Codec crossover threshold restored to 14 kbps. Opus only activates after 8 consecutive seconds of clean network conditions (down from 4 seconds), preventing premature codec switching on momentarily stable throttled links.
- Jitter buffer defaults raised across all tiers to better absorb the variable packet delivery characteristic of throttled mobile connections (HQ: 120ms to 160ms, STD: 160ms to 200ms, LB: 200ms to 250ms, HL: 250ms to 300ms, EXT: 300ms to 350ms).

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

