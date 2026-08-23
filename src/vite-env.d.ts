/// <reference types="vite/client" />

declare interface Window {
  __SECUREVOICE_ACTIVE_PC__?: RTCPeerConnection | null;
  webkitAudioContext?: typeof AudioContext;
}

declare module 'human-signals';
