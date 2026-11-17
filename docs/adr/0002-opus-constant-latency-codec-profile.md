# ADR-0002: Opus audio configuration

## Status

Accepted

## Context

Voice calls need to balance audio quality, bandwidth use, and resilience to network variation. WebRTC implementations support Opus, but the negotiated settings and their effects vary by browser.

## Decision

Use Opus for WebRTC audio and maintain configurable bitrate, packetization, discontinuous transmission, and in-band FEC settings. Adaptation thresholds and profiles are managed in application code.

## Consequences

The application can respond to changing connection statistics, but cannot guarantee a particular bitrate or audio result. SDP options may be ignored or interpreted differently by a browser. Configuration changes require tests and, where possible, validation on real devices.
