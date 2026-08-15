import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import {
  Shield,
  Phone,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Moon,
  Sun,
  Info,
  Activity,
  User,
  Clock
} from 'lucide-react';

import {
  getAudioContext,
  unlockAudioContext,
  createDenoisePipeline,
  playRingtone,
  setAudioOutputDevice,
  stopMediaStream
} from './utils/audio';

import {
  ICE_SERVERS,
  generatePeerId,
  transformOpusSdp,
  getQualityRating
} from './utils/webrtc';

import AudioVisualizer from './components/AudioVisualizer';
import RecentCalls, { saveCallHistory } from './components/RecentCalls';
import InfoModal from './components/InfoModal';

export default function App() {
  // Peer & Media Refs
  const peerIdRef = useRef(generatePeerId());
  const peerRef = useRef(null);
  const rawStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const callRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Timers & State Refs
  const dialTimeoutRef = useRef(null);
  const incomingTimeoutRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const rateLimitRef = useRef({});

  // UI State
  const [myId, setMyId] = useState('');
  const [status, setStatus] = useState('connecting'); // connecting, ready, calling, in-call, reconnecting, busy, error
  const [calleeId, setCalleeId] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [connectedPeer, setConnectedPeer] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [quality, setQuality] = useState('good');
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('secure_voice_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Call Duration Timer
  const [callDuration, setCallDuration] = useState(0);
  const timerIntervalRef = useRef(null);

  // Activity Logs
  const [logs, setLogs] = useState([]);

  const addLog = useCallback((msg, level = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [{ id: Date.now() + Math.random(), time, msg, level }, ...prev.slice(0, 49)]);
  }, []);

  // Sync theme
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('secure_voice_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Format Timer
  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startCallTimer = useCallback(() => {
    setCallDuration(0);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // End Call & Full Hardware Cleanup (Fixes Mic leak bug)
  const endCall = useCallback(() => {
    if (callRef.current) {
      try { callRef.current.close(); } catch (e) {}
      callRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    // Stop streams
    stopMediaStream(rawStreamRef.current);
    stopMediaStream(processedStreamRef.current);
    rawStreamRef.current = null;
    processedStreamRef.current = null;

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    // Clear timers
    if (dialTimeoutRef.current) { clearTimeout(dialTimeoutRef.current); dialTimeoutRef.current = null; }
    if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }
    if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; }

    stopCallTimer();
    setIsInCall(false);
    setIsCalling(false);
    setConnectedPeer('');
    setIsMuted(false);
    setQuality('good');
    setStatus('ready');
    addLog('Call ended & media resources released', 'info');
  }, [stopCallTimer, addLog]);

  // Request Microphone with Web Audio Denoise Pipeline
  const acquireMicrophone = useCallback(async () => {
    if (processedStreamRef.current && processedStreamRef.current.active) {
      return processedStreamRef.current;
    }

    await unlockAudioContext();
    addLog('Requesting microphone permission...', 'info');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    rawStreamRef.current = stream;
    addLog('Microphone permission granted', 'ok');

    const { processedStream, audioCtx } = createDenoisePipeline(stream);
    processedStreamRef.current = processedStream;
    audioCtxRef.current = audioCtx;

    if (audioCtx) {
      addLog('Web Audio denoise pipeline active (80Hz filter + noise gate)', 'ok');
    }

    return processedStream;
  }, [addLog]);

  // Setup PeerJS Call Connection Event Listeners
  const setupCallListeners = useCallback((call) => {
    callRef.current = call;
    let streamAttached = false;

    call.on('stream', (remoteStream) => {
      streamAttached = true;
      if (dialTimeoutRef.current) { clearTimeout(dialTimeoutRef.current); dialTimeoutRef.current = null; }

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(err => {
          console.warn('Audio play error:', err);
        });
      }

      setIsInCall(true);
      setIsCalling(false);
      setConnectedPeer(call.peer);
      setStatus('in-call');
      startCallTimer();
      saveCallHistory(call.peer);
      addLog(`Encrypted audio call connected with ${call.peer}`, 'ok');

      // Monitor WebRTC Stats & RTT for Quality Indicator
      const pc = call.peerConnection;
      if (pc) {
        pc.oniceconnectionstatechange = () => {
          const iceState = pc.iceConnectionState;
          if (iceState === 'disconnected') {
            addLog('Connection unstable — attempting recovery...', 'warn');
            setStatus('reconnecting');
          } else if (iceState === 'failed') {
            addLog('Connection failed', 'error');
            endCall();
          } else if (iceState === 'connected' || iceState === 'completed') {
            setStatus('in-call');
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
        }, 3000);
      }
    });

    call.on('close', () => {
      if (!streamAttached) {
        addLog(`Peer ${call.peer} is busy or rejected call`, 'warn');
        setStatus('busy');
        setTimeout(() => setStatus('ready'), 3500);
      }
      endCall();
    });

    call.on('error', (err) => {
      addLog(`Call error: ${err?.message || err}`, 'error');
      endCall();
    });
  }, [addLog, endCall, startCallTimer]);

  // PeerJS Registration & Connection
  useEffect(() => {
    let destroyed = false;
    let retryCount = 0;

    addLog('Connecting to PeerJS signaling server...', 'info');

    function initPeer(id) {
      const peer = new Peer(id, {
        config: ICE_SERVERS,
        debug: 0
      });

      peerRef.current = peer;

      peer.on('open', (assignedId) => {
        if (destroyed) return;
        setMyId(assignedId);
        setStatus('ready');
        addLog(`Signaling connected. Your ID: ${assignedId}`, 'ok');
      });

      // Handle Incoming Call
      peer.on('call', (incoming) => {
        if (destroyed) return;

        // Auto-reject if already in active call
        if (callRef.current || incomingCall) {
          addLog(`Auto-rejected incoming call from ${incoming.peer} (Line Busy)`, 'warn');
          incoming.close();
          return;
        }

        // Rate limiting: max 1 call per 5s from same peer
        const now = Date.now();
        if (now - (rateLimitRef.current[incoming.peer] || 0) < 5000) {
          addLog(`Rate-limited call from ${incoming.peer}`, 'warn');
          incoming.close();
          return;
        }
        rateLimitRef.current[incoming.peer] = now;

        setIncomingCall(incoming);
        addLog(`Incoming call from ${incoming.peer}`, 'warn');

        // Ringtone ring duration limit (45s timeout)
        incomingTimeoutRef.current = setTimeout(() => {
          addLog(`Incoming call from ${incoming.peer} timed out`, 'info');
          incoming.close();
          setIncomingCall(null);
        }, 45000);
      });

      peer.on('error', (err) => {
        if (destroyed) return;
        if (err.type === 'unavailable-id' && retryCount < 5) {
          retryCount++;
          peer.destroy();
          peerIdRef.current = generatePeerId();
          addLog(`ID collision, retrying with ${peerIdRef.current}...`, 'info');
          initPeer(peerIdRef.current);
        } else if (err.type === 'peer-unavailable') {
          addLog('User not found — verify the Peer ID', 'error');
          setIsCalling(false);
          setStatus('ready');
        } else {
          addLog(`Peer error: ${err.type}`, 'error');
          setStatus('ready');
        }
      });

      peer.on('disconnected', () => {
        if (destroyed) return;
        setStatus('connecting');
        addLog('Disconnected from signaling server. Reconnecting...', 'warn');
        try { peer.reconnect(); } catch (e) {}
      });
    }

    initPeer(peerIdRef.current);

    return () => {
      destroyed = true;
      endCall();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, [addLog, endCall]);

  // Handle Ringtone sound during incoming call overlay
  useEffect(() => {
    if (!incomingCall) return;
    const stopRingtone = playRingtone();
    return () => {
      stopRingtone();
    };
  }, [incomingCall]);

  // Start Outgoing Call
  const startCall = useCallback(async (targetPeerId) => {
    const destId = (targetPeerId || calleeId).replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
    if (!destId || destId === myId) return;

    document.activeElement?.blur();
    try {
      setIsCalling(true);
      setStatus('calling');
      addLog(`Initiating encrypted call to ${destId}...`, 'info');

      const stream = await acquireMicrophone();
      const call = peerRef.current.call(destId, stream, {
        sdpTransform: transformOpusSdp
      });

      setupCallListeners(call);

      // Outgoing call timeout (30s no answer)
      dialTimeoutRef.current = setTimeout(() => {
        addLog(`No response from ${destId} — call timed out`, 'warn');
        endCall();
      }, 30000);
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        addLog(`Could not start call: ${err.message}`, 'error');
      }
      setIsCalling(false);
      setStatus('ready');
    }
  }, [calleeId, myId, acquireMicrophone, setupCallListeners, addLog, endCall]);

  // Accept Incoming Call
  const answerCall = useCallback(async () => {
    const call = incomingCall;
    setIncomingCall(null);
    if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }

    try {
      addLog(`Answering call from ${call.peer}...`, 'info');
      const stream = await acquireMicrophone();
      call.answer(stream, {
        sdpTransform: transformOpusSdp
      });
      setupCallListeners(call);
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        addLog(`Could not answer call: ${err.message}`, 'error');
      }
      endCall();
    }
  }, [incomingCall, acquireMicrophone, setupCallListeners, addLog, endCall]);

  // Decline Incoming Call
  const declineCall = useCallback(() => {
    if (incomingCall) {
      addLog(`Declined incoming call from ${incomingCall.peer}`, 'info');
      if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }
      incomingCall.close();
      setIncomingCall(null);
    }
  }, [incomingCall, addLog]);

  // Cancel Outgoing Call
  const cancelCall = useCallback(() => {
    addLog('Outgoing call cancelled', 'info');
    endCall();
  }, [addLog, endCall]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    const newMuteState = !isMuted;
    if (rawStreamRef.current) {
      rawStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuteState; });
    }
    if (processedStreamRef.current) {
      processedStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuteState; });
    }
    setIsMuted(newMuteState);
    addLog(newMuteState ? 'Microphone muted' : 'Microphone unmuted', 'info');
  }, [isMuted, addLog]);

  // Toggle Speaker / Earpiece
  const toggleSpeaker = useCallback(async () => {
    const nextSpeakerState = !isSpeakerOn;
    setIsSpeakerOn(nextSpeakerState);
    const success = await setAudioOutputDevice(remoteAudioRef.current, nextSpeakerState);
    if (success) {
      addLog(nextSpeakerState ? 'Audio output: Speaker' : 'Audio output: Earpiece', 'info');
    } else {
      addLog('Output device switching not supported on this device/browser', 'warn');
    }
  }, [isSpeakerOn, addLog]);

  // Copy Peer ID to Clipboard
  const copyMyId = useCallback(async () => {
    if (!myId) return;
    try {
      await navigator.clipboard.writeText(myId);
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = myId;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    addLog('Your Peer ID copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  }, [myId, addLog]);

  const statusLabels = {
    connecting: 'Connecting...',
    ready: 'Ready',
    calling: 'Calling...',
    'in-call': 'In Call',
    reconnecting: 'Reconnecting...',
    busy: 'User Busy',
    error: 'Error'
  };

  const qualityBadge = {
    good: '🟢 Good',
    fair: '🟡 Fair',
    poor: '🔴 Poor'
  }[quality] || '🟢';

  return (
    <div className="app">
      {/* Hidden Audio Output Element */}
      <audio ref={remoteAudioRef} autoPlay playsInline id="remote-audio" aria-hidden="true" />

      <div className="shell">
        {/* Header Bar */}
        <div className="card header">
          <div className="brand">
            <div className="brand-icon">
              <Shield className="w-6 h-6" />
            </div>
            <div className="brand-text">
              <h1>SecureVoice</h1>
              <span className="v2-badge">v2.6</span>
            </div>
          </div>

          <div className="header-right">
            <div className={`status-chip ${status}`} role="status" aria-live="polite">
              <span className="dot" />
              <span>{statusLabels[status] || status}</span>
            </div>

            <button
              className="info-btn"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              className="info-btn"
              onClick={() => setShowInfo(true)}
              aria-label="App info"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Peer ID Card */}
        <div className="card">
          <p className="label">Your Peer ID</p>
          <div className="id-box">
            <span className={`id-text ${myId ? '' : 'dim'}`} aria-label="Your peer ID">
              {myId || 'Generating...'}
            </span>
            <button
              className={`copy-btn ${copied ? 'copied' : ''}`}
              onClick={copyMyId}
              disabled={!myId}
              aria-label="Copy ID to clipboard"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Main Action View: Ready / Calling / In-Call */}
        {!isInCall && !isCalling ? (
          <div className="card">
            <p className="label">New Call</p>
            <div className="input-row">
              <input
                type="text"
                className="peer-input"
                placeholder="Enter Friend's Peer ID..."
                value={calleeId}
                onChange={e => setCalleeId(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && startCall(calleeId)}
                disabled={status !== 'ready'}
                spellCheck={false}
                autoComplete="off"
                aria-label="Enter peer ID to call"
              />
              <button
                className="btn btn-blue"
                onClick={() => startCall(calleeId)}
                disabled={status !== 'ready' || !calleeId.trim()}
                aria-label="Start call"
              >
                <Phone className="w-4 h-4" />
                <span>Call</span>
              </button>
            </div>
          </div>
        ) : isCalling && !isInCall ? (
          <div className="card call-center">
            <div className="call-avatar calling-pulse">
              <PhoneCall className="w-8 h-8 text-blue" />
            </div>
            <p className="call-peer">{calleeId}</p>
            <p className="calling-label">Calling peer...</p>
            <button className="btn btn-red" onClick={cancelCall} aria-label="Cancel call">
              <span>✕ Cancel</span>
            </button>
          </div>
        ) : (
          <div className="card call-center">
            <div className="call-avatar">
              <Mic className="w-8 h-8 text-blue" />
            </div>
            <p className="call-peer">
              <span>{connectedPeer}</span>
              <span className="quality-dot" title={`Quality: ${quality}`}>{qualityBadge}</span>
            </p>

            <div className="timer" aria-live="polite" aria-label="Call duration">
              {formatTimer(callDuration)}
            </div>

            {/* Real-time Audio Spectrum Waveform Visualizer */}
            <AudioVisualizer stream={processedStreamRef.current || rawStreamRef.current} isActive={isInCall} />

            <div className="call-btns">
              <button
                className={`icon-btn ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                aria-pressed={isMuted}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button className="hangup" onClick={endCall} aria-label="End call">
                <PhoneOff className="w-6 h-6" />
              </button>

              <button
                className={`icon-btn ${isSpeakerOn ? 'speaker-on' : ''}`}
                onClick={toggleSpeaker}
                aria-pressed={isSpeakerOn}
                aria-label={isSpeakerOn ? 'Earpiece' : 'Speaker'}
              >
                {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
            </div>
          </div>
        )}

        {/* Recent Contacts Component */}
        {!isInCall && !isCalling && (
          <RecentCalls onSelectPeer={(id) => { setCalleeId(id); startCall(id); }} currentPeerId={myId} />
        )}

        {/* Activity Log Card */}
        <div className="card log-card">
          <div className="log-header" onClick={() => setShowLogs(!showLogs)}>
            <div className="log-title">
              <Activity className="w-4 h-4 text-blue" />
              <span>Activity Log</span>
              {logs.length > 0 && <span className="log-badge">{logs.length}</span>}
            </div>
            <span className="log-toggle">{showLogs ? '▲' : '▼'}</span>
          </div>

          {showLogs && (
            <div className="log-body" id="log-container">
              {logs.length === 0 ? (
                <p className="log-empty">No activity recorded yet</p>
              ) : (
                logs.map(log => (
                  <div key={log.id} className={`log-item ${log.level}`}>
                    <span className="log-time">{log.time}</span>
                    <span className="log-msg">{log.msg}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Incoming Call Dialog Overlay */}
      {incomingCall && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Incoming call">
          <div className="overlay-card">
            <div className="inc-avatar">
              <PhoneCall className="w-7 h-7 text-blue" />
            </div>
            <p className="inc-label">Incoming Call</p>
            <p className="inc-caller" id="incoming-caller-id">{incomingCall.peer}</p>
            <p className="inc-sub">Encrypted Audio · Low Latency P2P</p>

            <div className="inc-btns">
              <button className="btn btn-outline" onClick={declineCall} aria-label="Decline call">
                Decline
              </button>
              <button className="btn btn-green" onClick={answerCall} aria-label="Answer call">
                <Phone className="w-4 h-4" />
                <span>Answer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Technical Spec Info Modal */}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}
