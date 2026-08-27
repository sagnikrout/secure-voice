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
    │     (RFC 2198 RED + Opus Wideband / Lyra)     │
    └───────────────────────────────────────────────┘
```

## Subsystems

### 1. Web Audio pre-processing (`src/utils/audio.ts`)
Filters microphone audio before passing it to the WebRTC encoder:
1. 80 Hz highpass filter: Cuts handling noise and desk vibration.
2. 2.8 kHz peaking filter (+2.0 dB, Q=1.0): Boosts human vocal formant presence.
3. 8.5 kHz lowpass filter: Removes high-frequency electrical hiss while preserving speech consonants.
4. Downward RMS noise gate (-48 dBFS): Silences background room noise between words with a 10ms attack, 80ms hold, and 150ms release.
5. Dynamics compressor: Balances volume between loud and quiet speech (-20 dB threshold, 15 dB knee, 3:1 ratio).
6. Makeup gain (1.15x / +1.21 dB): Restores output signal level after compression.

### 2. Transport and loss recovery (`src/utils/webrtc.ts`)
- Wideband encoding (`maxplaybackrate=16000`): Preserves full speech harmonics up to 8 kHz.
- Variable bit rate (`cbr=0`): Eliminates metallic quantization artifacts during active phonemes.
- Lock-step packetization (`ptime=40`, `maxptime=60`): Transmits 25 packets per second, cutting IP/UDP/RTP packet header overhead by 50%.
- RFC 2198 redundancy (`audio/red`): Transmits redundant audio frames to recover lost packets without retransmissions.

### 3. NetEQ jitter buffer floor (`src/utils/jitterBufferController.ts`)
Locks the WebRTC receiver jitter buffer target and playout delay hint to prevent NetEQ pitch-shifting and time-stretching on unstable links:
- HQ: 120 ms
- STD: 160 ms
- LB: 200 ms
- HL: 250 ms
- EXT: 300 ms
- ULTRA: 400 ms

### 4. Telemetry and adaptive bitrate ladder (`src/utils/networkAdaptation.ts`)
- Samples WebRTC statistics every second for RTT, packet loss, jitter, and concealment ratios.
- Uses exponential moving average (EMA) smoothing to prevent rapid bitrate switching.
- Uses asymmetric stepping: steps down immediately on packet loss spikes, but requires 4 stable samples before stepping up.

### 5. ICE reconnect and TURN fallback (`src/utils/turnManager.ts`, `src/utils/iceRestartManager.ts`)
- 1500ms grace period on disconnect before triggering renegotiation.
- Exponential backoff ICE restarts preserving active media streams and UI state.
- Ephemeral TURN ping tests that rank relays by latency and force relay mode after 3 failed direct P2P attempts.
