# Threat model

This document defines the security parameters, attacker models, and structural bounds for SecureVoice.

## Primary assets
1. Real-time media streams (voice audio)
2. Call metadata (duration, peer identities, timestamps)
3. Cryptographic key material (ECDHE private keys, DTLS master secrets)

## Attacker models and defenses

### Passive network observer
An attacker with read-only access to network traffic (for example, an internet service provider or local network observer).
- **Capabilities**: Can capture IP packets and analyze packet sizes.
- **Defenses**: All media payloads are encrypted via SRTP (AES-128-GCM or AES-256-GCM). Signaling requires TLS 1.2+ for transport.
- **Unmitigated risks**: Call duration and frequency metadata are visible.

### Active man-in-the-middle (MITM)
An attacker capable of intercepting and modifying packets in transit.
- **Capabilities**: Can manipulate signaling SDP payloads, inject falsified ICE candidates, or attempt DTLS handshake downgrade.
- **Defenses**: SecureVoice utilizes an 8-digit Short Authentication String (SAS) derived from local and remote DTLS certificate fingerprints. Users verbally cross-verify this string. A mismatch indicates active signaling compromise.
- **Unmitigated risks**: Relies on user compliance to verbally verify the code.

### Endpoint compromise
An attacker with physical or logical control over a participant device.
- **Capabilities**: Can install malware, extract memory, or capture screen and microphone data prior to encryption.
- **Defenses**: Sensitive diagnostic logs and call history are stored in local storage and can be cleared at any time.
- **Unmitigated risks**: SecureVoice provides no protection against root-level device compromise or operating system level microphone interception.

## Out of scope
The following vectors are explicitly excluded from the threat model:
- Coercion or physical duress.
- Social engineering.
- Hardware backdoors or baseband vulnerabilities.
