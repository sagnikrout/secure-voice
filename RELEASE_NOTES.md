# 🛡️ SecureVoice Release Notes

---

## v3.0.1 (Current) – "Aegis Guardian"

**Release Date:** August 16, 2026

### ✨ New Features
- **Enhanced Audio Diagnostics:** Live codec bitrate display in WebRTC stats overlay
- **Improved Error Messages:** More descriptive error logging for network failures
- **Better Microphone Switching:** Atomic track replacement with automatic rollback on failure
- **Rate Limiting:** Global 5-second rate limit between incoming calls from same peer to prevent spam

### 🐛 Bug Fixes
- Fixed audio context closing on mid-call microphone switch (preserves active connection)
- Fixed incoming call handling when already in active call (now properly rejects with "User Busy")
- Fixed potential memory leak in ringtone playback (cleanup oscillator references)
- Fixed inconsistent DTLS fingerprint extraction (now handles multiple formats)
- Fixed Android Foreground Service initialization on app start

### 🎨 Improvements
- **Performance:** Reduced stats polling CPU overhead by 15% (optimized getStats queries)
- **UX:** Auto-dismiss rate limit toast after 5 seconds instead of requiring manual close
- **Accessibility:** Added `aria-live` regions to call status updates
- **Code Quality:** Added comprehensive JSDoc comments to all public functions

### 📊 Testing
- ✅ 69/69 Unit & Integration Tests Passing
- ✅ 10/10 Headless 2-Peer E2E Simulations Passing
- ✅ 3/3 Network Impairment Scenario Tests Passing
- ✅ Android APK built and tested on API 24–34

### 📝 Documentation
- Added detailed contributing guidelines (CONTRIBUTING.md)
- Enhanced README with configuration and troubleshooting sections
- Added security architecture documentation
- Improved code examples and API documentation

---

## v3.0.0 (Previous) – "Aegis"

**Release Date:** August 16, 2026

### 🎯 Initial Production Release

**SecureVoice v3.0.0 "Aegis"** is the definitive first official production release, representing a complete ground-up architectural restructuring.

### ✨ Core Features

#### 🔐 Defense-Grade End-to-End Encryption
- Direct DTLS-SRTP P2P encryption of all audio media
- Ephemeral WebRTC DTLS keys generated per-call
- No intermediate signaling server can intercept or decrypt audio payloads
- 5-digit verbal Safety Code derived from DTLS fingerprints for MITM detection

#### 🎛️ Dynamic Audio Routing & Hardware Integration
- Real-time enumeration of all connected audio inputs/outputs
- Seamless mid-call switching (loudspeaker, earpiece, Bluetooth SCO, USB DACs, headphones)
- Proximity sensor support on Android (auto-switches to earpiece when held to ear)
- Dedicated in-call audio settings modal with device enumeration

#### 📉 Ultra-Low-Bandwidth Opus (6–16 kbps)
- Session bandwidth cap: `b=AS:16` kbps
- Mono voice target: `12 kbps` (maxaveragebitrate)
- Discontinuous Transmission (DTX): Silence suppression, 0 kbps on pauses
- In-band Forward Error Correction (FEC): Auto-recovery up to 10% packet loss
- Header optimization: `ptime=40ms / maxptime=60ms` (50% overhead reduction)
- Dynamic bitrate adaptation based on network conditions

#### 📞 Intelligent Call State Management
- Busy line rejection: Auto-rejects incoming calls when already in active call
- Missed call tracking with red indicator in recent contacts
- Instant remote teardown detection via WebRTC connection state watchers
- Automatic call cleanup on peer disconnection

#### 🎙️ Web Audio Processing Pipeline
- 80Hz high-pass filter (removes AC hum, wind rumble, sub-bass)
- DynamicsCompressor noise gate (-50dB threshold) with level normalization
- Isolated AudioContext per-call to prevent cross-talk with ringtones

#### 📊 Real-Time WebRTC Diagnostics
- Live in-call overlay HUD with:
  - Round-trip time (RTT) in milliseconds
  - Packet loss percentage
  - Current codec configuration
  - Transport candidate type (Direct P2P UDP vs TURN relay)
  - Input/output audio levels

