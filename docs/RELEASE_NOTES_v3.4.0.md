# SecureVoice v3.4.0 release notes

Release version: v3.4.0
Release date: August 26, 2026
Artifact: SecureVoice-v3.4.0.apk
Package identifier: io.github.sagnikrout.securevoice

## Key changes in v3.4.0

### High-definition wideband audio engine
- Opus Wideband transition: Upgraded audio engine to 16 kHz Wideband sampling (`maxplaybackrate=16000`, `sprop-maxcapturerate=16000`), restoring natural vocal timbre and speech sibilants.
- Variable Bit Rate allocation: Switched from constant bitrate to Variable Bit Rate (`cbr=0`), eliminating robotic metallic quantization artifacts during phoneme transitions.
- Pareto optimal bitrate: Default session bitrate configured to 14 kbps (`MAX_AVERAGE_BITRATE: '14000'`) for optimal audio transparency per kilobit of bandwidth (~1.4 KB/s average transfer rate).
- 40ms lock-step packetization: Configured `ptime=40` and `maxptime=60`, reducing RTP/UDP/IP packet header overhead by 50% (from 50 to 25 packets per second).

### Constant deterministic latency engine
- Dual jitter buffer clamping: Sets both `RTCRtpReceiver.jitterBufferTarget` (ms) and `RTCRtpReceiver.playoutDelayHint` (seconds) to enforce a constant playout queue depth across Chromium, Safari, and Android WebView.
- Prevention of NetEQ time-stretching: Eliminates audio acceleration and deceleration artifacts caused by unconstrained buffer expansion during network jitter.
- Expedited Forwarding priority: Configured `priority: 'high'` and `networkPriority: 'high'` (DiffServ 46 / `AC_VO`), granting voice packets priority over background network traffic at the router and Wi-Fi access point levels.
- Synchronous startup pacing: Jitter buffer target and traffic shaping parameters apply immediately on connection establishment.

### Web Audio DSP pipeline refinement
- Expanded acoustic envelope: Raised 2nd-order lowpass filter cutoff from 4.2 kHz to 8.5 kHz, preserving vocal consonants while filtering out high-frequency electrical hiss.
- Formant presence tuning: Adjusted 2.8 kHz peaking EQ to +2.0 dB ($Q=1.0$) for warm vocal clarity without metallic resonance.
- Dynamics compressor optimization: Configured -20 dB threshold, 15 dB knee, 3:1 compression ratio, 5ms attack, and 180ms release.
- Ingest conditioning: Added `{ sampleRate: { ideal: 48000 } }` constraints to microphone capture.

### TURN relay fallback and resilience
- Fixed `RTCPeerConnection` construction crash caused by empty username or password strings on TURN server entries when environment variables are unset.
- Default fallback credentials: Added public OpenRelay project fallback credentials (`openrelayproject`) for Metered TURN endpoints.
- Defensive sanitization: Added filter checks in `TurnRelayManager` (`probeTurnServer`, `rankServers`, `getBestIceConfig`) to exclude unauthenticated TURN servers before WebRTC configuration handoff.

## Verification and quality assurance
- Automated tests: 411 of 411 passing tests across 24 test suites.
- TypeScript: 0 compiler errors (`tsc --noEmit`).
- Production build: Asset compilation succeeded without warnings.
- Android configuration: Updated `versionCode 340` and `versionName "3.4.0"` in `android/app/build.gradle`.
