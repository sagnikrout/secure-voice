# ADR-0001: WebRTC for peer media

## Status

Accepted

## Context

The application needs real-time audio between browser and Android clients. WebRTC provides media negotiation, network traversal, and encrypted media transport in supported browsers and WebViews.

## Decision

Use WebRTC peer connections and DTLS-SRTP for media. Use ICE, with STUN and configured TURN services, to attempt connectivity across NATs and firewalls.

## Consequences

Media can travel directly between peers when network conditions permit. A TURN relay may be needed, so calls are not guaranteed to be relay-free. Signaling is a separate concern and still requires peers to exchange connection information. Browser and network differences require testing across supported platforms.
