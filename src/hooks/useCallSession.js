import { useState, useRef, useCallback, useEffect } from 'react';
import {
  unlockAudioContext,
  createDenoisePipeline,
  playRingtone,
  setAudioOutputDevice,
  stopMediaStream
} from '../utils/audio';
import { transformOpusSdp, getQualityRating } from '../utils/webrtc';
import { saveCallHistory } from '../components/RecentCalls';

const OUTGOING_TIMEOUT_MS = 30000;
const INCOMING_TIMEOUT_MS = 45000;
const STATS_POLL_INTERVAL_MS = 3000;

export function useCallSession({ addLog, onStatusChange }) {
  // Active Streams & Refs
  const rawStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const callRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Timers
  const dialTimeoutRef = useRef(null);
  const incomingTimeoutRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // States
  const [isInCall, setIsInCall] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [connectedPeer, setConnectedPeer] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [quality, setQuality] = useState('good');
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null);

  // Ringtone player cleanup ref
  const stopRingtoneRef = useRef(null);

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
    // 1. Close PeerJS call
    if (callRef.current) {
      try { callRef.current.close(); } catch (e) {}
      callRef.current = null;
    }

    // 2. Clear remote audio
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    // 3. Stop all media tracks explicitly
    stopMediaStream(rawStreamRef.current);
    stopMediaStream(processedStreamRef.current);
    rawStreamRef.current = null;
    processedStreamRef.current = null;

    // 4. Close Web Audio Context if owned
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    // 5. Clear all timeouts and intervals
    if (dialTimeoutRef.current) { clearTimeout(dialTimeoutRef.current); dialTimeoutRef.current = null; }
    if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }
    if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; }

    // 6. Stop Ringtone
    if (stopRingtoneRef.current) {
      stopRingtoneRef.current();
      stopRingtoneRef.current = null;
    }

    // 7. Reset states
    stopTimer();
    setIsInCall(false);
    setIsCalling(false);
    setConnectedPeer('');
    setIsMuted(false);
    setQuality('good');
    setIncomingCall(null);
    onStatusChange?.('ready');
    addLog?.('Call terminated and audio pipeline cleanly released', 'info');
  }, [stopTimer, onStatusChange, addLog]);

  // Request & build microphone stream
  const acquireMicrophone = useCallback(async () => {
    if (processedStreamRef.current && processedStreamRef.current.active) {
      return processedStreamRef.current;
    }

    await unlockAudioContext();
    addLog?.('Requesting hardware microphone access...', 'info');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    rawStreamRef.current = stream;
    addLog?.('Microphone access granted', 'ok');

    const { processedStream, audioCtx } = createDenoisePipeline(stream);
    processedStreamRef.current = processedStream;
    audioCtxRef.current = audioCtx;

    if (audioCtx) {
      addLog?.('Web Audio 80Hz filter & noise gate active', 'ok');
    }

    return processedStream;
  }, [addLog]);

  // Attach Call Event Listeners
  const bindCallEvents = useCallback((call) => {
    callRef.current = call;
    let streamAttached = false;

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
      onStatusChange?.('in-call');
      startTimer();
      saveCallHistory(call.peer);
      addLog?.(`P2P encrypted audio stream connected with ${call.peer}`, 'ok');

      // WebRTC RTT stats monitor
      const pc = call.peerConnection;
      if (pc) {
        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          if (state === 'disconnected') {
            addLog?.('Network connection unstable (reconnecting)...', 'warn');
            onStatusChange?.('reconnecting');
          } else if (state === 'failed') {
            addLog?.('WebRTC connection failed', 'error');
            endCall();
          } else if (state === 'connected' || state === 'completed') {
            onStatusChange?.('in-call');
          }
        };

        if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = setInterval(async () => {
          try {
            const stats = await pc.getStats();
            let rtt = null;
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                rtt = report.currentRoundTripTime;
              }
            });
            if (rtt !== null) {
              setQuality(getQualityRating(rtt));
            }
          } catch (e) {}
        }, STATS_POLL_INTERVAL_MS);
      }
    });

    call.on('close', () => {
      if (!streamAttached) {
        addLog?.(`Peer ${call.peer} is busy or rejected call`, 'warn');
        onStatusChange?.('busy');
        setTimeout(() => onStatusChange?.('ready'), 3500);
      }
      endCall();
    });

    call.on('error', (err) => {
      addLog?.(`Call error: ${err?.message || err}`, 'error');
      endCall();
    });
  }, [addLog, endCall, onStatusChange, startTimer]);

  // Outgoing Call
  const startCall = useCallback(async (targetPeerId, peerInstance, myPeerId) => {
    if (!peerInstance || !targetPeerId || targetPeerId === myPeerId) return;

    try {
      setIsCalling(true);
      onStatusChange?.('calling');
      addLog?.(`Dialing encrypted call to ${targetPeerId}...`, 'info');

      const stream = await acquireMicrophone();
      const call = peerInstance.call(targetPeerId, stream, {
        sdpTransform: transformOpusSdp
      });

      if (!call) {
        throw new Error('Failed to initiate PeerJS call object');
      }

      bindCallEvents(call);

      dialTimeoutRef.current = setTimeout(() => {
        addLog?.(`No answer from ${targetPeerId} (timeout)`, 'warn');
        endCall();
      }, OUTGOING_TIMEOUT_MS);
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        addLog?.(`Could not initiate call: ${err.message}`, 'error');
      }
      setIsCalling(false);
      onStatusChange?.('ready');
    }
  }, [acquireMicrophone, bindCallEvents, addLog, endCall, onStatusChange]);

  // Incoming Call Handler
  const handleIncomingCall = useCallback((call) => {
    setIncomingCall(call);
    addLog?.(`Incoming call from ${call.peer}`, 'warn');

    stopRingtoneRef.current = playRingtone();

    incomingTimeoutRef.current = setTimeout(() => {
      addLog?.(`Incoming call from ${call.peer} timed out`, 'info');
      try { call.close(); } catch (e) {}
      if (stopRingtoneRef.current) {
        stopRingtoneRef.current();
        stopRingtoneRef.current = null;
      }
      setIncomingCall(null);
    }, INCOMING_TIMEOUT_MS);
  }, [addLog]);

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
      addLog?.(`Answering call from ${call.peer}...`, 'info');
      const stream = await acquireMicrophone();
      call.answer(stream, {
        sdpTransform: transformOpusSdp
      });
      bindCallEvents(call);
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        addLog?.(`Failed to answer call: ${err.message}`, 'error');
      }
      endCall();
    }
  }, [incomingCall, acquireMicrophone, bindCallEvents, addLog, endCall]);

  // Decline Incoming Call
  const declineCall = useCallback(() => {
    if (incomingCall) {
      addLog?.(`Declined incoming call from ${incomingCall.peer}`, 'info');
      if (stopRingtoneRef.current) {
        stopRingtoneRef.current();
        stopRingtoneRef.current = null;
      }
      if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }
      try { incomingCall.close(); } catch (e) {}
      setIncomingCall(null);
    }
  }, [incomingCall, addLog]);

  // Cancel Outgoing Call
  const cancelCall = useCallback(() => {
    addLog?.('Outgoing call cancelled by user', 'info');
    endCall();
  }, [addLog, endCall]);

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
    addLog?.(nextState ? 'Microphone muted' : 'Microphone unmuted', 'info');
  }, [isMuted, addLog]);

  // Toggle Speaker
  const toggleSpeaker = useCallback(async () => {
    const nextSpeakerState = !isSpeakerOn;
    setIsSpeakerOn(nextSpeakerState);
    const success = await setAudioOutputDevice(remoteAudioRef.current, nextSpeakerState);
    if (success) {
      addLog?.(nextSpeakerState ? 'Audio output: Speaker' : 'Audio output: Earpiece', 'info');
    } else {
      addLog?.('Device routing not supported on this platform', 'warn');
    }
  }, [isSpeakerOn, addLog]);

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
    quality,
    callDuration,
    incomingCall,
    startCall,
    cancelCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    handleIncomingCall
  };
}
