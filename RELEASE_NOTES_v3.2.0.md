# SecureVoice v3.2.0 Release Notes

**Release Date:** August 24, 2026  
**Artifact:** `SecureVoice-v3.2.0.apk`  
**SHA-256 Checksum:** `f6b141dd7f1b59cef9cfe64cb5acbda8af689fdc39a44ed2161dbc2e5d529908`

---

## 🌟 Major Highlights & What's New

### 1. 🔐 End-to-End Encrypted (E2E) Signaling
- Implemented **Web Crypto ECDH (P-256) + AES-256-GCM** authenticated symmetric encryption for all signaling traffic.
- SDP offers, answers, and ICE candidate objects are encrypted client-side before touching any signaling relay.
- Signaling servers only see random base64 ciphertext and ephemeral public keys; zero metadata, SDP, or DTLS fingerprint exposure.

### 2. 📡 Pluggable Transports & Air-Gapped QR Signaling
- Introduced abstract `SignalingTransport` and unified `SignalingManager`.
- **Air-Gapped QR Code Discovery**: 100% offline, serverless peer establishment via compact optical QR code scanning or copy-paste text exchange (`SV1:...`).
- **WebRTC DataChannel Relay**: Multi-peer mesh relay transport over existing P2P connections.
- **PeerJS Transport**: Fully backward-compatible cloud adapter.

### 3. 🧹 Web Audio Resource Manager
- Centralized tracking and cleanup of all `AudioContext`s, `AudioNode`s, and `MediaStreamTrack`s.
- Guaranteed leak-free memory teardown across rapid hardware mic switching and consecutive calls.

### 4. ⚡ ICE Reconnect Circuit Breaker
- `closed` -> `open` -> `half-open` state machine with 60-second cooldown to prevent infinite reconnection storms on dead networks.
- Emits real-time structured diagnostics for network telemetry.

### 5. 🎚️ 9-Tier Extended Codec Ladder & Adaptive Pacing
- Added `ULTRA_LOW` (1.2 kbps CELT/SILK for emergency survival >50% packet loss) and `HQ_PLUS` (24 kbps wideband HD).
- Dynamic Adaptive Packet Pacer scales headroom between 10% and 25% based on real-time buffer occupancy, loss, and jitter.

### 6. 🔊 Auditory Feedback & Accessibility
- Audio cues synthesized via Web Audio oscillators for ringing, connected, disconnected, busy, and verified states.
- Screen-reader / speech synthesis voice announcements for low-vision and blind users.

### 7. 🛡️ Security Architecture & ADRs
- Comprehensive threat model documented in `docs/SECURITY.md`.
- Formal Architecture Decision Records in `docs/adr/` (`ADR-0001` through `ADR-0005`).

---

## 🧪 Verification & Quality Assurance
- **Unit & Integration Tests**: **413 / 413 passing tests across 25 test files** (96 new tests added).
- **TypeScript**: 0 compiler warnings or errors (`tsc --noEmit`).
- **Android Release APK**: Compiled and signed with release keystore (`v3.2.0`, `versionCode 320`).
