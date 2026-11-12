# Changelog

All notable changes to SecureVoice are documented in this file.

## [v3.8.2] - 2026-11-12

### Changed & Improved
- **85% Smaller Download**: Shrunk release APK from 15.05 MB to 2.3 MB by removing unused mockups.
- **Smart AI Noise Removal**: Added real-time RNNoise v0.2 neural noise reduction inside Web Audio threads.
- **Audio Presets**: Added four sound profiles: Standard, Voice Boost, Studio Clean, and Voice Isolation.
- **Temporary Security Keys**: Added disposable ECDH session keys that erase automatically when calls end.
- **Anti-Downgrade Protection**: Blocks unencrypted call signals to prevent eavesdropping attacks.
- **Battery-Saving Dark Theme**: Added pure black AMOLED dark mode to save battery on OLED screens.
- **Unified Audio Settings**: Combined microphone testing, output switching, and speaker tests into one simple menu.
- **Instant Busy Feedback**: Plays an immediate busy tone when dialing an offline or unreachable user.
- **Air-Gapped QR Invites**: Added QR code invites to start calls without cloud signaling servers.
- **Android 9.0+ Baseline**: Set minimum Android version to 9.0 (API 28) for reliable background calling.
- **Modern CI/CD**: Upgraded automated build workflows to Ubuntu 24.04 and Node 24.

## [v3.8.1] - 2026-09-11

### Added
- **System Theme Sync**: Automatically switches between dark and light modes matching device settings.
- **Automated Testing**: Added end-to-end calling tests between Android emulators and web browsers.

### Fixed
- **UI Consistency**: Formatted version badges in clean lowercase across all screens.
- **Storage Cleanup**: Removed duplicate asset files to reduce repository storage footprint.

## [v3.8.0] - 2026-09-06

### Added
- **Background Call Persistence**: Added Android foreground service with notification to prevent background call drops.
- **Service Watchdog**: Added background keepalive service to restart background listeners if stopped by the OS.
- **Restart Recovery**: Added boot receiver to restore call readiness when your phone restarts.
- **Battery Optimization Alerts**: Prompts to exempt the app from battery savers so calls ring reliably.
- **Safe Back Button**: Pressing the Android back button minimizes the app instead of ending the call.

### Fixed
- Corrected foreground service component name in Android manifest to fix launch crashes.

## [v3.7.5] - 2026-09-06

### Fixed
- **Fast ID Recovery**: Reclaims your permanent Peer ID in 5-second retries when reconnecting.
- **Clean Socket Teardown**: Closes network connections immediately when switching apps or closing tabs.
- **Fast Startup**: Loads your saved Peer ID immediately from memory with zero screen flicker.

## [v3.7.4] - 2026-09-06

### Fixed
- **Connection Stability**: Removed memory leaks during signaling reconnects to prevent connection freezes.
- **Smooth Reconnection**: Added reconnect backoff delays (3s to 12s) to prevent rapid disconnect loops.
- **Background Wakeup**: Restores signaling automatically when bringing the app back to the screen.

## [v3.7.3] - 2026-09-05

### Fixed
- **ID Preservation**: Fixed bug where force-closing the app could generate a new random Peer ID. The app now waits and reclaims your exact original ID.

## [v3.7.2] - 2026-09-05

### Fixed
- **Reload Collision Fix**: Fixed signaling conflicts caused by fast browser refreshes.
- **Persistent Storage**: Saved Peer IDs reliably in local storage to prevent identity resets.

## [v3.7.1] - 2026-09-05

### Changed
- **TypeScript Tooling**: Converted build and maintenance scripts to TypeScript for better code safety.
- **Container Queries**: Switched layouts to modern container queries for responsive resizing on all screens.

## [v3.7.0] - 2026-09-05

### Added
- **Background Noise Gate**: Added real-time AudioWorklet noise gating on a dedicated audio thread to stop UI audio stutter.
- **Headset Detection**: Added automatic detection for Bluetooth and wired headphones.
- **Modern Mobile Layout**: Added support for dynamic viewport height and screen notch safe areas.

