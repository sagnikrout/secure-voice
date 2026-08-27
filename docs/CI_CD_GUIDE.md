# CI/CD and release build specifications

This document outlines the build requirements, CI runner configuration, and release automation specifications for SecureVoice.

## Android CI build configuration

### Java Development Kit (JDK)
- JDK version: JDK 21 (Temurin distribution)
- Capacitor 8 and Capawesome plugins target Java 21 bytecode. Using JDK 17 causes `error: invalid source release: 21` during `compileReleaseJavaWithJavac`.

### Android SDK and platform requirements
- compileSdk: 36
- targetSdk: 36
- minSdk: 24
- Dependencies including `androidx.activity:activity:1.11.0` and `androidx.core:core:1.17.0` require API level 36.
- The CI workflow must configure `android-actions/setup-android@v3` with packages:
  `tools platform-tools platforms;android-36 build-tools;36.0.0`

### Line endings and shell script execution
- When checked out on Windows, shell scripts and `gradlew` may acquire CRLF (`\r\n`) line endings.
- Linux runners require LF (`\n`) line endings.
- Mitigation: Repository `.gitattributes` forces `eol=lf` for `gradlew` and shell scripts. The CI step runs `sed -i 's/\r$//' gradlew` before invocation.

## Release publishing automation

### Workflow permissions
- GitHub Actions default `GITHUB_TOKEN` requires `contents: write` permissions.
- In repository settings: **Settings -> Actions -> General -> Workflow permissions** must be set to **Read and write permissions**.

### Release action
- Releases are published using `softprops/action-gh-release@v2` with `make_latest: "true"`.
- Artifacts attached to every release:
  - `SecureVoice-v<version>.apk`
  - `SHA256SUMS.txt`
