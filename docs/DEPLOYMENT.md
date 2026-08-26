# Deployment Guide

This guide details the processes required to compile SecureVoice for Android and Web environments, enforcing verifiable and deterministic builds.

## 1. Prerequisites
- **Node.js**: v20 or higher.
- **Java**: JDK 21 (Temurin).
- **Android Studio / SDK**: API Level 36 (ndroid-36, uild-tools;36.0.0).
- **Capacitor CLI**: @capacitor/cli v8+.

## 2. Web Compilation
SecureVoice leverages Vite for minimal WebAssembly neural codec bundling.
`ash
npm ci
npm run build
`
The output will be placed in the dist/ directory. For GitHub Pages deployment, run 
pm run deploy.

## 3. Android Compilation
The Android pipeline requires sanitizing line endings on Linux runners and enforcing release-mode APK generation.

1. Synchronize Web assets to Android:
   `ash
   npx cap sync android
   `
2. Build the APK:
   `ash
   cd android
   ./gradlew assembleRelease
   `
3. Generate SHA-256 Checksums (Required for Releases):
   `ash
   cd app/build/outputs/apk/release
   sha256sum app-release-unsigned.apk > SHA256SUMS.txt
   `

## 4. Continuous Integration
SecureVoice maintains automated deployment pipelines in .github/workflows/release.yml. This pipeline strictly provisions JDK 21 and Android-36 tooling.
