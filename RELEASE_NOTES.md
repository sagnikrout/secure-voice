# 🛡️ SecureVoice v3.0.0 "Aegis" – Official Production Release Notes

> **Version:** `v3.0.0`  
> **Codename:** **Aegis**  
> **Release Type:** Stable Production General Availability (GA)  
> **Live Web Application:** [https://sagnikrout.github.io/secure-voice](https://sagnikrout.github.io/secure-voice)  
> **Android Release Package:** [`SecureVoice-v3.0.apk`](SecureVoice-v3.0.apk) (*5.77 MB*)

---

## 🌟 Overview & Release Declaration

**SecureVoice v3.0.0 "Aegis"** marks the definitive, first official production release of SecureVoice. This release represents a ground-up architectural restructuring and complete codebase refactoring, establishing a unified, defense-grade standard for peer-to-peer encrypted, ultra-low-bandwidth voice communications.

> [!IMPORTANT]
> **Notice of Baseline Consolidation:** This release supersedes and completely overrides all previous experimental, legacy alpha, and beta iterations. All dependencies, cryptographic primitives, audio routing pipelines, and Android native wrappers are locked and consolidated in this build.

---

## ✨ Key Feature Highlights

### 1. 🔐 Defense-Grade End-to-End Encryption & MITM Detection
- **Direct DTLS-SRTP P2P Encryption:** Voice media is encrypted directly at the client endpoints using ephemeral WebRTC DTLS keys. No intermediate signaling server, proxy, or relay possesses the capability to intercept or decrypt media payloads.
- **5-Digit Verbal Safety Code (SAS):** Generates a deterministic, collision-resistant 5-digit verification code derived directly from DTLS session certificate fingerprints. Enables instant out-of-band verbal confirmation against Man-in-the-Middle (MITM) attacks.

### 2. 🎛️ Dynamic Audio Routing & In-Call Settings Modal
- **Comprehensive Hardware Enumeration:** Dynamically detects and lists all connected audio outputs (Loudspeaker, Handset Earpiece with proximity detection, Bluetooth SCO Headsets, USB DACs, External Headphones) and discrete microphones.
- **Runtime Hot-Switching:** Switch seamlessly between audio sinks and microphones during an active call without audio dropping or track restarts.
- **Dedicated In-Call Action Dock:** Replaced detached controls with a unified, accessible action controller and modal dialog.

### 3. 📉 Ultra-Low-Bandwidth Opus Voice Tuning (6 – 16 kbps)
- **Session Bandwidth Capped at 16 kbps (`b=AS:16`):** Enforces strict bitrate ceilings to guarantee high intelligibility over 2G/3G cellular networks, satellite links, dial-up, and congested public Wi-Fi.
- **12 kbps Mono Voice Target (`maxaveragebitrate=12000`):** Tuned specifically for vocal frequencies while slashing bandwidth consumption.
- **Silence Suppression (`usedtx=1`):** Discontinuous Transmission transmits 0 kbps during natural conversational pauses, reducing overall bandwidth usage by up to 45%.
- **In-Band Forward Error Correction (`useinbandfec=1`):** Automatically recovers dropped packets up to 10% packet loss without audio stutter.
- **Reduced Header Overhead (`ptime=40ms` / `maxptime=60ms`):** Decreases IP/UDP/RTP packet headers by 50% compared to standard WebRTC configurations.

### 4. 📞 Intelligent Call State Management & Busy Line Handling
- **Busy Line Rejection:** If Person C calls while Person A and B are engaged in an active call, the incoming call is automatically rejected with an immediate "User Busy" signal.
- **Missed Call Tracking:** Automatically logs busy-line call attempts in **Recent Contacts** marked with a prominent `<PhoneMissed />` red indicator and a 1-tap call-back trigger.
- **Instant Remote Teardown Watchdog:** Added WebRTC connection state watchers and audio track `.onended` listeners to terminate sessions immediately when a peer hangs up, closes their tab, or loses connection.

### 5. 🧹 Privacy-First Pre-Call Interface
- **Zero Hardware Leakage:** Hardware microphones and audio streams remain completely inert and un-accessed until a call is explicitly initiated or answered.
- **Minimalist Dashboard:** Clean, distraction-free landing page with 1-click Peer ID copy and quick diagnostic shortcuts.

### 6. 📊 Real-Time WebRTC Diagnostics & Telemetry
- **Live In-App HUD:** In-call diagnostic overlay providing live stats on round-trip latency (RTT), packet loss percentage, audio signal levels, codec configuration, and transport candidate types (`Direct P2P UDP` vs `TURN Relay`).

### 7. 📱 Native Android APK Integration
- **Persistent Background Calling:** Capacitor-powered native Android build with integrated **Foreground Service** to maintain P2P connectivity when the app is minimized or the screen is locked.
- **Proximity Sensor Support:** Automatically turns the screen off and switches audio to the earpiece receiver when held to the ear.

---

## 🧪 Comprehensive Verification Results

All automated test suites, simulation harnesses, and network impairment tests passed with **100% success**:

| Verification Suite | Result | Details |
| :--- | :--- | :--- |
| **Unit & Integration Suite (`vitest`)** | ✅ **69/69 Passed** | 9 test suites covering audio filters, SDP transformations, formatters, and UI interactions with 0 warnings. |
| **Headless 2-Peer WebRTC E2E Test** | ✅ **10/10 Passed** | Spawns two isolated Chromium instances, verifies handshake, audio exchange, getStats telemetry, and clean teardown. |
| **Network Impairment Simulation** | ✅ **3/3 Passed** | Verified Opus FEC reconstruction, DTX silence compression, and dynamic bitrate down-stepping under 250ms latency and packet loss. |
| **Android Release Build (`gradlew`)** | ✅ **Built & Signed** | Production APK compiled in 29 seconds: `SecureVoice-v3.0.apk` (5.77 MB). |
| **GitHub Pages CI/CD Pipeline** | ✅ **Deployed** | Production bundle compiled and published live. |

---

## 📦 Package Artifacts & Checksums

| Artifact | Type | Size | Platform |
| :--- | :--- | :--- | :--- |
| **[SecureVoice Web](https://sagnikrout.github.io/secure-voice)** | PWA / Static Web App | ~296 kB (gzipped: 89 kB) | Modern Browsers (Chrome, Edge, Safari, Firefox) |
| **[`SecureVoice-v3.0.apk`](SecureVoice-v3.0.apk)** | Signed Production APK | 5.77 MB | Android 7.0+ (API 24+) |

---

## 🚀 Quick Start Guide

### Web (Instant Zero-Install Access)
1. Open **[https://sagnikrout.github.io/secure-voice](https://sagnikrout.github.io/secure-voice)**.
2. Copy your 9-character **Peer ID** and share it with your contact.
3. Enter your contact's Peer ID in the **New Call** box and click **Call**.

### Android Installation
1. Download **[`SecureVoice-v3.0.apk`](SecureVoice-v3.0.apk)** directly to your Android device.
2. Open the `.apk` file and tap **Install** (allow installation from unknown sources if prompted).
3. Grant Microphone and Notification permissions on first launch.

---

## 📄 License & Attribution

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for terms.
© 2026 Sagnik Rout. All rights reserved.
