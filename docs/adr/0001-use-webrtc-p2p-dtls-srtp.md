# ADR-0001: Use WebRTC DTLS-SRTP for Peer-to-Peer Communication

## Status
**Accepted**

## Context
SecureVoice requires low-latency, end-to-end encrypted audio communications across heterogeneous networks (2G, 3G, 4G, 5G, satellite, Wi-Fi) with zero operational server costs and no central audio relay servers.

## Decision
We utilize native **WebRTC (RFC 8827)** with **DTLS-SRTP (RFC 5764)** for direct peer-to-peer transport:
- Direct P2P UDP media transport minimizes relay latency.
- Mandatory authenticated encryption with AES-GCM cipher suites.
- Ephemeral session keys negotiated via DTLS without central key escrows.

## Consequences
### Positive
- **Zero Server Infrastructure**: No media servers required; server costs are zero for media relay.
- **Strong Privacy**: Media cannot be decrypted by signaling relays or ISPs.
- **Cross-Platform**: Runs natively on modern mobile and desktop browsers and via Capacitor on Android.

### Negative / Tradeoffs
- Requires STUN/TURN traversal for symmetric NAT environments.
- Browser SDP differences require explicit normalization transforms.
