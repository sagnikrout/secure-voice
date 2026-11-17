# Performance measurement

This document describes how to run the repository's performance-related checks. It does not publish fixed latency, CPU, bandwidth, or packet-loss guarantees. Results depend on hardware, browser, operating system, and network conditions.

## Available checks

- npm run benchmark: network-resilience benchmark script.
- npm run test:network: simulated network impairment checks.
- npm run test:sim: WebRTC simulation runner.
- npx tsx scripts/benchmark-audio-pipeline.ts: audio-pipeline benchmark.
- npx tsx scripts/benchmark-real-voice-notes.ts: RNNoise benchmark using local audio samples; inspect the script for its input requirements.

Run npm ci before running these commands. Some scripts may require a browser, emulator, or additional test data.

## Reporting measurements

Include the command and commit, device and operating system, browser/WebView version, input audio or network profile, sample count, and whether the result came from a simulation or a real call. Do not compare results from different conditions as if they were equivalent. Keep generated or user-provided recordings out of commits unless their licensing and privacy status are clear.

For current codec configuration, see src/constants/config.ts and docs/CODEC_ENGINE.md.