#### 🔔 Synthetic Multi-Frequency Ringtone
- Browser-native oscillator pairs (440Hz + 480Hz)
- Device vibration pattern support
- Zero audio file downloads (all procedurally generated)

#### 🌓 Glassmorphism Design System
- High-contrast accessibility-focused UI
- Native Dark and Light mode support with OS theme synchronization
- Liquid glass aesthetic with smooth animations

#### 📱 Native Android Integration
- Capacitor framework for cross-platform support
- Foreground Service for persistent background calling
- Screen lock support (call remains connected when screen off)
- Proximity sensor integration

#### 📇 Instant Contact Book
- Local encrypted storage of recent contacts
- 1-tap call-back trigger
- Auto self-ID filtering
- Missed call indicators

#### 🔋 Battery-Aware Waveform Visualizer
- 60 FPS spectrum analyzer
- Automatic throttling when app backgrounded (document.hidden)
- Minimal CPU overhead during inactive periods

#### 🧹 Privacy-First Pre-Call Interface
- Zero hardware microphone activation until call initiated
- No permission prompts until necessary
- Microphone fully destroyed on call end (prevents hardware indicator leaks)
- Strict Content Security Policy headers

### 🔒 Security & Privacy

| Aspect | Implementation |
|--------|----------------|
| **Encryption** | DTLS-SRTP end-to-end, ephemeral keys per-call |
| **Data Retention** | Zero signaling server logs, no user data stored |
| **ID Generation** | crypto.getRandomValues() with rejection sampling |
| **Microphone Guard** | Tracks explicitly destroyed on call end |
| **CSP Headers** | Strict Content Security Policy prevents injection |
| **Local Storage** | Browser localStorage only, never transmitted |

### 📦 Deliverables

| Artifact | Size | Platform |
|----------|------|----------|
| Web PWA | ~89 kB (gzipped) | Modern browsers (Chrome, Edge, Safari, Firefox) |
| Android APK | 5.77 MB | Android 7.0+ (API 24+) |

### 🧪 Test Coverage

| Suite | Result | Details |
|-------|--------|----------|
| Unit & Integration (Vitest) | ✅ 69/69 Passed | 9 test files, audio filters, SDP munging, UI interactions |
| Headless 2-Peer E2E | ✅ 10/10 Passed | Chromium simulation, handshake, audio exchange, teardown |
| Network Impairment | ✅ 3/3 Passed | 250ms latency, packet loss, bitrate adaptation verification |
| Android Build | ✅ Built & Signed | Production APK compiled in 29 seconds |
| CI/CD Pipeline | ✅ Deployed | Automated test, build, publish to GitHub Pages |

### 📋 Known Limitations

- **Single peer calls only** (1:1 calling, not conference/group calls)
- **Audio only** (no video calling support)
- **Browser support** limited to modern Chromium/WebKit/Gecko engines (requires WebRTC support)
- **Signaling dependency** on PeerJS cloud signaling (can self-host PeerJS server if desired)
- **TURN relay** on IPv6-only networks may have limited support

### 🔄 Future Roadmap

- **v3.1** — Video calling support, screen sharing
- **v3.2** — Message encryption, text chat
- **v3.3** — Call recording and playback
- **v3.4** — Advanced network statistics dashboard
- **v4.0** — Peer server federation, self-hosted signaling

---

## Migration Guide

### From v2.x to v3.0
- **Breaking:** Old `.apk` binaries incompatible with v3.0+ (download new APK)
- **Breaking:** Peer IDs format unchanged, but all v2.x calls will fail (different encryption keys)
- **Recommended:** Clear app cache/data on Android before installing v3.0

### Upgrading from v3.0 to v3.0.1
- **Non-breaking:** All v3.0 Peer IDs continue to work
- **Recommended:** Update Android APK for bug fixes and performance improvements
- **Note:** Existing localStorage recent calls preserved

---

## Support & Feedback

- **Report Issues:** https://github.com/sagnikrout/secure-voice/issues
- **Feature Requests:** Use GitHub Discussions or Issues
- **Security Vulnerabilities:** Contact maintainers privately
- **Live App:** https://sagnikrout.github.io/secure-voice

---

## License

All releases distributed under **MIT License**. See LICENSE file for details.

© 2026 Sagnik Rout. All rights reserved.
