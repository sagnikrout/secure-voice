# Deployment

This guide covers local web and Android builds. GitHub Actions also builds an Android APK when a version tag is pushed; see .github/workflows/release.yml.

## Requirements

- Node.js 24 and npm for the web client and release workflow.
- JDK 21 for Android builds.
- Android SDK platform 36 and build tools 36.0.0.

## Web build

```bash
npm ci
npm run build
```

The production site files are written to dist/.

## Android build

Build the web assets and sync them into the Capacitor Android project:

```bash
npm ci
npm run build
npx cap sync android
```

Build a debug APK:

```bash
cd android
./gradlew assembleDebug
```

For a release APK, use a signing key that you control. The Gradle configuration reads signing values from KEYSTORE_FILE, KEYSTORE_PASSWORD, KEY_ALIAS, and KEY_PASSWORD. Keep the keystore and passwords out of source control. The checked-in convenience script uses fixed local credentials and must not be used to produce a distributable release.

The release workflow builds the web assets, syncs Capacitor, assembles the release APK, and attaches a SHA-256 checksum file to the GitHub release. Protect signing secrets and verify the resulting artifact before distribution.

## Web deployment

The repository's Pages workflow is defined in .github/workflows/deploy.yml. Review that workflow and repository Pages settings when changing the deployment target or build process.