## [v3.6.3] - 2026-09-05

### Fixed
- **Android Build Fix**: Fixed invalid notification color metadata in Android manifest that caused build errors.

## [v3.6.2] - 2026-09-05

### Changed
- **Download Bitrate Tracking**: Added live download speed monitoring to call statistics.
- **Asymmetric Rate Control**: Automatically lowers send bitrate when the other person experiences packet loss.

## [v3.6.1] - 2026-09-05

### Changed
- **Low-Bandwidth Mobile Mode**: Tuned low-bitrate Opus calling for slow mobile data and 2G networks.
- **Smoother Jitter Buffers**: Increased buffer delays across all tiers to absorb mobile network packet jitter.

## [v3.6.0] - 2026-09-04

### Fixed
- **Android 14+ Stability**: Added required foreground service permissions to prevent Android 14 security crashes.
- **Bluetooth Permissions**: Added Bluetooth permission checks to prevent crashes on Android 12+.
- **Memory Leak Fixes**: Fixed mic stream leaks and cleared lingering call timers upon hangup.
- **Larger Touch Targets**: Enlarged all buttons to at least 44px for easier tapping on mobile screens.

## [v3.5.2] - 2026-08-29

### Added
- **Incoming Call Notifications**: Added native Android notifications so you can answer calls from outside the app.

### Fixed
- Aligned Android release version names and cleaned unused modal dialogs.

## [v3.5.1] - 2026-08-29

### Changed
- Cleaned unused configuration files and consolidated project release history.

## [v3.5.0] - 2026-08-26

### Added
- **Low-Bitrate Audio Pipeline**: Integrated high-efficiency WebAssembly audio processing for sub-10 kbps connections.
- **Off-Thread Audio Resampler**: Added 16 kHz polyphase resampler running in a background worker thread.
- **Live Health Diagnostics**: Added live audio stream overlay showing packet loss and bitrate metrics.

## [v3.4.0] - 2026-08-26

### Added
- **Opus HD Voice**: Activated wideband Opus voice encoding (16 kHz) for crystal-clear call quality.
- **Lower Network Overhead**: Packed audio into 40ms frames to cut network header traffic by 50%.
- **Audio Pre-Processing**: Added voice clarity equalizer and gentle dynamics compressor.
- **Relay Server Validation**: Fixed crash when public TURN relay servers lack login credentials.

## [v3.2.0] - 2026-08-24

### Added
- **Encrypted Signaling**: Added end-to-end encrypted call setup using ECDH (P-256) and AES-256-GCM.
- **Offline QR Signaling**: Added serverless calling via QR code or clipboard text strings.
- **Verbal Safety Code**: Added 5-digit verification code to confirm you are speaking to the intended peer.
- **Strict Content Security**: Added security headers to block untrusted external scripts.

## [v3.1.0] - 2026-08-23

### Added
- **Smooth Constant Bitrate**: Added constant bitrate encoding to prevent lag spikes on cellular networks.
- **Narrowband Mode**: Added 8 kHz narrowband mode for clear speech on slow connections down to 3.2 kbps.
- **Fastest Relay Selection**: Automatically tests and selects the fastest relay server by network latency.
- **6-Stage Audio Filter**: Added highpass filter, voice presence equalizer, and background noise gate.

## [v3.0.1] - 2026-08-16

### Added
- Live call bitrate display in statistics overlay.
- Clear error messages when calls fail or microphone access is denied.
- Safe microphone switching without dropping active calls.
- Ring spam limiter to block rapid repeated calls from the same user.

## [v3.0.0] - 2026-08-16

### Added
- **Initial Public Release**: Direct peer-to-peer encrypted voice calling with zero accounts or phone numbers required.
- **5-Digit Safety Code**: Audio verification code generated from DTLS fingerprints.
- **Audio Device Routing**: Switch between speaker, earpiece, wired headphones, and Bluetooth.
- **Android APK Package**: Packaged Android app with background notifications and dark/light themes.

## [v2.10.0] - 2026-08-10

### Added
- **Initial Prototype**: Basic peer-to-peer voice calling with standard audio filters and initial Android build.
