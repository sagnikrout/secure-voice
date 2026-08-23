import { useState, useRef, useCallback, useEffect } from 'react';
import {
  unlockAudioContext,
  createDenoisePipeline,
  playRingtone,
  stopMediaStream
} from '../utils/audio';
import { transformOpusSdp, getQualityRating, generateSafetyCode, applySenderBitrate } from '../utils/webrtc';
import { NetworkTelemetryMonitor, AdaptiveBitrateController } from '../utils/networkAdaptation';
import { IceRestartManager } from '../utils/iceRestartManager';
import { JitterBufferController } from '../utils/jitterBufferController';
import { PacketPacer } from '../utils/packetPacer';
import { TurnRelayManager } from '../utils/turnManager';
import { saveCallHistory } from '../components/RecentCalls';
import {
  setAudioOutputMode,
  requestAudioFocus,
  abandonAudioFocus,
  addAudioFocusListener
} from '../utils/audioRouting';
import { TIMINGS, BITRATE_ADAPTATION, LADDER_TIERS } from '../constants/config';

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

  // Milestone 3 & 4: Telemetry Monitor, Bitrate Controller, ICE Restart, Jitter Buffer, Packet Pacer, and TURN Manager Refs
  const telemetryMonitorRef = useRef(null);
  const bitrateControllerRef = useRef(new AdaptiveBitrateController());
  const iceRestartManagerRef = useRef(null);
  const jitterControllerRef = useRef(new JitterBufferController({ onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level) }));
  const packetPacerRef = useRef(new PacketPacer({ onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level) }));
  const turnRelayManagerRef = useRef(new TurnRelayManager(null, { onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level) }));

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

  // Ringtone player cleanup ref
  const stopRingtoneRef = useRef(null);

  // Store callbacks in a ref to prevent infinite re-renders & stale closures
  const callbacksRef = useRef({ addLog, onStatusChange });
  useEffect(() => {
    callbacksRef.current = { addLog, onStatusChange };
  }, [addLog, onStatusChange]);

  const selectedInputIdRef = useRef(selectedInputId);
  useEffect(() => {
    selectedInputIdRef.current = selectedInputId;
  }, [selectedInputId]);

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
    // 1. Abandon Native Audio Focus
    abandonAudioFocus();
    if (audioFocusListenerRef.current?.remove) {
      audioFocusListenerRef.current.remove();
      audioFocusListenerRef.current = null;
    }

    // 2. Stop Telemetry Monitor, Reset Bitrate Controller and ICE Restart Manager
    if (telemetryMonitorRef.current) {
      telemetryMonitorRef.current.stop();
      telemetryMonitorRef.current = null;
    }
    if (iceRestartManagerRef.current) {
      iceRestartManagerRef.current.reset();
      iceRestartManagerRef.current = null;
    }
    if (bitrateControllerRef.current) {
      bitrateControllerRef.current.reset();
    }

    // 3. Close PeerJS call
    if (callRef.current) {
      try { callRef.current.close(); } catch (e) {}
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
      try { pipelineCleanupRef.current(); } catch (e) {}
      pipelineCleanupRef.current = null;
    }
    stopMediaStream(rawStreamRef.current);
    stopMediaStream(processedStreamRef.current, audioCtxRef.current, pipelineNodesRef.current);
    rawStreamRef.current = null;
    processedStreamRef.current = null;
    audioCtxRef.current = null;
    pipelineNodesRef.current = null;

    // 6. Clear all timeouts and intervals
    if (dialTimeoutRef.current) { clearTimeout(dialTimeoutRef.current); dialTimeoutRef.current = null; }
    if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }

    // 7. Stop Ringtone and clean oscillators
    if (stopRingtoneRef.current) {
      stopRingtoneRef.current();
      stopRingtoneRef.current = null;
    }

    // 8. Reset states
    stopTimer();
    setIsInCall(false);
    setIsCalling(false);
    setConnectedPeer('');
    setIsMuted(false);
    setQuality('good');
    setIncomingCall(null);
    setSafetyCode(null);
    setIsVerified(false);
    setActiveTier(LADDER_TIERS[0]);
    setLiveTelemetry(null);
    currentBitrateRef.current = LADDER_TIERS[0].maxBitrateBps;
    callbacksRef.current.onStatusChange?.('ready');
    callbacksRef.current.addLog?.('Call terminated and audio pipeline cleanly released', 'info');
  }, [stopTimer]);

  /**
   * Request & build microphone stream with Web Audio processing
   */
  const acquireMicrophone = useCallback(async () => {
    if (processedStreamRef.current && processedStreamRef.current.active) {
      return processedStreamRef.current;
    }

    await unlockAudioContext();
    callbacksRef.current.addLog?.('Requesting hardware microphone access...', 'info');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputIdRef.current ? { exact: selectedInputIdRef.current } : undefined,
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

      if (audioCtx) {
        callbacksRef.current.addLog?.('Web Audio 6-stage filter & noise gate active', 'ok');
      }

      return processedStream;
    } catch (err) {
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

    call.on('stream', (remoteStream) => {
      streamAttached = true;
      if (dialTimeoutRef.current) { clearTimeout(dialTimeoutRef.current); dialTimeoutRef.current = null; }

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(err => {
          console.warn('Playback error:', err);
        });
      }

      // Attach track ended listeners for instant hangup detection
      if (remoteStream && typeof remoteStream.getAudioTracks === 'function') {
        remoteStream.getAudioTracks().forEach(track => {
          track.onended = () => {
            callbacksRef.current.addLog?.('Remote audio track ended (Peer hung up)', 'info');
            endCall();
          };
        });
      }

      setIsInCall(true);
      setIsCalling(false);
      setConnectedPeer(call.peer);
      callbacksRef.current.onStatusChange?.('in-call');
      startTimer();
      saveCallHistory(call.peer);
      callbacksRef.current.addLog?.(`P2P encrypted audio stream connected with ${call.peer}`, 'ok');

      // WebRTC RTT stats monitor, Bitrate Adaptation & Safety Code generation
      const pc = call.peerConnection;
      if (pc) {
        if (typeof window !== 'undefined') {
          window.__SECUREVOICE_ACTIVE_PC__ = pc;
        }
        // Generate MITM Safety Code from DTLS Fingerprints
        if (pc.localDescription && pc.remoteDescription) {
          generateSafetyCode(pc.localDescription.sdp, pc.remoteDescription.sdp)
            .then(code => {
              if (code) setSafetyCode(code);
            })
            .catch(err => {
              callbacksRef.current.addLog?.(`Safety code generation failed: ${err.message}`, 'warn');
            });
        }

        const isCaller = Boolean(call.options && call.options._isCaller);

        // Instantiate IceRestartManager
        const iceManager = new IceRestartManager({
          onStatusChange: (status) => {
            if (status === 'in-call') {
              setIsInCall(true);
            }
            callbacksRef.current.onStatusChange?.(status);
          },
          onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level),
          onFatalDisconnect: () => {
            callbacksRef.current.addLog?.('Connection recovery failed after 5 attempts. Terminating call.', 'error');
            endCall();
          },
          sendRenegotiation: async (msg) => {
            if (call.dataChannel && call.dataChannel.readyState === 'open') {
              try {
                call.dataChannel.send(JSON.stringify(msg));
              } catch (e) {}
            }
          },
          sdpTransform: (sdp) => {
            const currentTier = bitrateControllerRef.current.getCurrentTier();
            return transformOpusSdp(sdp, {
              bitrate: currentTier.maxBitrateBps,
              bandwidthCapKbps: currentTier.bandwidthCapKbps,
              ptime: currentTier.ptimeMs,
              maxptime: currentTier.maxPtimeMs,
              packetLossPerc: currentTier.fecPacketLossPerc,
              maxPlaybackRate: currentTier.maxPlaybackRate
            });
          }
        });
        iceRestartManagerRef.current = iceManager;

        pc.onconnectionstatechange = () => {
          iceManager.handleStateChange(pc.connectionState, pc.iceConnectionState, pc, isCaller);
          if (pc.connectionState === 'connected') {
            turnRelayManagerRef.current.recordP2PSuccess();
          } else if (pc.connectionState === 'failed') {
            turnRelayManagerRef.current.recordP2PFailure();
          }
          if (pc.connectionState === 'closed') {
            endCall();
          }
        };

        pc.oniceconnectionstatechange = () => {
          iceManager.handleStateChange(pc.connectionState, pc.iceConnectionState, pc, isCaller);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            turnRelayManagerRef.current.recordP2PSuccess();
          } else if (pc.iceConnectionState === 'failed') {
            turnRelayManagerRef.current.recordP2PFailure();
          }
        };

        // Instantiate NetworkTelemetryMonitor & wire to AdaptiveBitrateController
        if (telemetryMonitorRef.current) {
          telemetryMonitorRef.current.stop();
          telemetryMonitorRef.current = null;
        }

        const monitor = new NetworkTelemetryMonitor(pc, async (snapshot) => {
          setLiveTelemetry(snapshot);
          if (snapshot && snapshot.rttMs !== null && snapshot.rttMs !== undefined) {
            setQuality(getQualityRating(snapshot.rttSeconds));
          }

          // Adaptive Bitrate & Jitter Buffer & Packet Pacing Evaluation
          const evaluation = bitrateControllerRef.current.evaluate(snapshot);
          if (evaluation.tierChanged) {
            setActiveTier(evaluation.currentTier);
            currentBitrateRef.current = evaluation.targetBitrateBps;
            const audioSender = pc.getSenders?.()?.find(s => s.track && s.track.kind === 'audio');
            if (audioSender) {
              await applySenderBitrate(audioSender, evaluation.targetBitrateBps);
              callbacksRef.current.addLog?.(evaluation.reason, 'info');
            }

            // 1. Dynamic Jitter Buffer Target Adjustment (NetEQ margin tuning)
            jitterControllerRef.current.applyForTier(evaluation.currentTier.name, pc);

            // 2. Packet Pacing & Traffic Shaping (router queue overflow prevention)
            await packetPacerRef.current.applyForTierObject(evaluation.currentTier, pc);
          }
        }, { intervalMs: TIMINGS.STATS_POLL_INTERVAL_MS || 1000 });

        monitor.start();
        telemetryMonitorRef.current = monitor;
      }
    });

    call.on('close', () => {
      if (!streamAttached) {
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
    } catch (err) {
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

    stopRingtoneRef.current = playRingtone();

    incomingTimeoutRef.current = setTimeout(() => {
      callbacksRef.current.addLog?.(`Incoming call from ${call.peer} timed out`, 'info');
      try { call.close(); } catch (e) {}
      if (stopRingtoneRef.current) {
        stopRingtoneRef.current();
        stopRingtoneRef.current = null;
      }
      setIncomingCall(null);
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
    if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }

    try {
      callbacksRef.current.addLog?.(`Answering call from ${call.peer}...`, 'info');
      const stream = await acquireMicrophone();
      call.options = { ...call.options, _isCaller: false };
      call.answer(stream, {
        sdpTransform: transformOpusSdp
      });
      bindCallEvents(call);
    } catch (err) {
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
      try { incomingCall.close(); } catch (e) {}
      setIncomingCall(null);
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
          try { cleanup(); } catch (e) {}
        }
        stopMediaStream(newStream, newAudioCtx, nodes);
        throw new Error('No active audio sender found on RTCPeerConnection');
      }

      // Atomically swap track without SDP renegotiation
      await audioSender.replaceTrack(processedTrack);

      // SUCCESS: Clean up old stream, pipeline timers, and context now that new track is transmitting
      if (pipelineCleanupRef.current) {
        try { pipelineCleanupRef.current(); } catch (e) {}
      }
      stopMediaStream(rawStreamRef.current);
      stopMediaStream(processedStreamRef.current, audioCtxRef.current, pipelineNodesRef.current);

      rawStreamRef.current = newStream;
      processedStreamRef.current = processedStream;
      audioCtxRef.current = newAudioCtx;
      pipelineNodesRef.current = nodes;
      pipelineCleanupRef.current = cleanup;

      callbacksRef.current.addLog?.('Microphone switched seamlessly without renegotiation', 'ok');
      return true;

    } catch (err) {
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
