import { useState, useRef, useCallback, useEffect } from 'react';
import {
  unlockAudioContext,
  createDenoisePipeline,
  playRingtone,
  stopMediaStream
} from '../utils/audio';
import { transformOpusSdp, getQualityRating, generateSafetyCode } from '../utils/webrtc';
import { saveCallHistory } from '../components/RecentCalls';
import {
  setAudioOutputMode,
  requestAudioFocus,
  abandonAudioFocus,
  addAudioFocusListener
} from '../utils/audioRouting';
import { TIMINGS, BITRATE_ADAPTATION } from '../constants/config';

export function useCallSession({ addLog, onStatusChange, selectedInputId }) {
  // Active Streams & Refs
  const rawStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const callRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioFocusListenerRef = useRef(null);

  // Timers & Stats Tracking
  const dialTimeoutRef = useRef(null);
  const incomingTimeoutRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const prevStatsRef = useRef({ packetsLost: 0, packetsReceived: 0, timestamp: 0 });
  const currentBitrateRef = useRef(BITRATE_ADAPTATION.MAX_BITRATE_BPS);

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

  // Full teardown & hardware release
  const endCall = useCallback(() => {
    // 1. Abandon Native Audio Focus
    abandonAudioFocus();
    if (audioFocusListenerRef.current?.remove) {
      audioFocusListenerRef.current.remove();
      audioFocusListenerRef.current = null;
    }

    // 2. Close PeerJS call
    if (callRef.current) {
      try { callRef.current.close(); } catch (e) {}
      callRef.current = null;
    }
    if (typeof window !== 'undefined') {
      window.__SECUREVOICE_ACTIVE_PC__ = null;
    }

    // 3. Clear remote audio
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    // 4. Stop all media tracks explicitly
    stopMediaStream(rawStreamRef.current);
    stopMediaStream(processedStreamRef.current);
    rawStreamRef.current = null;
    processedStreamRef.current = null;

    // 5. Close Web Audio Context if owned
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    // 6. Clear all timeouts and intervals
    if (dialTimeoutRef.current) { clearTimeout(dialTimeoutRef.current); dialTimeoutRef.current = null; }
    if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }
    if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; }

    // 7. Stop Ringtone
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
    currentBitrateRef.current = BITRATE_ADAPTATION.MAX_BITRATE_BPS;
    prevStatsRef.current = { packetsLost: 0, packetsReceived: 0, timestamp: 0 };
    callbacksRef.current.onStatusChange?.('ready');
    callbacksRef.current.addLog?.('Call terminated and audio pipeline cleanly released', 'info');
  }, [stopTimer]);

  // Request & build microphone stream
  const acquireMicrophone = useCallback(async () => {
    if (processedStreamRef.current && processedStreamRef.current.active) {
      return processedStreamRef.current;
    }

    await unlockAudioContext();
    callbacksRef.current.addLog?.('Requesting hardware microphone access...', 'info');

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

    const { processedStream, audioCtx } = createDenoisePipeline(stream);
    processedStreamRef.current = processedStream;
    audioCtxRef.current = audioCtx;

    if (audioCtx) {
      callbacksRef.current.addLog?.('Web Audio 80Hz filter & noise gate active', 'ok');
    }

    return processedStream;
  }, []);

  // Attach Call Event Listeners
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
            });
        }

        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          if (state === 'disconnected') {
            callbacksRef.current.addLog?.('Network connection unstable (reconnecting)...', 'warn');
            callbacksRef.current.onStatusChange?.('reconnecting');
          } else if (state === 'failed') {
            callbacksRef.current.addLog?.('WebRTC connection failed', 'error');
            endCall();
          } else if (state === 'connected' || state === 'completed') {
            callbacksRef.current.onStatusChange?.('in-call');
          }
        };

        if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = setInterval(async () => {
          try {
            const stats = await pc.getStats();
            let rtt = null;
            let currentPacketsLost = 0;
            let currentPacketsReceived = 0;

            stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                rtt = report.currentRoundTripTime;
              }
              if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                currentPacketsLost = report.packetsLost || 0;
                currentPacketsReceived = report.packetsReceived || 0;
              }
            });

            if (rtt !== null) {
              setQuality(getQualityRating(rtt));
            }

            // Dynamic Bitrate Adaptation
            const deltaLost = currentPacketsLost - prevStatsRef.current.packetsLost;
            const deltaReceived = currentPacketsReceived - prevStatsRef.current.packetsReceived;
            const totalPackets = deltaLost + deltaReceived;

            if (totalPackets > 15) {
              const lossRate = Math.max(0, deltaLost / totalPackets);
              let targetBitrate = currentBitrateRef.current;

              if (lossRate >= BITRATE_ADAPTATION.HIGH_LOSS_THRESHOLD) {
                targetBitrate = BITRATE_ADAPTATION.MIN_BITRATE_BPS; // 6 kbps
              } else if (lossRate >= BITRATE_ADAPTATION.MID_LOSS_THRESHOLD) {
                targetBitrate = BITRATE_ADAPTATION.MID_BITRATE_BPS; // 8 kbps
              } else if (lossRate <= BITRATE_ADAPTATION.RECOVERY_LOSS_THRESHOLD && rtt !== null && rtt < 0.2) {
                targetBitrate = BITRATE_ADAPTATION.MAX_BITRATE_BPS; // 16 kbps
              }

              if (targetBitrate !== currentBitrateRef.current) {
                const audioSender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                if (audioSender && audioSender.getParameters) {
                  const params = audioSender.getParameters();
                  if (params.encodings && params.encodings[0]) {
                    params.encodings[0].maxBitrate = targetBitrate;
                    await audioSender.setParameters(params);
                    currentBitrateRef.current = targetBitrate;
                    callbacksRef.current.addLog?.(`Adaptive bitrate adjusted to ${targetBitrate / 1000} kbps (loss: ${(lossRate * 100).toFixed(1)}%)`, 'info');
                  }
                }
              }
            }

            prevStatsRef.current = {
              packetsLost: currentPacketsLost,
              packetsReceived: currentPacketsReceived,
              timestamp: Date.now()
            };

          } catch (e) {}
        }, TIMINGS.STATS_POLL_INTERVAL_MS);
      }
    });

    call.on('close', () => {
      if (!streamAttached) {
        callbacksRef.current.addLog?.(`Peer ${call.peer} is busy or rejected call`, 'warn');
        callbacksRef.current.onStatusChange?.('busy');
        setTimeout(() => callbacksRef.current.onStatusChange?.('ready'), 3500);
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

  // Non-destructive Microphone switching with automatic rollback on failure
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
      const { processedStream, audioCtx } = createDenoisePipeline(newStream);
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
        throw new Error('No active audio sender found on RTCPeerConnection');
      }

      // Atomically swap track without SDP renegotiation
      await audioSender.replaceTrack(processedTrack);

      // SUCCESS: Clean up old stream and context now that new track is transmitting
      if (rawStreamRef.current) {
        stopMediaStream(rawStreamRef.current);
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }

      rawStreamRef.current = newStream;
      processedStreamRef.current = processedStream;
      audioCtxRef.current = newAudioCtx;

      callbacksRef.current.addLog?.('Microphone switched seamlessly without renegotiation', 'ok');
      return true;

    } catch (err) {
      // ROLLBACK: Clean up the aborted attempt, keeping existing active call tracks intact
      if (newStream) stopMediaStream(newStream);
      if (newAudioCtx && newAudioCtx.state !== 'closed') newAudioCtx.close().catch(() => {});
      
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
