# Security Policy

## Reporting a Vulnerability

Report security vulnerabilities privately via GitHub Security Advisories:
- **Private Advisory**: https://github.com/sagnikrout/secure-voice/security/advisories/new
- **Alternative**: Open a confidential issue on GitHub if private advisories are disabled.

Do not post exploit payloads or proof-of-concept scripts in public issues until a mitigation is released.

---

## Security Architecture & Threat Model

| Boundary | Transport | Protection | Visibility & Limits |
| :--- | :--- | :--- | :--- |
| **Media Stream** | Direct UDP / WebRTC | DTLS-SRTP encryption | End-to-end encrypted between caller and callee. Relay nodes cannot decrypt audio. |
| **Signaling** | PeerJS (WebSocket) | Ephemeral ECDH + AES-256-GCM | Signaling servers route encrypted payloads. Server observes IP addresses and call timing metadata. |
| **Network Relays** | STUN / TURN | UDP / TCP relay | TURN relays forward encrypted media packets. Relays observe endpoint IPs, port numbers, and bandwidth volume. |

---

## Authentication & Verification

1. **Cryptographic Fingerprint**: Compare the 4-emoji verification code (`[emoji1 emoji2 emoji3 emoji4]`) verbally over the call. Identical emojis guarantee both endpoints hold matching DTLS certificate fingerprints without Man-In-The-Middle (MITM) tampering.
2. **Ephemeral Keys**: Signaling encryption derives temporary ECDH keypairs per session. Keys are wiped from memory on call teardown.
3. **Out of Scope**: Compromised local OS environments, malicious browser extensions, rooted device keyloggers, and local physical recording by call participants.
