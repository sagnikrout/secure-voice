# Contributing

Thanks for considering a contribution. Keep changes focused and describe their effect on users, platforms, and security assumptions.

## Before opening a pull request

- Run npm test and npm run build for code changes.
- Run focused simulations or Android checks when changing signaling, WebRTC, audio, or native lifecycle behavior.
- Update documentation when commands, user-visible behavior, or configuration changes.
- Do not commit credentials, private keys, user recordings, or generated release artifacts.

## Implementation guidelines

- Prefer explicit TypeScript types and small, testable changes.
- Preserve the separation between signaling and media transport.
- Do not add analytics or telemetry without clearly documenting the data collected, purpose, and user impact.
- Treat encryption and privacy claims conservatively; include tests and document trust assumptions for security-sensitive changes.

## Pull requests

Explain the problem and proposed change, list tests run, and note any limitations or manual verification required. For larger design changes, discuss the approach in an issue before implementation.
