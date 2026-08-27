# Security architecture and threat model

## 1. Executive summary

SecureVoice is designed from first principles as a zero-knowledge, zero-log, end-to-end encrypted peer-to-peer voice calling application. Media streams are encrypted directly between peer endpoints using WebRTC DTLS-SRTP. No voice audio, metadata, or telemetry transits an application relay server in plaintext.

## 2. Threat model and trust assumptions

### 2.1 Security assumptions
1. **Endpoint cryptography**: WebRTC DTLS 1.2 / 1.3 implementation provided by modern standards-compliant browsers is cryptographically standard (RFC 5764, RFC 8827).
2. **Signaling server boundary**: Signaling relays (PeerJS cloud or custom WebRTC signaling) are considered semi-trusted brokers. They route ephemeral SDP offers and ICE candidates but never possess private keys or media decryption capability.
3. **DTLS key generation**: Endpoints generate ephemeral DTLS keypairs per session using secure hardware random number generation (`crypto.getRandomValues`).

### 2.2 Attacker profiles

| Attacker profile | Capabilities | Potential objective | SecureVoice mitigation |
| :--- | :--- | :--- | :--- |
| Passive network eavesdropper | Intercepts IP/UDP packets. | Eavesdrop on voice conversations. | **DTLS-SRTP encryption (AES-GCM)**: All RTP payloads are ciphertext. |
| Traffic metadata analyst | Observes packet timing, lengths, and burst patterns. | Infer speech presence, word lengths, or caller identities. | **Deterministic packetization**: 40ms ptime and continuous framing normalize packet cadence. |
| Malicious signaling relay (MITM) | Modifies SDP offer/answers in transit. | Subvert DTLS handshake to intercept encryption keys. | **Short authentication string (SAS)**: Verification code computed via SHA-256 hash of local and remote DTLS certificate fingerprints. |
| Compromised host device | Malware installed on user operating system. | Extract microphone stream or memory contents. | Application-level sandboxing, hardware audio permissions, and memory cleanup upon call termination. |

## 3. Attack vectors and technical mitigations

### 3.1 Signaling interception and MITM prevention
- Threat: An active attacker modifying SDP packets on the signaling relay could inject their own DTLS fingerprint.
- Mitigation:
  - SecureVoice calculates a verification code directly from the SHA-256 fingerprints embedded in the negotiated SDP:
    $$\text{SafetyCode} = \text{SHA256}(\text{fingerprint}_{\text{local}} \parallel \text{fingerprint}_{\text{remote}}) \pmod{1000000}$$
  - Peers verbally cross-verify this SAS code during the call to verify zero MITM interference.
  - Pluggable support for out-of-band QR code SDP exchange.

### 3.2 Traffic analysis and packet sizing leakage
- Threat: Variable Bitrate (VBR) audio codecs can leak phonetic structure through packet size variations.
- Mitigation:
  - Fixed 40ms packetization time (`ptime`) to normalize packet cadence.
  - In-band Forward Error Correction (`useinbandfec=1`) and RFC 2198 Redundancy (RED) for deterministic packet framing.

### 3.3 Memory and audio context forensics
- Threat: Dangling audio node buffers or unreleased MediaStream tracks persisting in browser heap memory after a call ends.
- Mitigation:
  - Centralized `AudioResourceManager` tracking active `AudioContext`s, `AudioNode`s, and `MediaStreamTrack`s.
  - Automated teardown upon call termination cancelling scheduled parameters, disconnecting DSP nodes, stopping microphone hardware tracks, and closing contexts.

### 3.4 Diagnostics and privacy guarantees
- Zero remote logging: Diagnostic events and connection metrics are processed strictly client-side by `StructuredLogger`.
- Sanitized export: User-requested diagnostic export automatically redacts passwords, credentials, TURN tokens, and DTLS keys.

## 4. Cryptographic specifications

- Key exchange: Ephemeral ECDH (X25519 or P-256) negotiated via DTLS.
- Media encryption: SRTP with AEAD `AES_128_GCM` or `AES_256_GCM`.
- Integrity verification: SHA-256 DTLS certificate fingerprint comparison.
- Peer ID generation: 9-character identifiers drawn from an unambiguous 32-character alphabet (`PEER_ID_ALPHABET`).

## 5. Security audit checklist

- [x] WebRTC DTLS-SRTP mandatory for all media channels.
- [x] Short authentication string (SAS) fingerprint verification UI enabled.
- [x] Centralized audio resource lifecycle tracking without memory accumulation.
- [x] Circuit breaker on reconnection loops preventing denial-of-service storming.
- [x] Zero telemetry or analytics endpoints in codebase.
- [x] Sanitized diagnostic logs with automated credential stripping.
- [x] Capacitor Android permissions sandboxed to `RECORD_AUDIO` and foreground service.

### 5.1 Perfect forward secrecy
WebRTC provides perfect forward secrecy for all media and data channels. The browser WebRTC stack generates a fresh, ephemeral ECDHE keypair for every `RTCPeerConnection`. A compromised signaling channel or a retroactive key compromise cannot decrypt past media sessions, as the ephemeral private keys are destroyed in memory immediately after the DTLS handshake completes.

### 5.2 Graceful degradation and network failover
SecureVoice implements multi-tier fallback mechanisms:
- ICE network traversal: Attempts direct Host and Server-Reflexive UDP hole punching via STUN. If strict symmetric NAT is detected, falls back to relayed TURN. Media encryption remains end-to-end even via TURN.
- Codec escalation: Employs Google Lyra v2 Neural Codec (3.2 kbps) under heavily congested environments and escalates to Opus Wideband HD when stable broadband is restored.
