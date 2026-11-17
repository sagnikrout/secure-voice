# SecureVoice

SecureVoice is a peer-to-peer voice calling app for the web and Android. It uses WebRTC for encrypted media transport and a React, TypeScript, and Capacitor client. Signaling is separate from media: peers need a way to exchange connection details, and network conditions may require a TURN relay.

- Web app: https://sagnikrout.github.io/secure-voice
- Android releases: https://github.com/sagnikrout/secure-voice/releases/latest
- Changelog: CHANGELOG.md
- Documentation index: docs/INDEX.md
- Security policy: .github/SECURITY.md

## Features

- WebRTC voice calls with DTLS-SRTP media encryption
- Call setup through PeerJS signaling, with QR-based invite and signaling utilities
- Audio controls, device selection, noise reduction, and call quality diagnostics
- Android packaging with Capacitor and native call notifications/background support
- Local call history and preferences

Features and platform behavior depend on browser, device, operating-system permissions, and network configuration. See Privacy and Security for limitations and trust assumptions.

## Run locally

Requirements: Node.js 24 and npm.

```bash
git clone https://github.com/sagnikrout/secure-voice.git
cd secure-voice
npm ci
npm run dev
```

Vite prints the local development URL. Microphone access requires a secure context; localhost is supported by modern browsers.

## Build and test

```bash
npm run build
npm test
npm run check:deps
```

Other simulation and benchmark commands are listed in docs/TESTING.md.

## Android

Android builds require JDK 21 and Android SDK 36. To prepare the web assets and sync Capacitor, run:

```bash
npm ci
npm run build
npx cap sync android
```

Then build from the android directory:

```bash
cd android
./gradlew assembleDebug
```

or:

```bash
./gradlew assembleRelease
```

For a release APK, use a signing key that you control. Do not distribute a build signed with the sample local credentials in the convenience script. See docs/DEPLOYMENT.md.

## Project documentation

- Architecture: docs/ARCHITECTURE.md
- Codec and network adaptation: docs/CODEC_ENGINE.md
- Testing: docs/TESTING.md
- Deployment: docs/DEPLOYMENT.md
- Performance measurement: docs/PERFORMANCE_BASELINE.md
- Privacy notice: docs/PRIVACY.md
- Architecture decision records: docs/adr/README.md
- Contributing: .github/CONTRIBUTING.md

## License

MIT. See LICENSE.
