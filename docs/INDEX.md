# SecureVoice Codebase Index & Architecture Sitemap

This sitemap documents every directory and file in the SecureVoice repository, describing their function and relationships.

## Repository Layout Overview

| Directory | Layer / Purpose | Key Responsibilities |
| :--- | :--- | :--- |
| **`src/`** | Application Source | React UI, WebRTC coordinators, audio engines, and unit tests. |
| **`src/core/`** | Core Orchestration | High-level TelecomEngine and AudioEngine managers. |
| **`src/hooks/`** | State & Device Hooks | React lifecycle bindings for calls, audio devices, and peer identity. |
| **`src/components/`**| UI Presentation | Responsive modals, call consoles, visualizers, and QR dialogs. |
| **`src/utils/`** | Low-Level Subsystems | WebRTC SDP munging, cryptographic signaling, RNNoise WASM, and jitter control. |
| **`src/constants/`**| Configuration & Presets | Network ladder tiers, audio profiles, ICE servers, and peer alphabets. |
| **`src/types/`** | Type Definitions | TypeScript interfaces for all state machines and telemetry schemas. |
| **`src/test/`** | Automated Test Matrix | 30 test files containing 443 unit, property, and fuzzing tests. |
| **`android/`** | Native Android Wrapper | Capacitor 8.5 Android Studio project with Foreground Service support. |
| **`scripts/`** | Automation & Tooling | Release packaging, SRI generation, and dependency verification. |
| **`docs/`** | Documentation | Architectural specifications, codec standards, and performance baselines. |
| **`public/`** | Static Assets | Web app icons (`logo.png`, `favicon.png`) and manifest files. |

---

## Detailed File Directory

### 1. Application Core (`src/core/`)
- `src/core/audioEngine.ts`: Manages Web Audio context, node creation, AudioWorklet lifecycle, and hardware device routing.
- `src/core/telecomEngine.ts`: Orchestrates WebRTC peer connections, SDP negotiation, and adaptive bitrate ladder adjustments.

### 2. React Hooks (`src/hooks/`)
- `src/hooks/index.ts`: Public barrel export for all application hooks.
- `src/hooks/useAppServices.ts`: Accesses logging, notifications, and clipboard services.
- `src/hooks/useAudioDevices.ts`: Enumerates audio input and output hardware and handles device change events.
- `src/hooks/useCallSession.ts`: Manages call state transitions (idle, connecting, in-call, ending, error) and duration timers.
- `src/hooks/usePeer.ts`: Initializes PeerJS broker connection, registers peer ID, and classifies signaling error severity.

### 3. UI Components (`src/components/`)
- `src/components/AudioSettingsModal.tsx`: Modal for selecting microphones, speakers, and testing speaker output with an audio chime.
- `src/components/AudioVisualizer.tsx`: Canvas visualizer rendering real-time audio waveforms and volume meters.
- `src/components/DeviceSelectors.css`: CSS styling for hardware selection dropdowns and testing buttons.
- `src/components/QRCodeModal.tsx`: Displays air-gapped QR codes encoding peer invitation links for mobile camera scanning.
- `src/components/RecentCalls.tsx`: Renders local call history list with timestamps, durations, and quick redial triggers.
- `src/components/SecurityVerificationModal.tsx`: Displays Short Authentication String (SAS) verbal safety code and DTLS fingerprints.
- `src/components/WebRtcStatsOverlay.tsx`: Diagnostic heads-up display showing active bitrate, RTT, packet loss, and jitter.

### 4. Low-Level Utilities (`src/utils/`)
- `src/utils/audio.ts`: Web Audio node graph construction, biquad filter setup, and dynamics compression.
- `src/utils/audioRouting.ts`: Handles audio output destination switching across loudspeakers, earpieces, and Bluetooth.
- `src/utils/audioTestSignals.ts`: Generates synthesized two-tone speaker test chime for audio output verification.
- `src/utils/auditoryFeedback.ts`: Plays telephone ringback tones, busy signals, and call termination chimes.
- `src/utils/callPeerCoordinator.ts`: Coordinates peer signaling messages, call acceptance, and media stream attachment.
- `src/utils/formatters.ts`: Sanitizes peer IDs, formats call durations, and generates SAS verification strings.
- `src/utils/iceRestartManager.ts`: Manages non-destructive ICE restarts, exponential backoff, and circuit breakers.
- `src/utils/jitterBufferController.ts`: Clamps WebRTC jitter buffer targets to fixed floors to prevent NetEQ distortion.
- `src/utils/networkAdaptation.ts`: Evaluates WebRTC statistics against ladder thresholds and computes bitrate adjustments.
- `src/utils/noiseGateWorklet.ts`: AudioWorklet processor script for downward RMS noise gating.
- `src/utils/packetPacer.ts`: Paces outgoing RTP packets and configures DSCP Expedited Forwarding.
- `src/utils/qrCode.ts`: Generates and parses QR code payloads for air-gapped signaling.
- `src/utils/resourceManager.ts`: Tracks active Web Audio and WebRTC resources to prevent memory leaks during page lifecycle.
- `src/utils/structuredLogger.ts`: Structured JSON diagnostic logger with production silencing and memory limits.
- `src/utils/turnManager.ts`: Probes TURN relay connectivity and enforces symmetric relay routing when direct UDP fails.
- `src/utils/webrtc.ts`: Modifies Session Description Protocol (SDP) for Opus parameters, RFC 2198 RED, and bitrates.
- `src/utils/rnnoise/rnnoiseProcessor.ts`: High-level wrapper for the official RNNoise v0.2 WebAssembly module.
- `src/utils/rnnoise/rnnoiseWorklet.ts`: AudioWorklet processor that feeds audio frames through RNNoise WASM.
- `src/utils/signaling/index.ts`: Pluggable signaling manager with client-side ECDH / AES-256-GCM encryption and anti-downgrade checks.

### 5. Constants & Configuration (`src/constants/`)
- `src/constants/config.ts`: Defines ICE server endpoints, 6-tier Opus survival ladder, Opus SDP parameters, and acoustic profiles.

### 6. Build, Test & CI Scripts (`scripts/`)
- `scripts/adversarial-breaking-audit.ts`: Playwright-driven stress audit testing network impairment boundaries.
- `scripts/benchmark-audio-pipeline.ts`: Benchmarks AudioWorklet frame execution times against fail-safe limits.
- `scripts/benchmark-network-resilience.ts`: Simulates packet loss ladders and measures FEC concealment efficacy.
- `scripts/benchmark-real-voice-notes.ts`: Ingests noisy voice recordings and benchmarks RNNoise noise suppression.
- `scripts/build-release-apk.sh`: Bash script to build, minified, sign, and export the Android release APK.
- `scripts/download-noisy-voice-notes.py`: Python utility to download real acoustic noise samples for testing.
- `scripts/generate-brand-assets.ts`: Renders scalable SVGs into production PNG raster assets using Playwright.
- `scripts/generate-sri.ts`: Calculates SHA-384 Subresource Integrity hashes and injects them into `dist/index.html`.
- `scripts/simulate-network-impairments.ts`: Simulates network dropouts and verifies non-destructive ICE recovery.
- `scripts/test-e2e-android-web.ts`: End-to-end test runner connecting Android emulator and desktop browser instances.
- `scripts/validate-dependencies.ts`: Enforces 100% parity between `package.json` and `package-lock.json`.
- `scripts/webrtc-simulation-runner.ts`: Headless simulation runner verifying call state transitions under packet loss.
