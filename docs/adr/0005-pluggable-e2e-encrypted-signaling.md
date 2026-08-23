# ADR-0005: Pluggable End-to-End Encrypted (E2E) Signaling Architecture

## Status
**Accepted**

## Context
Standard WebRTC applications rely on centralized signaling servers (e.g. PeerJS Cloud, WebSocket brokers) to exchange session descriptions (SDP offers/answers) and ICE candidates. While media is encrypted via DTLS-SRTP, an unencrypted signaling layer exposes metadata, peer identifiers, connection timestamps, and network topology to the signaling relay. Furthermore, reliance on a single cloud signaling provider creates an availability bottleneck and prevents air-gapped or offline P2P calling.

## Decision
Implement a **Pluggable, End-to-End Encrypted Signaling Subsystem**:
1. **Asymmetric E2E Cryptography**:
   - Ephemeral Web Crypto ECDH (P-256) key exchange per session.
   - Derives AES-256-GCM symmetric session keys with SHA-256 HKDF.
   - Encrypts all SDP offers/answers and ICE candidate payloads before handing them to any signaling transport.
   - The signaling broker only observes random base64 ciphertext and ephemeral public keys; it cannot inspect SDP contents or DTLS fingerprints.
2. **Pluggable Transport Abstraction (`SignalingTransport`)**:
   - `PeerJsTransport`: Default backward-compatible signaling adapter.
   - `QrCodeSignaling`: Air-gapped manual exchange (QR codes / clipboard) enabling 100% offline, serverless peer establishment.
   - `DataChannelTransport`: Direct WebRTC DataChannel relay for secondary mesh discovery.
3. **Signaling Manager (`SignalingManager`)**:
   - Unified interface for transport registration, runtime switching, and automatic E2E encryption/decryption.

## Consequences
### Positive
- **Guaranteed Zero-Knowledge Signaling**: Eliminates signaling relay MITM attacks and metadata leakage.
- **Air-Gapped Operation**: SecureVoice can establish P2P voice sessions in isolated local networks via QR code exchange with zero internet access.
- **Transport Flexibility**: Transports can be added or switched without impacting UI or WebRTC audio pipelines.

### Negative / Tradeoffs
- QR code exchange requires an initial physical optical or clipboard out-of-band step.
