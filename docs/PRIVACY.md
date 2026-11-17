# Privacy notice

SecureVoice is designed to keep call audio between the participating WebRTC endpoints. This does not mean that all call-related information is invisible to network services or other parties.

## Information on your device

The app stores preferences and recent-call information locally in the browser or Android app environment. Local data may remain until it is cleared by the user or removed by the operating system. Anyone with access to an unlocked device or its app data may be able to access it.

## Services used for calls

Call setup uses signaling infrastructure, and connection establishment may use public STUN or TURN services configured by the application. These services may receive network addresses, peer identifiers, connection metadata, or encrypted traffic needed to provide their function. A TURN operator can observe the network addresses of connected endpoints and the volume and timing of relayed traffic, but WebRTC media remains encrypted between endpoints when the connection is correctly established.

The current ICE server configuration is in src/constants/config.ts. Service operators' own retention and privacy practices are outside this project's control.

## Limits

The app does not protect audio on a compromised device, prevent the other participant from recording a call, conceal all traffic metadata, or guarantee that a call will connect. Browser and Android permissions control microphone access. Review the current code and service configuration before relying on the app for sensitive communications.

For security assumptions and responsible disclosure, see the security policy.
