# SecureVoice v3.2.0 release notes

Release version: v3.2.0
Release date: August 24, 2026
Artifact: SecureVoice-v3.2.0.apk
Package identifier: io.github.sagnikrout.securevoice

## Key changes in v3.2.0

### Client-side end-to-end encrypted signaling
- ECDH (P-256) and AES-256-GCM encryption: All SDP offers, answers, and ICE candidate metadata are encrypted client-side using ephemeral Web Crypto key pairs before transmission.
- Intermediary blindness: Central relays, WebSockets, or third-party signaling services only see random base64 ciphertext and ephemeral public keys; zero plain SDP, audio specs, or DTLS fingerprints are exposed during call negotiation.

### Pluggable transports and air-gapped QR signaling
- Offline air-gapped discovery: Support for serverless, offline P2P calling via compact optical QR code scanning or copy-paste text exchange (`SV1:...`).
- WebRTC DataChannel relay: Multi-peer mesh relay transport over established P2P data channels.
- Dedicated P2P DataChannel verification: Out-of-band data channel (`securevoice_security_sync`) synchronizes SAS verification codes instantaneously between caller and receiver.

### Web Audio resource lifecycle manager
- Centralized tracking and deterministic cleanup for all AudioContexts, AudioNodes, and MediaStreamTracks.
- Eliminates memory retention, scheduled parameter automation leaks, and dangling audio nodes across rapid microphone switching and back-to-back calls.

### ICE reconnect circuit breaker
- State machine (closed, open, half-open) with 60-second exponential cooldown preventing reconnect storms on disrupted or dead networks.
- Emits real-time structured telemetry for connection recovery diagnostics.

### 9-tier extended codec ladder and adaptive pacing
- Extended Opus bitrate adaptation from 1.2 kbps (ULTRA_LOW CELT/SILK for packet loss above 50%) up to 24.0 kbps (HQ_PLUS wideband HD voice).
- Dynamic Adaptive Packet Pacer scales bandwidth headroom between 10% and 25% based on real-time buffer occupancy, loss, and jitter.

### Auditory state feedback and accessibility
- Synthesized oscillator tone cues for ringing, connected, disconnected, busy, and security verified states.
- Screen-reader voice announcements for low-vision users.
- Enabled pinch-to-zoom in the web interface for WCAG 2.1 AA accessibility compliance.

### Security hardening and documentation
- Hardened Content Security Policy: Removed 'unsafe-eval' and scoped network connect origins.
- Android WebView hardening: Mixed content disabled (`allowMixedContent: false`).
- Namespace unification: Migrated Android package identifier to `io.github.sagnikrout.securevoice`.
- Local-only sandbox: Zero server-side logging; call history and logs remain strictly on the local device.
- Threat model published in `docs/SECURITY.md` and 5 Architecture Decision Records in `docs/adr/`.

## Verification and quality assurance
- Automated tests: 413 of 413 passing tests across 25 test suites.
- TypeScript: 0 compiler warnings or errors (`npx tsc --noEmit`).
- Android build: Compiles and signs with release keystore (`versionCode 320`, `versionName "3.2.0"`).
