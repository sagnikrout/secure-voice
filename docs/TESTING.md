# Testing

The project uses Vitest for automated tests and TypeScript scripts for simulations and benchmarks.

## Commands

| Purpose | Command |
| --- | --- |
| Unit and integration tests | npm test |
| Type-check and production build | npm run build |
| Dependency manifest check | npm run check:deps |
| Network resilience benchmark | npm run benchmark |
| Network impairment simulation | npm run test:network |
| WebRTC simulation | npm run test:sim |

Run npm ci before the checks. The build runs TypeScript compilation, Vite, and SRI generation. Test counts and individual test filenames change over time; use src/test/ as the current inventory.

## Additional scripts

Scripts for audio benchmarks, Android/web tests, emulator tests, and dependency maintenance are in scripts/. Read each script for its prerequisites and side effects before running it. Emulator and real-device checks are not part of npm test.

## Before a change is merged

Run the tests and build relevant to the change. For call signaling, WebRTC, audio, or Android lifecycle changes, include targeted tests or manual verification steps in the pull request. Simulations do not establish performance or reliability on real networks and devices.
