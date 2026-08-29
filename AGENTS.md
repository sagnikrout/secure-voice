# SecureVoice Agent Instructions & Build Rules

## 1. Android & CI/CD Build Invariants
- **JDK Version**: Always use JDK 21 (`java-version: '21'`) in GitHub Actions workflows (`actions/setup-java@v5`). Modern Capacitor plugins target Java 21 bytecode.
- **Android SDK Level**: Maintain `compileSdkVersion = 36` and `targetSdkVersion = 36` in `android/variables.gradle`.
- **SDK Package Provisioning**: In CI workflows using `android-actions/setup-android@v3`, always specify:
  `packages: 'tools platform-tools platforms;android-36 build-tools;36.0.0'`
- **Line Ending Sanitization**: Always sanitize `gradlew` with `sed -i 's/\r$//' gradlew` before executing `./gradlew` on Linux runners.

## 2. Release & Checksum Invariants
- **Release Action**: Use `softprops/action-gh-release@v2` with `make_latest: "true"` for GitHub releases.
- **Checksum Files**: `SHA256SUMS.txt` must strictly contain only the hash of the current release binary (`SecureVoice-v<version>.apk`), never legacy version hashes.
- **Permissions**: Release workflows require `permissions: contents: write` and repository settings configured to "Read and write permissions".

## 3. Style & Documentation Rules (AG-TSA)
- Use sentence case for headings.
- Omit emoji characters and decorative em dashes from release notes and technical documentation.
- Maintain an objective, encyclopedic tone with zero marketing filler or banned copula substitutes.

## 4. Engineering & Environment Guidelines
- **Universal Version Consistency**: When bumping application versions in package manifests, comprehensively update all user-facing version badges, configuration constants, and documentation headers. Do not leave the UI or documentation in a stale state.
- **Resilient UI Testing**: Avoid hardcoding volatile data (such as exact semantic version strings or timestamps) directly in UI test assertions. Dynamically import the source-of-truth constants to ensure tests survive routine updates.
- **PowerShell Exclusion Anti-Pattern**: Never use -Exclude combined with -Recurse in PowerShell's Get-ChildItem when filtering directories, as it only matches leaf names. Use alternative tools or Where-Object path filtering instead.
