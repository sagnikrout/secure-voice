# 🏗️ SecureVoice Architecture & Design

SecureVoice is designed from the ground up as a zero-trust, privacy-first, peer-to-peer VoIP communicator optimized for extreme resilience over 2G, EDGE, high-loss, and high-latency networks.

---

## 🏛️ System Architecture

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 PeerJS Cloud Signaling                 │
                  │             (Ephemeral Discovery / Routing)            │
                  └───────────────▲────────────────────────▲───────────────┘
                                  │                        │
                    1. Peer ID    │                        │ 2. Encrypted Offer/Answer
                    Registration  │                        │    & ICE Candidates
                                  │                        │
                      ┌───────────▼──────────┐ ┌───────────▼──────────┐
                      │    Local Client      │ │    Remote Client     │
                      │   (SecureVoice)      │ │   (SecureVoice)      │
                      └───────────┬──────────┘ └───────────┬──────────┘
                                  │                        │
                                  │ 3. P2P DTLS-SRTP Media │
                                  │    (AES-128 / 256 GCM) │
                                  ▼                        ▼
                      ┌───────────────────────────────────────────────┐
                      │      Direct Encrypted Voice Stream (E2EE)     │
                      │     (RFC 2198 RED + Opus Narrowband SILK)     │
                      └───────────────────────────────────────────────┘
```

---

## 🧩 Architectural Subsystems

### 1. 6-Stage Web Audio DSP Vocal Formant Pipeline (`src/utils/audio.ts`)
Processes microphone audio in real time prior to WebRTC encoding:
1. **80 Hz Butterworth Highpass Filter:** Eliminates low-frequency handling noise, mechanical rumble, and wind buffering.
2. **2.8 kHz Peaking Equalizer (+3 dB):** Amplifies formant harmonics to maximize human vocal intelligibility.
3. **4.2 kHz Lowpass Filter:** Rejects ambient hiss, fan noise, and high-frequency background interference.
4. **Active Downward RMS Noise Gate (-46 dBFS):** Mutes background ambient room noise during speech pauses with smooth 10ms attack and 80ms hold.
5. **Dynamics Compressor:** Levels volume dynamics (-18 dB threshold, 12 dB knee, 4:1 ratio).
6. **Makeup Gain (1.2x / +1.58 dB):** Restores optimal signal-to-noise output gain.

### 2. Extreme Low-Bandwidth Opus & RED Transport (`src/utils/webrtc.ts`)
- **Narrowband SILK Mode (`maxplaybackrate=8000`):** Focuses bit allocation on the 300 Hz – 3400 Hz voice band.
- **Constant Bitrate (`cbr=1`):** Completely eliminates packet burst spikes to prevent cell tower queue bufferbloat.
- **Packet Aggregation (`ptime=80–100ms`, `maxptime=120ms`):** Drops packet frequency to 10–12.5 pkts/sec, cutting network header overhead by 80%.
- **RFC 2198 Audio Redundancy (`audio/red`):** Injects redundant primary/secondary audio packets for up to 50% packet loss recovery.

### 3. Locked NetEQ Jitter Buffer Controller (`src/utils/jitterBufferController.ts`)
- Prevents WebRTC NetEQ time-stretching and robotic pitch distortion by locking the jitter buffer target floor:
  - `HQ (2G Stable):` 120 ms
  - `STD (2G Normal):` 160 ms
  - `LB (2G Congested):` 200 ms
  - `HL (2G High Loss):` 250 ms
  - `EXT (2G Survival):` 300 ms
  - `ULTRA (Extreme / Satellite):` 400 ms

### 4. Telemetry & 5-Tier Adaptive Bitrate Ladder (`src/utils/networkAdaptation.ts`)
- Samples real-time `getStats()` (RTT, uplink loss, downlink loss, jitter, jitter buffer delay, concealment ratio).
- Exponential Moving Average (EMA) smoothing prevents flapping.
- Asymmetric hysteresis: Instant 1-tick downgrade on congestion; conservative 4-tick stable upgrade.

### 5. Self-Healing ICE Restart & TURN Manager (`src/utils/turnManager.ts`, `src/utils/iceRestartManager.ts`)
- 1500ms silent grace window avoids premature drops during brief handoffs.
- 5-step exponential backoff ICE restart renegotiation preserving audio streams and UI session state.
- Ephemeral TURN server latency probing with automatic forced-relay failover.
