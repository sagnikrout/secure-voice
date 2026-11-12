# System Architecture

SecureVoice is an end-to-end encrypted, peer-to-peer VoIP client built with WebRTC. It delivers low-latency voice communication with hardware-accelerated noise suppression and survivability across high-loss networks.

## Architecture & Media Flow

### 1. Signaling Phase
- **Discovery**: Callers exchange 9-character human-readable peer IDs (`PEER_ID_ALPHABET`).
- **Encrypted Envelopes**: All signaling payloads (SDP offers, answers, and ICE candidates) are encrypted client-side using Web Crypto ECDH (P-256) and AES-256-GCM.
- **Relay Transport**: Signaled over WebSocket broker relays or air-gapped QR codes with zero plain-text SDP exposure.
- **Anti-Downgrade Security**: Unencrypted signaling messages are dropped to prevent man-in-the-middle protocol downgrade.

### 2. Media Transport Phase
- **Direct P2P UDP**: Media streams travel directly between peers using WebRTC DTLS-SRTP encryption without intermediate media servers.
- **NAT Traversal**: Host and Server-Reflexive candidate gathering via STUN with automatic TURN relay fallback.
- **Bandwidth Control**: SDP session bandwidth ceilings (`b=AS:42`) and adaptive bitrate ladders prevent bufferbloat.

---

## Subsystem Details

### 1. Web Audio & Neural Speech Enhancement (`src/core/audioEngine.ts`, `src/utils/audio.ts`)
Microphone audio routes through a real-time Web Audio graph:

| Processing Node | Type / Filter | Function |
| :--- | :--- | :--- |
| **Highpass Filter** | Biquad (`frequency: 80Hz`) | Cuts mechanical desk rumblings and handling thumps. |
| **Peaking Filter** | Biquad (`frequency: 2.8kHz, Q: 1.0, gain: +2dB`) | Accentuates human voice presence and intelligibility. |
| **Hiss Cut Filter** | Biquad (`frequency: 8.5kHz`) | Eliminates high-frequency electrical hiss. |
| **RNNoise Neural Engine**| AudioWorklet (`@echogarden/rnnoise-wasm`) | Spectral suppression of non-stationary acoustic noise. |
| **RMS Noise Gate** | Dynamic gain control | Attenuates background room acoustics between spoken words. |
| **Dynamics Compressor** | DynamicsCompressorNode | Balances amplitude disparities (-20dB threshold, 3:1 ratio). |
| **Makeup Gain** | GainNode (`+1.21dB`) | Restores post-compression signal level. |

### 2. Telecom & Network Adaptation Engine (`src/core/telecomEngine.ts`, `src/utils/networkAdaptation.ts`)
- **Adaptive Opus Ladder**: 6 tiers from 8 kbps down to 2.4 kbps survival floor for weak links, scaling up to 40 kbps Fullband HD on broadband.
- **Packet Aggregation**: Ptime scaling from 20ms to 100ms reduces packet header overhead by up to 50%.
- **RFC 2198 Redundancy**: Injects redundant audio packets to recover from up to 50% packet loss without audible frame drops.
- **Traffic Shaping**: Marks audio RTP packets with DSCP Expedited Forwarding (DiffServ 46).

### 3. NetEQ Playout Stabilization (`src/utils/jitterBufferController.ts`)
- Dual-clamped jitter buffer targets (`jitterBufferTarget` and `playoutDelayHint`) lock receiver buffering to fixed floors, preventing NetEQ pitch-shifting artifacts on high-jitter links.

### 4. Connection Circuit Breaker & Reconnection (`src/utils/iceRestartManager.ts`)
- **Grace Period**: 1500 ms grace period on network disruption before declaring connection interruption.
- **Exponential Backoff**: Up to 5 non-destructive ICE restarts with backoff pacing.
- **Circuit Breaker**: Halts reconnection loops when network recovery is mathematically impossible.
