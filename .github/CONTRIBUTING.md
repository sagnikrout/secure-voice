# Contributing to SecureVoice

SecureVoice is an open-source, zero-knowledge peer-to-peer communication platform. Contributions must adhere to the following invariants:

## 1. Core invariants
- **Zero telemetry**: No third-party SDKs, tracking pixels, or data collection.
- **Standard cryptography**: Rely strictly on standard WebRTC DTLS-SRTP protocols.
- **Low-bandwidth performance**: Codecs must remain operable on devices with degraded network links. The adaptive network fallback matrix must be preserved.

## 2. Pull request guidelines
- All pull requests must pass the test suite (`npm test`) and network benchmarks (`npm run benchmark`).
- Avoid `any` types where explicit types can be written.
- Update documentation and AGENTS.md if a change introduces new architectural rules or invariants.

## 3. Scope boundaries
Pull requests introducing the following will be rejected:
- Centralized media relays (SFUs).
- Social network integrations.
- Monetization or advertisements.
