# ADR-0005: Signaling transport abstraction

## Status

Accepted

## Context

WebRTC peers must exchange session descriptions and ICE candidates before media can connect. This signaling traffic is distinct from the media transport and requires a transport or an out-of-band exchange.

## Decision

Keep signaling interfaces separate from call coordination and provide helpers for encrypting signaling payloads and using alternative exchange paths such as QR codes. The current implementation is in src/utils/signaling/ and related QR utilities.

## Consequences

The separation makes it possible to add or change signaling paths without redesigning media handling. Encryption and peer authentication must be evaluated against the current protocol implementation; an encrypted payload alone does not establish that a peer's identity is trustworthy. QR or clipboard exchange requires a separate user-mediated step.
