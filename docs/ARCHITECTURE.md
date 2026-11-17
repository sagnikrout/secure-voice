# Architecture

SecureVoice is a client application built with React and TypeScript. Capacitor packages the web client for Android. The main call path is divided into signaling, WebRTC media transport, and local audio processing.

## Call setup and media

1. The client obtains a peer identity and uses PeerJS signaling to exchange call setup messages. QR and clipboard invite utilities are also present in the codebase.
2. WebRTC gathers ICE candidates and negotiates a peer connection. STUN can help discover reachable addresses; a TURN server may relay traffic when a direct route is unavailable.
3. WebRTC protects media with DTLS-SRTP. A TURN relay forwards encrypted media; it is not the endpoint of the media encryption.

Signaling and media are distinct paths. A signaling service can observe connection metadata even when the application encrypts signaling payloads. See the security policy for trust assumptions and verification guidance.

## Main components

| Path | Responsibility |
| --- | --- |
| src/App.tsx | Top-level application UI and state wiring. |
| src/core/telecomEngine.ts | Call and WebRTC coordination. |
| src/core/audioEngine.ts | Web Audio graph and audio resource lifecycle. |
| src/hooks/ | React integration for calls, peers, and audio devices. |
| src/components/ | Call UI, audio settings, QR invites, and diagnostics. |
| src/utils/signaling/ | Signaling transport interfaces and message encryption helpers. |
| src/utils/webrtc.ts | WebRTC and SDP helpers. |
| src/utils/networkAdaptation.ts | Connection-statistics-based codec adaptation. |
| src/constants/config.ts | ICE servers, codec profiles, audio profiles, and timing settings. |
| android/ | Native Android project and Capacitor integration. |
| src/test/, scripts/ | Automated tests, simulations, and maintenance scripts. |

## Audio processing

The audio engine builds a Web Audio processing graph for the microphone. Depending on the selected profile and platform support, it can apply filters, gain control, and RNNoise processing through an AudioWorklet. The processed track is used by the WebRTC connection. Available settings and implementation are maintained in src/core/audioEngine.ts, src/utils/audio.ts, and src/utils/rnnoise/.

## Network adaptation and recovery

The application samples WebRTC connection statistics and can adjust audio transmission settings for changing network conditions. ICE restart and retry behavior is implemented separately from the audio graph so a transient network interruption need not immediately tear down all local audio resources. Current thresholds and timings are defined in src/constants/config.ts; see Codec and network adaptation.

## Source of truth

Code and tests are authoritative when behavior differs from prose. In particular, configuration values can change between releases; avoid treating historical performance numbers or release notes as current guarantees.
