# SecureVoice v3.2.0 Release Notes

**Release Version:** `v3.2.0`  
**Release Date:** August 24, 2026  
**Artifact:** `SecureVoice-v3.2.0.apk`  
**Package Identifier:** `io.github.sagnikrout.securevoice`

---

## 🌟 What's New in v3.2.0

### 1. 🔐 Client-Side End-to-End Encrypted (E2E) Signaling
- **ECDH (P-256) + AES-256-GCM Encryption**: All SDP offers, answers, and ICE candidate metadata are encrypted client-side using ephemeral Web Crypto key pairs before transmission.
- **Intermediary Blindness**: Central relays, WebSockets, or third-party signaling services only see random base64 ciphertext and ephemeral public keys; zero plain SDP, audio specs, or DTLS fingerprints are exposed during call negotiation.

### 2. 📡 Pluggable Transports & Air-Gapped QR Signaling
- **Offline Air-Gapped Discovery**: Full support for serverless, 100% air-gapped P2P calling via compact optical QR code scanning or copy-paste text exchange (`SV1:...`).
- **WebRTC DataChannel Relay**: Multi-peer mesh relay transport over established P2P data channels.
- **Dedicated P2P DataChannel Verification**: Out-of-band data channel (`securevoice_security_sync`) synchronizing SAS verification codes instantaneously between caller and receiver.

### 3. 🧹 Web Audio Resource Lifecycle Manager
- Centralized tracking and deterministic cleanup for all `AudioContext`s, `AudioNode`s, and `MediaStreamTrack`s.
- Eliminates memory retention, scheduled parameter automation leaks, and dangling audio nodes across rapid microphone switching and back-to-back calls.

### 4. ⚡ ICE Reconnect Circuit Breaker
- Intelligent `closed` -> `open` -> `half-open` state machine with 60-second exponential cooldown preventing reconnect storms on disrupted or dead networks.
- Emits real-time structured telemetry for connection recovery diagnostics.

### 5. 🎚️ 9-Tier Extended Codec Ladder & Adaptive Pacing
- Extended Opus bitrate adaptation from **1.2 kbps** (`ULTRA_LOW` CELT/SILK for extreme >50% packet loss survival) up to **24.0 kbps** (`HQ_PLUS` wideband HD voice).
- Dynamic Adaptive Packet Pacer scales bandwidth headroom between 10% and 25% based on real-time buffer occupancy, loss, and jitter.

### 6. 🔊 Auditory State Feedback & Accessibility
- Synthesized oscillator tone cues for ringing, connected, disconnected, busy, and security verified states.
- Screen-reader voice announcements for low-vision users.
- Enabled pinch-to-zoom in the web interface for WCAG 2.1 AA accessibility compliance.

### 7. 🛡️ Security Hardening & Threat Model
- **Hardened Content Security Policy (CSP)**: Removed `'unsafe-eval'` and locked down network connect origins.
- **Android WebView Hardening**: Mixed content disabled (`allowMixedContent: false`).
- **Namespace Unification**: Migrated Android package identifier to `io.github.sagnikrout.securevoice`.
- **Local-Only Sandbox**: Zero server-side logging; call history and logs remain strictly on the local device.
- Comprehensive security threat model published in `docs/SECURITY.md` and 5 new Architecture Decision Records in `docs/adr/`.

---

## 🧪 Verification & Quality Assurance
- **Automated Tests**: **413 / 413 passing tests** across 25 test suites.
- **TypeScript**: 0 compiler warnings or errors (`npx tsc --noEmit`).
- **Android Build**: Compiles and signs with release keystore (`versionCode 320`, `versionName "3.2.0"`).
