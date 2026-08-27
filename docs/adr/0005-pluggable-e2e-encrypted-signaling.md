# ADR-0005: Pluggable end-to-end encrypted signaling architecture

## Status
Accepted

## Context
Standard WebRTC applications rely on centralized signaling servers to exchange session descriptions (SDP offers and answers) and ICE candidates. While media is encrypted via DTLS-SRTP, an unencrypted signaling layer exposes metadata, peer identifiers, connection timestamps, and network topology to the signaling relay. Furthermore, reliance on a single cloud signaling provider creates an availability bottleneck and prevents air-gapped or offline P2P calling.

## Decision
Implement a pluggable, end-to-end encrypted signaling subsystem:
1. Asymmetric end-to-end cryptography:
   - Ephemeral Web Crypto ECDH (P-256) key exchange per session.
   - Derives AES-256-GCM symmetric session keys with SHA-256 HKDF.
   - Encrypts all SDP offers/answers and ICE candidate payloads before handing them to any signaling transport.
   - The signaling broker only observes random base64 ciphertext and ephemeral public keys; it cannot inspect SDP contents or DTLS fingerprints.
2. Pluggable transport abstraction (`SignalingTransport`):
   - `PeerJsTransport`: Default backward-compatible signaling adapter.
   - `QrCodeSignaling`: Air-gapped manual exchange (QR codes or clipboard) enabling offline, serverless peer establishment.
   - `DataChannelTransport`: Direct WebRTC DataChannel relay for secondary mesh discovery.
3. Signaling manager (`SignalingManager`):
   - Unified interface for transport registration, runtime switching, and automatic encryption and decryption.

## Consequences
### Positive
- Zero-knowledge signaling: Eliminates signaling relay MITM attacks and metadata leakage.
- Air-gapped operation: SecureVoice can establish P2P voice sessions in isolated local networks via QR code exchange with zero internet access.
- Transport flexibility: Transports can be added or switched without impacting UI or WebRTC audio pipelines.

### Negative and tradeoffs
- QR code exchange requires an initial physical optical or clipboard out-of-band step.
