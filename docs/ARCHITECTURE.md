# Architecture

SecureVoice is a peer-to-peer VoIP client built with WebRTC. It prioritizes connection stability and voice clarity over weak networks (2G, EDGE, and high-loss wireless links).

## System diagram

```
┌────────────────────────────────────────────────────────┐
│            Signaling Relay / Transports                │
│    (PeerJS / Custom WebSocket / Air-Gapped QR Code)    │
└───────────────▲────────────────────────▲───────────────┘
                │                        │
  1. Ephemeral  │                        │ 2. E2E Encrypted SDP
  ECDH PubKey   │                        │    (AES-256-GCM)
  & Ciphertext  │                        │    & ICE Candidates
                │                        │
    ┌───────────▼──────────┐ ┌───────────▼──────────┐
    │    Local client      │ │    Remote client     │
    │   (SecureVoice)      │ │   (SecureVoice)      │
    └───────────┬──────────┘ └───────────┬──────────┘
                │                        │
                │ 3. P2P DTLS-SRTP media │
                │    (direct UDP)        │
                ▼                        ▼
    ┌───────────────────────────────────────────────┐
    │          Encrypted voice transport            │
    │     (RFC 2198 RED + Opus narrowband SILK)     │
    └───────────────────────────────────────────────┘
```

## Subsystems

### 1. Web Audio pre-processing (`src/utils/audio.ts`)
Filters microphone audio before passing it to the WebRTC encoder:
1. 80 Hz highpass filter: Cuts handling noise and desk vibration.
2. 2.8 kHz peaking filter (+3 dB): Boosts human vocal presence.
3. 4.2 kHz lowpass filter: Removes high-frequency hiss and fan noise.
4. Downward RMS noise gate (-46 dBFS): Silences background noise between words with a 10ms attack and 80ms hold.
5. Dynamics compressor: Balances volume between loud and quiet speech (-18 dB threshold, 4:1 ratio).
6. Makeup gain (1.2x / +1.58 dB): Restores output signal level after compression.

### 2. Low-bandwidth transport and redundancy (`src/utils/webrtc.ts`)
- Narrowband SILK (`maxplaybackrate=8000`): Allocates all bitrate to the 300 Hz–3400 Hz voice band.
- Constant bitrate (`cbr=1`): Stops packet size bursts that cause bufferbloat on congested towers.
- Packet aggregation (`ptime=80..100`, `maxptime=120`): Combines audio frames to send 10–12.5 packets per second instead of 50, reducing header overhead by 80%.
- RFC 2198 redundancy (`audio/red`): Transmits duplicate audio payloads to recover lost packets without retransmissions.

### 3. NetEQ jitter buffer floor (`src/utils/jitterBufferController.ts`)
Locks the WebRTC receiver jitter buffer target to avoid NetEQ pitch-shifting and robotic audio on unstable links:
- HQ: 120 ms
- STD: 160 ms
- LB: 200 ms
- HL: 250 ms
- EXT: 300 ms
- ULTRA: 400 ms

### 4. Telemetry and adaptive bitrate ladder (`src/utils/networkAdaptation.ts`)
- Samples WebRTC stats every second for RTT, packet loss, jitter, and concealment ratios.
- Uses exponential moving average (EMA) smoothing to avoid rapid bitrate switching.
- Uses asymmetric stepping: drops down immediately when loss spikes, but waits for 4 stable samples before stepping up.

### 5. ICE reconnect and TURN fallback (`src/utils/turnManager.ts`, `src/utils/iceRestartManager.ts`)
- 1500ms grace period on disconnect before triggering renegotiation.
- Exponential backoff ICE restarts preserving active media streams and UI state.
- Ephemeral TURN ping tests that rank relays by latency and force relay mode after 3 failed direct P2P attempts.
