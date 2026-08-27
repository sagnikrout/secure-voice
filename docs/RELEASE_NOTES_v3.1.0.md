# SecureVoice v3.1.0

## Overview
SecureVoice v3.1.0 adds a low-bandwidth constant latency engine for 2G and high-loss networks, completes the TypeScript migration, and provides a signed Android release APK.

## Key changes
- Constant bitrate Opus encoding (`cbr=1`) to eliminate packet size spikes and reduce queue bloat on cellular links.
- 8 kHz SILK narrowband encoding (`maxplaybackrate=8000`) for low-bandwidth operation between 3.2 and 8.0 kbps.
- Packet aggregation (`ptime=80..100`, `maxptime=120`) dropping packet rate to 10–12.5 pkts/sec and cutting header overhead by 80%.
- Dynamic NetEQ jitter buffer floor (`RTCRtpReceiver.jitterBufferTarget`) from 120ms (HQ) to 400ms (Ultra) to prevent audio pitch-shifting on high-jitter links.
- Traffic shaping and packet pacer with DSCP Expedited Forwarding markings and 85% bandwidth headroom allocation.
- Adaptive TURN manager that ranks relay servers by latency and forces relay fallback after 3 repeated P2P failures.
- 6-stage Web Audio pipeline: 80Hz highpass, 2.8kHz peaking EQ, 4.2kHz lowpass, noise gate (-46 dBFS), compressor, and makeup gain.
- TypeScript migration with strict type coverage across WebRTC helpers, audio DSP nodes, and telemetry controllers.

## Verification
- 317 unit and integration tests passing (17 suites in `src/test/`).
- 29 network resilience benchmark assertions verified.
- Production web bundle compiled cleanly.

## Release assets
- `SecureVoice-v3.1.0.apk` (Android standalone APK)
- `SHA256SUMS.txt`
  ```text
  5cc294d54b4363b6c6bf76bec6702d4a93f2638429ebd40cb9096d53cf906dc8  SecureVoice-v3.1.0.apk
  ```
