# Security policy

## Reporting a vulnerability

Please report suspected security issues through GitHub's private vulnerability reporting if it is enabled for this repository. If private reporting is unavailable, contact the maintainer through a channel listed on their GitHub profile. Avoid posting exploit details or sensitive information in a public issue until a fix or mitigation is available.

## Security model and limitations

WebRTC uses DTLS-SRTP to protect media between the WebRTC endpoints. Signaling is separate and can expose connection metadata. The application contains signaling encryption helpers, but users should not assume that encryption alone authenticates a contact or prevents all active attacks. Compare the in-call verification value with the other participant over a trusted, independent channel when identity verification matters.

STUN and TURN services can observe network information required for connectivity. A TURN relay can see endpoint addresses and traffic timing and volume, although WebRTC media remains encrypted between endpoints when correctly negotiated. Compromised devices, malicious browser extensions, screen/audio recording by a participant, and traffic analysis are outside the protection provided by transport encryption.

Security behavior depends on the current code, browser, platform, and service configuration. This policy is not a security audit or guarantee. Review the privacy notice and architecture for additional context.
