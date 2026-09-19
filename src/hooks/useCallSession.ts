import { useState, useRef, useCallback, useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  unlockAudioContext,
  createDenoisePipeline,
  playRingtone,
  stopMediaStream
} from '../utils/audio';
import { transformOpusSdp } from '../utils/webrtc';
import { CallPeerCoordinator } from '../utils/callPeerCoordinator';
import { saveCallHistory } from '../components/RecentCalls';
import {
  setAudioOutputMode,
  requestAudioFocus,
  abandonAudioFocus,
  addAudioFocusListener
} from '../utils/audioRouting';
import { TIMINGS, LADDER_TIERS, STORAGE_KEYS, LYRA_CONFIG, CODEC_CROSSOVER_CONFIG } from '../constants/config';
import { audioResourceManager } from '../utils/resourceManager';
import { structuredLogger } from '../utils/structuredLogger';
import { auditoryFeedback } from '../utils/auditoryFeedback';
import { lyraManager, lyraTransformController, lyraWasmLoader } from '../utils/lyra';
import { CodecType, CodecPreference, LyraBitrate } from '../types';
import { platform } from '../platform';

/**
 * Main call session hook managing call lifecycle, audio streams, and WebRTC state
 * @param {Object} options
 * @param {Function} options.addLog - Logging callback
 * @param {Function} options.onStatusChange - Status change callback
 * @param {string} options.selectedInputId - Preferred microphone device ID
 * @returns {Object} Call session controls and state
 */
