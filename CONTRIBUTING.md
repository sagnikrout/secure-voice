# Contributing to SecureVoice

SecureVoice is an open-source, Zero-Knowledge peer-to-peer communication platform. We welcome pull requests that align with our core invariants:

## 1. Core Invariants
- **Zero Telemetry**: No third-party SDKs, tracking pixels, or data collection.
- **Cryptography**: Do not introduce custom cryptography. We strictly rely on the WebRTC DTLS-SRTP standards stack provided by the browser ecosystem.
- **Performance**: Codecs must remain operable on devices with degraded network links. The adaptive network fallback matrix must be preserved.

## 2. Pull Request Guidelines
- All PRs must pass the existing itest test suites and the empirical network degradation benchmark (
pm run benchmark).
- Avoid ny typings where possible.
- Update walkthrough.md and AGENTS.md if your change introduces new architectural rules or invariants.

## 3. Scope Boundaries
We will reject pull requests that introduce:
- Centralized media relays (SFUs).
- Social network integrations.
- Monetization or advertisements.
