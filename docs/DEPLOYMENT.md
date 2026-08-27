# Deployment guide

This guide details the processes required to compile SecureVoice for Android and Web environments.

## 1. Prerequisites
- **Node.js**: v20 or higher.
- **Java**: JDK 21 (Temurin distribution).
- **Android Studio / SDK**: API Level 36 (`android-36`, `build-tools;36.0.0`).
- **Capacitor CLI**: `@capacitor/cli` v8+.

## 2. Web compilation
SecureVoice uses Vite for web asset bundling.

```bash
npm ci
npm run build
```

The output files are generated in the `dist/` directory.

## 3. Android compilation
The Android build requires line-ending sanitization on Linux runners before invoking Gradle.

1. Synchronize web assets to Android:
   ```bash
   npx cap sync android
   ```
2. Build the release APK:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
3. Generate SHA-256 checksums:
   ```bash
   cd app/build/outputs/apk/release
   sha256sum app-release.apk > SHA256SUMS.txt
   ```

## 4. Continuous integration
SecureVoice maintains automated deployment workflows in `.github/workflows/release.yml`. This pipeline provisions JDK 21 and Android 36 build tooling.
