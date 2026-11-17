# SecureVoice agent instructions

Use these notes when making changes in this repository. Source code, current tests, and GitHub Actions workflows are authoritative when documentation conflicts with implementation.

## Build and platform configuration

- The Android release workflow currently uses JDK 21, Android SDK 36, and Node.js 24. Keep documentation aligned with the workflow and Gradle configuration when these change.
- On Linux, ensure android/gradlew has LF line endings and execute permission before running Gradle if the checkout requires it.
- Keep release signing credentials out of the repository. Never distribute an APK signed with the fixed local credentials in scripts/build-release-apk.sh.
- Update user-facing documentation when behavior, build steps, or configuration changes.

## Documentation and security

- Use clear sentence-case headings and concise, factual language.
- Avoid marketing claims, unsupported performance numbers, and absolute security or privacy guarantees.
- Distinguish WebRTC media encryption from signaling and from any metadata visible to signaling, STUN, or TURN services.
- Update user-facing documentation when behavior, build steps, or configuration changes.

## Validation

- Run npm test and npm run build for application changes where feasible.
- For Android changes, validate the relevant Gradle build. For signaling, audio, or network changes, run the focused tests and simulations when practical.
- Do not hard-code volatile version strings or test results in documentation unless they are maintained from a source of truth.
