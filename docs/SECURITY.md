# SecureVoice Security Architecture & Threat Model

## 1. Executive Summary

SecureVoice is designed from first principles as a **zero-knowledge, zero-log, end-to-end encrypted peer-to-peer voice calling application**. All media streams are encrypted directly between peer endpoints using **WebRTC DTLS-SRTP**. No voice audio, metadata, or telemetry ever transits an application relay server in plaintext.

---

## 2. Threat Model & Trust Assumptions

### 2.1 Security Assumptions
1. **Endpoint Cryptography**: WebRTC DTLS 1.2 / 1.3 implementation provided by modern standards-compliant browsers is cryptographically sound (RFC 5764, RFC 8827).
2. **Signaling Server Boundary**: Signaling relays (PeerJS cloud or custom WebRTC signaling) are considered **semi-trusted / untrusted brokers**. They route ephemeral SDP offers and ICE candidates but never possess private keys or media decryption capability.
3. **DTLS Key Generation**: Endpoints generate ephemeral DTLS keypairs per session using secure hardware RNG (`crypto.getRandomValues`).

---

### 2.2 Attacker Profiles

| Attacker Profile | Capabilities | Potential Objective | SecureVoice Mitigation |
|---|---|---|---|
| **Passive Network Eavesdropper** | Intercepts all IP/UDP packets (Wi-Fi sniffer, ISP, government wiretap). | Eavesdrop on voice conversations. | **DTLS-SRTP Encryption (AES-GCM)**: All RTP payloads are ciphertext. |
| **Traffic / Metadata Analyst** | Observes packet timing, lengths, and burst patterns. | Infer speech presence, word lengths, or caller identities. | **Constant Bit Rate (CBR)**: Enforced mono Opus CBR eliminates packet size modulation. Fixed 80ms ptime. |
| **Malicious Signaling Relay (MITM)** | Tampers with or replaces SDP offer/answers in transit. | Subvert DTLS handshake to intercept encryption keys. | **Short Authentication String (SAS)**: 5-digit safety code computed via SHA-256 hash of lexicographically sorted local and remote DTLS fingerprints. |
| **Compromised Host Device** | Malware, rootkit, or spyware installed on user OS. | Extract microphone stream or memory contents. | Application-level sandboxing; hardware audio permissions; memory cleanup upon call termination. |

---

## 3. Attack Vectors & Technical Mitigations

### 3.1 Signaling Interception & MITM Prevention
- **Threat**: An active attacker modifying SDP packets on the signaling relay could inject their own DTLS fingerprint.
- **Mitigation**:
  - SecureVoice calculates a **5-digit verification code** directly from the SHA-256 fingerprints embedded in the negotiated SDP:
    $$\text{SafetyCode} = \text{SHA256}(\text{fingerprint}_{\text{local}} \parallel \text{fingerprint}_{\text{remote}}) \pmod{100000}$$
  - Peers verbally cross-verify this 5-digit SAS code during the call to verify zero MITM interference.
  - Pluggable support for out-of-band QR code SDP exchange.

---

### 3.2 Traffic Analysis & Packet Sizing Leakage
- **Threat**: Variable Bitrate (VBR) audio codecs leak acoustic phonetic structure through packet size variations (e.g., vowels vs. fricatives).
- **Mitigation**:
  - Strict Opus `cbr=1` parameter enforcement in SDP transforms (`transformOpusSdp`).
  - Fixed 80ms / 100ms packetization time (`ptime`) to normalize packet cadence.
  - In-band Forward Error Correction (`useinbandfec=1`) and RFC 2198 Redundancy (RED) for deterministic packet framing.

---

### 3.3 Memory & Audio Context Forensics
- **Threat**: Dangling audio node buffers or unreleased MediaStream tracks persisting in browser heap memory after a call ends.
- **Mitigation**:
  - Centralized [`AudioResourceManager`](file:///c:/Users/sagni/OneDrive/Desktop/Secure%20Voice/src/utils/resourceManager.ts) tracking all active `AudioContext`s, `AudioNode`s, and `MediaStreamTrack`s.
  - Automated teardown upon call termination cancelling scheduled parameters, disconnecting DSP nodes, stopping microphone hardware tracks, and closing contexts.

---

### 3.4 Diagnostics & Privacy Guarantees
- **Zero Remote Logging**: Diagnostic events and connection metrics are processed strictly client-side by [`StructuredLogger`](file:///c:/Users/sagni/OneDrive/Desktop/Secure%20Voice/src/utils/structuredLogger.ts). Note: If you configure a third-party TURN server, the TURN provider may log connection IP metadata, though media remains encrypted.
- **Sanitized Export**: User-requested diagnostic export automatically redacts passwords, credentials, TURN tokens, and DTLS keys.

---

## 4. Cryptographic Specifications

- **Key Exchange**: Ephemeral ECDH (X25519 or P-256) negotiated via DTLS.
- **Media Encryption**: SRTP with AEAD `AES_128_GCM` or `AES_256_GCM`.
- **Integrity Verification**: SHA-256 DTLS Certificate Fingerprint comparison.
- **Peer ID Generation**: High-entropy 9-character identifiers drawn from an unambiguous 32-character alphabet (`PEER_ID_ALPHABET`).

---

## 5. Security Audit Checklist

- [x] WebRTC DTLS-SRTP mandatory for all media channels.
- [x] Opus CBR enabled across all adaptive ladder tiers.
- [x] Short Authentication String (SAS) fingerprint verification UI enabled.
- [x] Centralized audio resource lifecycle tracking without memory accumulation.
- [x] Circuit breaker on reconnection loops preventing Denial of Service (DoS) storming.
- [x] Zero telemetry or analytics endpoints in codebase.
- [x] Sanitized diagnostic logs with automated credential stripping.
- [x] Capacitor Android permissions sandboxed to `RECORD_AUDIO` and foreground service.