export function useCallSession({ addLog, onStatusChange, selectedInputId }) {
  // Active Streams & Refs
  const rawStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const pipelineNodesRef = useRef(null);
  const pipelineCleanupRef = useRef(null);
  const callRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioFocusListenerRef = useRef(null);

  // WebRTC Peer Connection & Telemetry Coordinator
  const endCallRef = useRef<() => void>(() => {});
  const coordinatorRef = useRef<CallPeerCoordinator | null>(null);

  // Lazy initialization of CallPeerCoordinator
  if (!coordinatorRef.current) {
    coordinatorRef.current = new CallPeerCoordinator({
      onStatusChange: (status) => {
        if (status === 'in-call') {
          setIsInCall(true);
        }
        callbacksRef.current.onStatusChange?.(status);
      },
      onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level),
      onSafetyCode: (code) => setSafetyCode(prev => prev || code),
      onQualityChange: (q) => setQuality(q),
      onTierChange: (tier, bps) => {
        setActiveTier(tier);
        currentBitrateRef.current = bps;
      },
      onTelemetrySnapshot: (snapshot) => setLiveTelemetry(snapshot),
      onCodecChange: (codec) => setActiveCodec(codec),
      onFatalDisconnect: () => {
        callbacksRef.current.addLog?.('Connection recovery failed after 5 attempts. Terminating call.', 'error');
        endCallRef.current?.();
      },
      getPreferredCodec: () => preferredCodecRef.current,
      getActiveCodec: () => activeCodecRef.current
    });
  }

  // Timers & Stats Tracking
  const dialTimeoutRef = useRef(null);
  const incomingTimeoutRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const currentBitrateRef = useRef(LADDER_TIERS[0].maxBitrateBps);

  // Call States
  const [isInCall, setIsInCall] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [connectedPeer, setConnectedPeer] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [activeOutputId, setActiveOutputId] = useState('speaker');
  const [quality, setQuality] = useState('good');
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null);
  const [safetyCode, setSafetyCode] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [activeTier, setActiveTier] = useState(LADDER_TIERS[0]);
  const [liveTelemetry, setLiveTelemetry] = useState(null);

  // Neural Codec & Dynamic Crossover State
  // Default to Lyra v2 when SIMD is available — the primary use case is throttled/jittery
  // mobile connections where Lyra v2 outperforms Opus. Only fall back to Opus when the
  // link is consistently excellent.
  const [preferredCodec, setPreferredCodecState] = useState<CodecPreference>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.PREFERRED_CODEC);
        if (saved === 'auto' || saved === 'opus' || saved === 'lyra') return saved as CodecPreference;
      } catch (e: any) {}
    }
    // Default: Opus for natural voice. Lyra is an ultra-low bandwidth fallback.
    return 'opus';
  });
  const [activeCodec, setActiveCodec] = useState<CodecType>('opus');
  const crossoverHealthyTicksRef = useRef(0);
  const activeCodecRef = useRef<CodecType>(activeCodec);
  const preferredCodecRef = useRef<CodecPreference>(preferredCodec);

  const setPreferredCodec = useCallback((codec: CodecPreference) => {
    setPreferredCodecState(codec);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEYS.PREFERRED_CODEC, codec);
      } catch (e: any) {}
    }
    const label = codec === 'auto'
      ? 'Smart Auto Crossover (Lyra v2 <14k, Opus ≥14k)'
      : (codec === 'lyra' ? 'Google Lyra v2 Neural (3.2 kbps)' : 'Standard Opus');
    callbacksRef.current.addLog?.(`Preferred voice codec set to: ${label}`, 'info');
  }, []);

  // Ringtone player cleanup ref
  const stopRingtoneRef = useRef(null);
  const acquiringMicRef = useRef(false);
  const setupTimeoutsRef = useRef([]);

  // Store callbacks in a ref to prevent infinite re-renders & stale closures
  const callbacksRef = useRef({ addLog, onStatusChange });
  useEffect(() => {
    callbacksRef.current = { addLog, onStatusChange };
  }, [addLog, onStatusChange]);

  const selectedInputIdRef = useRef(selectedInputId);
  useEffect(() => {
    selectedInputIdRef.current = selectedInputId;
  }, [selectedInputId]);

  // Keep codec refs in sync with state
  useEffect(() => { activeCodecRef.current = activeCodec; }, [activeCodec]);
  useEffect(() => { preferredCodecRef.current = preferredCodec; }, [preferredCodec]);

  // Timer controls
  const startTimer = useCallback(() => {
    setCallDuration(0);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  /**
   * Complete teardown of call session and hardware release
   */
  const endCall = useCallback(() => {
    // 1. Abandon Native Audio Focus and Wake Lock
    abandonAudioFocus();
    platform.releaseWakeLock().catch(() => {});
    if (audioFocusListenerRef.current?.remove) {
      audioFocusListenerRef.current.remove();
      audioFocusListenerRef.current = null;
    }

    // 2. Detach and reset WebRTC peer coordinator
    coordinatorRef.current?.detach();

    // 3. Close PeerJS call
    if (callRef.current) {
      try { callRef.current.close(); } catch (e: any) {}
      callRef.current = null;
    }
    if (typeof window !== 'undefined') {
      window.__SECUREVOICE_ACTIVE_PC__ = null;
    }

    // 4. Clear remote audio
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    // 5. Clean audio pipeline & stop all media tracks explicitly
    if (pipelineCleanupRef.current) {
      try { pipelineCleanupRef.current(); } catch (e: any) {}
      pipelineCleanupRef.current = null;
    }
    stopMediaStream(rawStreamRef.current);
    stopMediaStream(processedStreamRef.current, audioCtxRef.current, pipelineNodesRef.current);
    audioResourceManager.cleanupAll();
    rawStreamRef.current = null;
    processedStreamRef.current = null;
    audioCtxRef.current = null;
    pipelineNodesRef.current = null;

    // 6. Clear all timeouts and intervals
    if (dialTimeoutRef.current) { clearTimeout(dialTimeoutRef.current); dialTimeoutRef.current = null; }
    if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }
    setupTimeoutsRef.current.forEach(id => clearTimeout(id));
    setupTimeoutsRef.current = [];

    // 7. Stop Ringtone and clean oscillators
    if (stopRingtoneRef.current) {
      stopRingtoneRef.current();
      stopRingtoneRef.current = null;
    }

    // 8. Clean Lyra neural codec state
    lyraManager.reset();
    lyraTransformController.reset();
    setActiveCodec('opus');

    // 9. Reset states
    stopTimer();
    setIsInCall(prevInCall => {
      if (prevInCall) {
        auditoryFeedback.notifyDisconnected();
      }
      return false;
    });
    setIsCalling(false);
    setConnectedPeer('');
    setIsMuted(false);
    setQuality('good');
    setIncomingCall(null);
    try { LocalNotifications.cancel({ notifications: [{ id: 1122 }] }).catch(() => {}); } catch(e) {}
    setSafetyCode(null);
    setIsVerified(false);
    setActiveTier(LADDER_TIERS[0]);
    setLiveTelemetry(null);
    currentBitrateRef.current = LADDER_TIERS[0].maxBitrateBps;
    callbacksRef.current.onStatusChange?.('ready');
    callbacksRef.current.addLog?.('Call terminated and audio pipeline cleanly released', 'info');
  }, [stopTimer]);

  useEffect(() => {
    endCallRef.current = endCall;
    coordinatorRef.current?.updateCallbacks({
      onStatusChange: (status) => {
        if (status === 'in-call') {
          setIsInCall(true);
        }
        callbacksRef.current.onStatusChange?.(status);
      },
      onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level),
      onSafetyCode: (code) => setSafetyCode(prev => prev || code),
      onQualityChange: (q) => setQuality(q),
      onTierChange: (tier, bps) => {
        setActiveTier(tier);
        currentBitrateRef.current = bps;
      },
      onTelemetrySnapshot: (snapshot) => setLiveTelemetry(snapshot),
      onCodecChange: (codec) => setActiveCodec(codec),
      onFatalDisconnect: () => {
        callbacksRef.current.addLog?.('Connection recovery failed after 5 attempts. Terminating call.', 'error');
        endCall();
      },
      getPreferredCodec: () => preferredCodecRef.current,
      getActiveCodec: () => activeCodecRef.current
    });
  }, [endCall]);

  /**
   * Request & build microphone stream with Web Audio processing
   */
  const acquireMicrophone = useCallback(async () => {
    if (processedStreamRef.current && processedStreamRef.current.active) {
      return processedStreamRef.current;
    }
    if (acquiringMicRef.current) {
      // Prevent concurrent getUserMedia calls from leaking orphaned streams
      throw new Error('Microphone acquisition already in progress');
    }
    acquiringMicRef.current = true;

    await unlockAudioContext();
    callbacksRef.current.addLog?.('Requesting hardware microphone access...', 'info');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputIdRef.current ? { exact: selectedInputIdRef.current } : undefined,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      rawStreamRef.current = stream;
      callbacksRef.current.addLog?.('Microphone access granted', 'ok');

      const { processedStream, audioCtx, nodes, cleanup } = createDenoisePipeline(stream);
      processedStreamRef.current = processedStream;
      audioCtxRef.current = audioCtx;
      pipelineNodesRef.current = nodes;
      pipelineCleanupRef.current = cleanup;

      // Ensure CPU stays awake during call when screen turns off
      platform.acquireWakeLock().catch(() => {});

      if (audioCtx) {
        callbacksRef.current.addLog?.('Web Audio 6-stage filter & noise gate active', 'ok');
      }

      // Initialize Google Lyra v2 Neural Codec if 'lyra' is explicitly preferred
      // If 'auto', we start with 'opus' and dynamically switch to Lyra only if the network degrades.
      if (preferredCodec === 'lyra' && lyraWasmLoader.checkCompatibility().simd) {
        try {
          const lyraReady = await lyraManager.init({ audioCtx: audioCtx || undefined });
          if (lyraReady) {
            setActiveCodec('lyra');
            callbacksRef.current.addLog?.('Google Lyra v2 Neural Codec active (3.2 kbps wideband speech)', 'ok');
          } else {
            setActiveCodec('opus');
            callbacksRef.current.addLog?.('Opus SILK codec active (fallback)', 'info');
          }
        } catch (e: any) {
          setActiveCodec('opus');
        }
      } else {
        if (preferredCodec === 'auto' && lyraWasmLoader.checkCompatibility().simd) {
          // Pre-warm Lyra in the background for instant crossover if needed later
          lyraManager.init({ audioCtx: audioCtx || undefined }).catch(() => {});
        }
        setActiveCodec('opus');
        callbacksRef.current.addLog?.('Opus codec active (natural human voice)', 'ok');
      }

      acquiringMicRef.current = false;
      return processedStream;
    } catch (err: any) {
      acquiringMicRef.current = false;
      if (err.name !== 'NotAllowedError') {
        callbacksRef.current.addLog?.(`Microphone error: ${err.message}`, 'error');
      }
      throw err;
    }
  }, []);

  /**
   * Attach WebRTC call event listeners and setup monitoring
   */
  const bindCallEvents = useCallback((call) => {
    callRef.current = call;
    let streamAttached = false;
    let pcInitialized = false;

    // Request native audio focus on active connection
    requestAudioFocus();
    audioFocusListenerRef.current = addAudioFocusListener((event) => {
      if (event?.state === 'loss_transient' || event?.state === 'loss') {
        callbacksRef.current.addLog?.('Audio focus interrupted (cellular call or system alarm)', 'warn');
        if (rawStreamRef.current) {
          rawStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
      } else if (event?.state === 'gain') {
        callbacksRef.current.addLog?.('Audio focus restored', 'ok');
        if (rawStreamRef.current && !isMuted) {
          rawStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
        }
      }
    });

    const setupPeerConnection = () => {
      const pc = call.peerConnection || (call as any)._peerConnection;
      if (!pc) return;

      const isCaller = Boolean(call.options && call.options._isCaller);
      coordinatorRef.current?.attach(call, isCaller);
    };

    // Initialize immediately if peer connection already exists on call object
    setupPeerConnection();
    setupTimeoutsRef.current.push(setTimeout(setupPeerConnection, 100));
    setupTimeoutsRef.current.push(setTimeout(setupPeerConnection, 500));

    call.on('stream', (remoteStream) => {
      streamAttached = true;
      if (dialTimeoutRef.current) { clearTimeout(dialTimeoutRef.current); dialTimeoutRef.current = null; }

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(err => {
          console.warn('Playback error:', err);
        });
      }

      // Attach track ended listeners with debounce to avoid false hangups during renegotiation
      if (remoteStream && typeof remoteStream.getAudioTracks === 'function') {
        remoteStream.getAudioTracks().forEach(track => {
          track.onended = () => {
            // Debounce: wait 2s to confirm the track is truly gone (not just a renegotiation)
            const hangupTimeout = setTimeout(() => {
              if (callRef.current) {
                const pc = callRef.current.peerConnection || (callRef.current as any)._peerConnection;
                if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
                  callbacksRef.current.addLog?.('Remote audio track ended (Peer hung up)', 'info');
                  endCall();
                }
              }
            }, 2000);
            setupTimeoutsRef.current.push(hangupTimeout);
          };
        });
      }

      setIsInCall(true);
      setIsCalling(false);
      setConnectedPeer(call.peer);
      callbacksRef.current.onStatusChange?.('in-call');
      auditoryFeedback.notifyConnected();
      startTimer();
      saveCallHistory(call.peer);
      callbacksRef.current.addLog?.(`P2P encrypted audio stream connected with ${call.peer}`, 'ok');

      setupPeerConnection();
    });

    call.on('close', () => {
      if (!streamAttached) {
        auditoryFeedback.notifyBusy();
        callbacksRef.current.addLog?.(`Peer ${call.peer} is busy on another call or unavailable`, 'warn');
        callbacksRef.current.onStatusChange?.('busy');
        setTimeout(() => callbacksRef.current.onStatusChange?.('ready'), 3500);
      } else {
        callbacksRef.current.addLog?.(`Call ended by remote peer (${call.peer})`, 'info');
      }
      endCall();
    });

    call.on('error', (err) => {
      callbacksRef.current.addLog?.(`Call error: ${err?.message || err}`, 'error');
      endCall();
    });
  }, [endCall, isMuted, startTimer]);

  // Outgoing Call
  const startCall = useCallback(async (targetPeerId, peerInstance, myPeerId) => {
    if (!peerInstance || !targetPeerId || targetPeerId === myPeerId) return;

    try {
      setIsCalling(true);
      callbacksRef.current.onStatusChange?.('calling');
      callbacksRef.current.addLog?.(`Dialing encrypted call to ${targetPeerId}...`, 'info');
      structuredLogger.setSession(`call_${Date.now().toString(36)}`, targetPeerId);
      structuredLogger.info('call-dialing', { targetPeer: targetPeerId, initiator: myPeerId });

      const stream = await acquireMicrophone();
      const call = peerInstance.call(targetPeerId, stream, {
        sdpTransform: transformOpusSdp
      });

      if (!call) {
        throw new Error('Failed to initiate PeerJS call object');
      }

      call.options = { ...call.options, _isCaller: true };
      bindCallEvents(call);

      dialTimeoutRef.current = setTimeout(() => {
        callbacksRef.current.addLog?.(`No answer from ${targetPeerId} (timeout)`, 'warn');
        endCall();
      }, TIMINGS.OUTGOING_CALL_TIMEOUT_MS);
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        callbacksRef.current.addLog?.(`Could not initiate call: ${err.message}`, 'error');
      }
      setIsCalling(false);
      callbacksRef.current.onStatusChange?.('ready');
    }
  }, [acquireMicrophone, bindCallEvents, endCall]);

  // Incoming Call Handler
  const handleIncomingCall = useCallback((call) => {
    setIncomingCall(call);
    callbacksRef.current.addLog?.(`Incoming call from ${call.peer}`, 'warn');
    structuredLogger.setSession(`call_${Date.now().toString(36)}`, call?.peer);
    structuredLogger.info('call-incoming', { callerPeer: call?.peer });

    try {
      LocalNotifications.schedule({
        notifications: [{
          title: 'Incoming Encrypted Call',
          body: `Call from ${call.peer}`,
          id: 1122,
          autoCancel: true
        }]
      }).catch(() => {});
    } catch (e) {}

    stopRingtoneRef.current = playRingtone();

    incomingTimeoutRef.current = setTimeout(() => {
      callbacksRef.current.addLog?.(`Incoming call from ${call.peer} timed out`, 'info');
      try { call.close(); } catch (e: any) {}
      if (stopRingtoneRef.current) {
        stopRingtoneRef.current();
        stopRingtoneRef.current = null;
      }
      setIncomingCall(null);
      try { LocalNotifications.cancel({ notifications: [{ id: 1122 }] }).catch(() => {}); } catch(e) {}
    }, TIMINGS.INCOMING_CALL_TIMEOUT_MS);
  }, []);

  // Answer Incoming Call
  const answerCall = useCallback(async () => {
    const call = incomingCall;
    if (!call) return;

    if (stopRingtoneRef.current) {
      stopRingtoneRef.current();
      stopRingtoneRef.current = null;
    }
    setIncomingCall(null);
    try { LocalNotifications.cancel({ notifications: [{ id: 1122 }] }).catch(() => {}); } catch(e) {}
    if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }

    try {
      callbacksRef.current.addLog?.(`Answering call from ${call.peer}...`, 'info');
      const stream = await acquireMicrophone();
      call.options = { ...call.options, _isCaller: false };
      call.answer(stream, {
        sdpTransform: transformOpusSdp
      });
      setIsInCall(true);
      setIsCalling(false);
      setConnectedPeer(call.peer);
      callbacksRef.current.onStatusChange?.('in-call');
      startTimer();
      saveCallHistory(call.peer);
      bindCallEvents(call);
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        callbacksRef.current.addLog?.(`Failed to answer call: ${err.message}`, 'error');
      }
      endCall();
    }
  }, [incomingCall, acquireMicrophone, bindCallEvents, endCall]);

  // Decline Incoming Call
  const declineCall = useCallback(() => {
    if (incomingCall) {
      callbacksRef.current.addLog?.(`Declined incoming call from ${incomingCall.peer}`, 'info');
      if (stopRingtoneRef.current) {
        stopRingtoneRef.current();
        stopRingtoneRef.current = null;
      }
      if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }
      try { incomingCall.close(); } catch (e: any) {}
      setIncomingCall(null);
      try { LocalNotifications.cancel({ notifications: [{ id: 1122 }] }).catch(() => {}); } catch(e) {}
    }
  }, [incomingCall]);

  // Cancel Outgoing Call
  const cancelCall = useCallback(() => {
    callbacksRef.current.addLog?.('Outgoing call cancelled by user', 'info');
    endCall();
  }, [endCall]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    const nextState = !isMuted;
    if (rawStreamRef.current) {
      rawStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !nextState; });
    }
    if (processedStreamRef.current) {
      processedStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !nextState; });
    }
    setIsMuted(nextState);
    callbacksRef.current.addLog?.(nextState ? 'Microphone muted' : 'Microphone unmuted', 'info');
  }, [isMuted]);

  const toggleSpeaker = useCallback(async (forcedMode) => {
    let mode;
    if (typeof forcedMode === 'string') {
      mode = forcedMode;
      setIsSpeakerOn(mode === 'speaker');
      setActiveOutputId(mode);
    } else if (typeof forcedMode === 'boolean') {
      mode = forcedMode ? 'speaker' : 'earpiece';
      setIsSpeakerOn(forcedMode);
      setActiveOutputId(mode);
    } else {
      const nextSpeakerState = !isSpeakerOn;
      setIsSpeakerOn(nextSpeakerState);
      mode = nextSpeakerState ? 'speaker' : 'earpiece';
      setActiveOutputId(mode);
    }

    const result = await setAudioOutputMode(mode, remoteAudioRef.current);
    if (result.success) {
      callbacksRef.current.addLog?.(`Audio output set to: ${mode}`, 'info');
    } else {
      callbacksRef.current.addLog?.(`Audio routing note: ${result.error || 'Default output retained'}`, 'warn');
    }
  }, [isSpeakerOn]);

  /**
   * Non-destructive microphone switching with automatic rollback on failure
   */
  const switchMicrophone = useCallback(async (newDeviceId) => {
    if (!callRef.current || !callRef.current.peerConnection) return false;

    let newStream = null;
    let newAudioCtx = null;

    try {
      callbacksRef.current.addLog?.('Acquiring replacement microphone track...', 'info');

      newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: newDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) throw new Error('No audio track obtained from new device');

      // Build new denoise pipeline with isolated AudioContext
      const { processedStream, audioCtx, nodes, cleanup } = createDenoisePipeline(newStream);
      newAudioCtx = audioCtx;
      const processedTrack = processedStream.getAudioTracks()[0];

      // Continuity of active mute state
      if (isMuted) {
        newStream.getAudioTracks().forEach(t => { t.enabled = false; });
        processedStream.getAudioTracks().forEach(t => { t.enabled = false; });
      }

      const pc = callRef.current.peerConnection;
      const audioSender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');

      if (!audioSender) {
        if (cleanup) {
          try { cleanup(); } catch (e: any) {}
        }
        stopMediaStream(newStream, newAudioCtx, nodes);
        throw new Error('No active audio sender found on RTCPeerConnection');
      }

      // Atomically swap track without SDP renegotiation
      await audioSender.replaceTrack(processedTrack);

      // SUCCESS: Clean up old stream, pipeline timers, and context now that new track is transmitting
      if (pipelineCleanupRef.current) {
        try { pipelineCleanupRef.current(); } catch (e: any) {}
      }
      stopMediaStream(rawStreamRef.current);
      stopMediaStream(processedStreamRef.current, audioCtxRef.current, pipelineNodesRef.current);

      rawStreamRef.current = newStream;
      processedStreamRef.current = processedStream;
      audioCtxRef.current = newAudioCtx;
      pipelineNodesRef.current = nodes;
      pipelineCleanupRef.current = cleanup;

      callbacksRef.current.addLog?.('Microphone switched without renegotiation', 'ok');
      return true;

    } catch (err: any) {
      // ROLLBACK: Clean up the aborted attempt, keeping existing active call tracks intact
      if (newStream) stopMediaStream(newStream, newAudioCtx);

      callbacksRef.current.addLog?.(`Microphone switch aborted (retaining current mic): ${err.message}`, 'error');
      return false;
    }
  }, [isMuted]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  return {
    remoteAudioRef,
    activeStream: processedStreamRef.current || rawStreamRef.current,
    isInCall,
    isCalling,
    connectedPeer,
    isMuted,
    isSpeakerOn,
    activeOutputId,
    quality,
    callDuration,
    incomingCall,
    safetyCode,
    isVerified,
    setIsVerified,
    activeTier,
    liveTelemetry,
    activeCodec,
    preferredCodec,
    setPreferredCodec,
    lyraStats: lyraManager.getStats(),
    startCall,
    cancelCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    switchMicrophone,
    handleIncomingCall
  };
}
