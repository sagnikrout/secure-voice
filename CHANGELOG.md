# Changelog

Notable changes by release. Entries summarize user-visible changes and fixes; they are not a complete commit history.

## 3.9.0 - 2026-11-17

- Replaced the numeric call verification display with a four-emoji fingerprint.
- Added persistent incoming-call notifications and notification actions on Android.
- Added a boot receiver for Android call readiness after restart.
- Fixed call teardown state handling, notification listener cleanup, and Android 14 wake-lock behavior.
- Added a dual-emulator Android stress test script.

## 3.8.2 - 2026-11-12

- Added RNNoise-based noise reduction and selectable audio profiles.
- Added temporary signaling keys and rejection of unencrypted call-signaling messages.
- Added a dark theme, consolidated audio settings, and QR-based call invites.
- Reduced the Android package size and set Android 9 (API 28) as the minimum supported version.

## 3.8.1 - 2026-09-11

- Added system theme synchronization and Android-to-web end-to-end test coverage.
- Fixed version badge formatting and removed duplicate assets.

## 3.8.0 - 2026-09-06

- Added Android foreground call service, incoming call notifications, and battery-optimization guidance.
- Changed Android back-button behavior to keep an active call running in the background.
- Fixed the foreground service component name.

## 3.7.0 - 3.7.5 - 2026-09-05 to 2026-09-06

- Improved peer ID recovery and persistence across reloads and reconnects.
- Added signaling reconnect backoff, lifecycle cleanup, and recovery when the app returns to the foreground.
- Added an AudioWorklet noise gate, headset detection, and responsive mobile layout updates.
- Added network statistics and bitrate adaptation; fixed Android build and permission issues.
- Converted build scripts to TypeScript and updated layout queries.

## 3.5.0 - 3.6.3 - 2026-08-26 to 2026-09-05

- Added low-bitrate audio processing, an audio resampler, and call diagnostics.
- Added Opus configuration, audio processing, and network bitrate adaptation.
- Added Android incoming-call notifications and fixed Android build and resource issues.

## 3.2.0 - 3.4.0 - 2026-08-24 to 2026-08-26

- Added encrypted signaling using ECDH and AES-GCM, plus QR/clipboard signaling utilities.
- Added a numeric call verification display and stricter content security settings.
- Added Opus configuration, audio processing, and TURN configuration handling.

## 3.0.0 - 3.1.0 - 2026-08-16 to 2026-08-23

- First public release of peer-to-peer voice calling for web and Android.
- Added audio-device routing, call status and bitrate diagnostics, and Android packaging.
- Added codec and audio settings for constrained network conditions.

## 2.10.0 - 2026-08-10

- Initial prototype with basic peer-to-peer voice calling and an Android build.
