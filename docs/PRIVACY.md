# Privacy policy

SecureVoice operates strictly on a zero-telemetry, zero-knowledge architecture.

## Data collection and retention
- **Server logs**: SecureVoice operates without central media servers. We do not collect, process, or store call durations, participant IP addresses, or connection metadata. 
- **Local storage**: Call history and diagnostic logs are stored exclusively in the client device's volatile session storage. This data is permanently destroyed when the application process terminates.
- **Third-party SDKs**: The application embeds zero third-party analytics, crash reporting, or advertising SDKs.

## TURN server infrastructure
If the peer-to-peer connection requires a TURN relay due to NAT constraints, the TURN server administrator will observe the IP addresses of both endpoints and the encrypted UDP traffic volume. The media payloads remain encrypted end-to-end and inaccessible to the TURN provider.

## Contact
For data privacy inquiries or to request further architectural details, refer to the project repository.
