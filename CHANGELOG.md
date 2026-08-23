# 📋 Changelog & Release History

All notable changes to **SecureVoice** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v3.1.0] — 2026-08-23 "Aegis Nexus"

### 🚀 Major Architectural Milestones

#### 1. 2G Constant Latency Survival Engine
- **Constant Bitrate Enforcement (`cbr=1`):** Completely eliminates transmission packet size spikes during speech bursts, preventing cellular tower bufferbloat and latency inflation.
- **8 kHz Narrowband SILK Modeling (`maxplaybackrate=8000`):** Focuses 100% of the ultra-low bit budget (3.2 – 8.0 kbps) directly on human vocal formants (300 Hz – 3400 Hz).
- **Packet Aggregation (`ptime=80–100ms`, `maxptime=120ms`):** Reduces packet frequency from 50 pkts/s to 10–12.5 pkts/s, cutting IP/UDP/RTP network header overhead from 17.6 kbps down to **3.5 kbps** (an 80% reduction).
- **Session Wire Bandwidth Cap (`b=AS:8` / `b=AS:4`):** Prevents browsers from initiating high-bandwidth burst probing on weak links.

#### 2. Locked NetEQ Jitter Buffer Controller
- **Dynamic Jitter Buffer Floor (`RTCRtpReceiver.jitterBufferTarget`):**
  - `HQ (2G Stable):` 120 ms
  - `STD (2G Normal):` 160 ms
  - `LB (2G Congested):` 200 ms
  - `HL (2G High Loss):` 250 ms
  - `EXT (2G Survival):` 300 ms
  - `ULTRA (Satellite / Extreme):` 400 ms
- Eliminates WebRTC NetEQ time-stretching, micro-stutters, and robotic pitch distortion under high jitter.

#### 3. Traffic Shaping & Headroom Pacer (`PacketPacer`)
- Applies DSCP `priority: 'high'` and `networkPriority: 'high'` (Expedited Forwarding) to audio sender streams.
- Allocates an **85% bandwidth headroom factor** so the network stack has margin to pace frames smoothly without shallow router queue drops.

#### 4. Adaptive TURN Relay Probing & Forced Failover (`TurnRelayManager`)
- Ephemerally probes configured TURN servers to sort lowest-latency relays first.
- Tracks consecutive P2P failures and automatically forces relay-only mode (`iceTransportPolicy: 'relay'`) on retry attempt 3.

#### 5. 6-Stage Vocal Formant Web Audio DSP Pipeline
- **Stage 1:** 80Hz Butterworth Highpass Filter (cuts HVAC / handling rumble)
- **Stage 2:** 2.8kHz Peaking EQ (+3dB vocal presence boost)
- **Stage 3:** 4.2kHz Lowpass Filter (cuts ambient hiss & fan noise)
- **Stage 4:** Active Downward RMS Noise Gate (-46 dBFS threshold)
- **Stage 5:** Studio Dynamics Compressor (-18dB threshold, 12dB knee, 4:1 ratio)
- **Stage 6:** 1.2x Makeup Gain (+1.58 dB)
- Enforces single-channel mono acquisition and downmix for VoIP transport.

#### 6. 100% Strict TypeScript Migration
- 100% type-safe source tree (`.ts` / `.tsx`) with strict definitions for WebRTC parameters, Audio DSP pipelines, and telemetry snapshots.

---

## [v3.0.1] — 2026-08-16 "Aegis Guardian"

### ✨ New Features
- **Enhanced Audio Diagnostics:** Live codec bitrate display in WebRTC stats overlay.
- **Descriptive Error Logging:** Clear error messages for network failures and device permission denials.
- **Atomic Microphone Switching:** Mid-call track replacement with automated rollback on failure.
- **Spam Protection:** Global 5-second rate limit between incoming calls from the same peer.

### 🐛 Bug Fixes
- Fixed AudioContext closing on mid-call microphone switch to preserve active connection.
- Fixed incoming call handling when already on an active call (rejects with "User Busy").
- Resolved potential memory leak in ringtone oscillator playback.
- Hardened DTLS-SRTP fingerprint extraction regex for multi-format compatibility.
- Fixed Android Foreground Service initialization on cold boot.

---

## [v3.0.0] — 2026-08-16 "Aegis"

### 🎯 Initial Production Release
- **Defense-Grade End-to-End Encryption:** Direct DTLS-SRTP P2P encryption with zero intermediate server access.
- **5-Digit Safety Code:** Verbal verification code derived symmetrically from DTLS certificates for MITM detection.
- **Dynamic Audio Routing:** Real-time hardware enumeration and mid-call routing (Loudspeaker, Earpiece, Bluetooth SCO, Headsets).
- **Native Android APK:** Background foreground service with persistent call notification and wake locks.
- **Liquid Glassmorphism UI:** Accessible high-contrast interface with automated system dark/light theme sync.

---

## [v2.10.0] — 2026-08-10
- Initial WebRTC audio overhaul with custom SDP munging.
- Basic Web Audio high-pass filter (80Hz) and simple noise gate.
- Native Android platform integration with Capacitor.
