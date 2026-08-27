# SecureVoice v3.5.0 release notes

Release version: v3.5.0
Release date: August 27, 2026
Artifact: SecureVoice-v3.5.0.apk
Package identifier: io.github.sagnikrout.securevoice

## Key changes in v3.5.0

### Google Lyra v2 neural speech codec
- Sub-1 kB/s neural voice transmission: Integrated Google Lyra v2 neural speech codec (SoundStream encoder and LyraGAN generator architecture) operating at 3.2 kbps for wideband audio over severely degraded connections.
- WebAssembly SIMD pipeline: 128-bit SIMD neural inference engine running off the main thread in a dedicated Web Worker (`lyraWorker.ts`).
- Generative packet loss concealment: Autoregressive neural PLC synthesizing missing audio frames without NetEQ pitch-shifting or audio distortion up to 35% packet loss.
- Resampling and framing: 16 kHz polyphase AudioWorklet resampler with 20ms (320-sample) ring-buffered framing (`lyraAudioWorklet.ts`).
- WebRTC Encoded Transform: Insertable streams architecture (`RTCRtpScriptTransform`) with serialized frame headers and sequence tracking.

### Streamlined user experience and network diagnostics
- Simplified interface: Replaced complex diagnostics with a streamlined Network Health overlay displaying active tier, latency, and packet loss.
- Audio and codec settings: Added modal controls for selecting audio output routing, input devices, and codec preferences with automatic fallback.
- Local contact blocking: Ingest privacy filter blocking unwanted caller IDs directly at the network signaling layer.
- Persistent local peer identity: Local storage retention of assigned peer ID across app updates and restarts.

### Brand identity and vector assets
- New vector logo: High-contrast waveform brand mark across web favicons (`favicon.svg`, `favicon.png`), app header, and high-DPI Android mipmaps (`mdpi` through `xxxhdpi`).
- Subresource Integrity: Automated SRI hash injection for client scripts and stylesheets during production compilation.

## Verification and quality assurance
- Automated tests: 430 of 430 passing tests across 26 test suites.
- TypeScript: 0 compiler errors (`tsc --noEmit`).
- Production build: Clean asset compilation with Subresource Integrity hashes verified.
- Android configuration: Set `versionCode 350` and `versionName "3.5.0"` in `android/app/build.gradle`.
