# CI and release workflow

The project has separate GitHub Actions workflows for Pages deployment and Android releases:

- .github/workflows/deploy.yml builds and deploys the web app.
- .github/workflows/release.yml runs when a v* tag is pushed and publishes an Android APK and checksum.

## Android release environment

The release workflow currently uses Ubuntu 24.04, Node.js 24, Temurin JDK 21, and Android SDK 36. It installs npm dependencies, builds the web client, syncs Capacitor, and runs assembleRelease.

The Android project reads release signing configuration from environment variables. Store signing credentials in repository Actions secrets; never commit a keystore or passwords. Builds without a configured keystore may be unsigned and should not be distributed as signed releases.

## Release checklist

1. Update the application version consistently in the package manifest and Android configuration.
2. Review and update CHANGELOG.md with verified user-visible changes.
3. Run npm ci, npm run build, and npm test.
4. Verify the release workflow and signing secrets are configured for the repository.
5. Create and push a version tag such as v3.9.0 only after review.
6. Check the published APK and its SHA-256 checksum.

Workflow files are the source of truth for action versions, SDK packages, and artifact paths. Keep this guide aligned when those files change.
