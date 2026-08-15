import React, { useState, useCallback, memo } from 'react';
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
  Activity
} from 'lucide-react';

import { useTheme } from './hooks/useTheme';
import { useLogs } from './hooks/useLogs';
import { usePeer } from './hooks/usePeer';
import { useCallSession } from './hooks/useCallSession';
import { sanitizePeerId } from './utils/webrtc';

import AudioVisualizer from './components/AudioVisualizer';
import RecentCalls from './components/RecentCalls';
import InfoModal from './components/InfoModal';

// Status labels & Quality badge mappings
const STATUS_LABELS = {
  connecting: 'Connecting...',
  ready: 'Ready',
  calling: 'Calling...',
  'in-call': 'In Call',
  reconnecting: 'Reconnecting...',
  busy: 'User Busy',
  error: 'Error'
};

const QUALITY_BADGES = {
  good: '🟢 Good',
  fair: '🟡 Fair',
  poor: '🔴 Poor'
};

function formatTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function App() {
  const { darkMode, toggleTheme } = useTheme();
  const { logs, showLogs, addLog, toggleLogs } = useLogs();

  const [calleeInput, setCalleeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Call session hook
  const callSession = useCallSession({
    peer: null, // Will be linked
    myId: '',
    addLog,
    onStatusChange: (s) => setPeerStatus(s)
  });

  // PeerJS signaling hook
  const {
    peer,
    myId,
    status: peerStatus,
    setStatus: setPeerStatus
  } = usePeer({
    addLog,
    onIncomingCall: callSession.handleIncomingCall,
    isInActiveCall: () => callSession.isInCall || callSession.isCalling
  });

  // Keep peer reference in call session
  callSession.peer = peer;
  callSession.myId = myId;

  // Derive active UI status
  const currentStatus = callSession.isInCall
    ? 'in-call'
    : callSession.isCalling
    ? 'calling'
    : peerStatus;

  // Copy Peer ID to clipboard
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
    addLog('Peer ID copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  }, [myId, addLog]);

  // Handle outgoing call trigger
  const handleStartCall = useCallback((targetId) => {
    const target = sanitizePeerId(targetId || calleeInput);
    if (!target) return;
    callSession.startCall(target);
  }, [calleeInput, callSession]);

  return (
    <div className="app">
      {/* Hidden audio element for remote WebRTC stream playback */}
      <audio
        ref={callSession.remoteAudioRef}
        autoPlay
        playsInline
        id="remote-audio"
        aria-hidden="true"
      />

      <div className="shell">
        {/* Header Bar */}
        <header className="card header">
          <div className="brand">
            <div className="brand-icon" aria-hidden="true">
              <Shield className="w-6 h-6" />
            </div>
            <div className="brand-text">
              <h1>SecureVoice</h1>
              <span className="v2-badge">v2.6</span>
            </div>
          </div>

          <div className="header-right">
            <div className={`status-chip ${currentStatus}`} role="status" aria-live="polite">
              <span className="dot" aria-hidden="true" />
              <span>{STATUS_LABELS[currentStatus] || currentStatus}</span>
            </div>

            <button
              type="button"
              className="info-btn"
              onClick={toggleTheme}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title="Toggle theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              className="info-btn"
              onClick={() => setShowInfo(true)}
              aria-label="App info & specs"
              title="Information"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Peer ID Box */}
        <section className="card" aria-labelledby="peer-id-label">
          <p id="peer-id-label" className="label">Your Peer ID</p>
          <div className="id-box">
            <span className={`id-text ${myId ? '' : 'dim'}`} aria-label="Your assigned peer ID">
              {myId || 'Generating...'}
            </span>
            <button
              type="button"
              className={`copy-btn ${copied ? 'copied' : ''}`}
              onClick={copyMyId}
              disabled={!myId}
              aria-label="Copy ID to clipboard"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </section>

        {/* Main Call State Action Cards */}
        {!callSession.isInCall && !callSession.isCalling ? (
          <section className="card" aria-labelledby="new-call-label">
            <p id="new-call-label" className="label">New Call</p>
            <div className="input-row">
              <input
                type="text"
                className="peer-input"
                placeholder="Enter Friend's Peer ID..."
                value={calleeInput}
                onChange={e => setCalleeInput(sanitizePeerId(e.target.value))}
                onKeyDown={e => e.key === 'Enter' && handleStartCall(calleeInput)}
                disabled={peerStatus !== 'ready'}
                spellCheck={false}
                autoComplete="off"
                maxLength={12}
                aria-label="Enter recipient peer ID"
              />
              <button
                type="button"
                className="btn btn-blue"
                onClick={() => handleStartCall(calleeInput)}
                disabled={peerStatus !== 'ready' || !calleeInput.trim()}
                aria-label="Initiate encrypted call"
              >
                <Phone className="w-4 h-4" />
                <span>Call</span>
              </button>
            </div>
          </section>
        ) : callSession.isCalling && !callSession.isInCall ? (
          <section className="card call-center" aria-label="Outgoing call in progress">
            <div className="call-avatar calling-pulse" aria-hidden="true">
              <PhoneCall className="w-8 h-8 text-blue" />
            </div>
            <p className="call-peer">{calleeInput}</p>
            <p className="calling-label">Connecting encrypted link...</p>
            <button
              type="button"
              className="btn btn-red"
              onClick={callSession.cancelCall}
              aria-label="Cancel outgoing call"
            >
              <span>✕ Cancel</span>
            </button>
          </section>
        ) : (
          <section className="card call-center" aria-label="Active call center">
            <div className="call-avatar" aria-hidden="true">
              <Mic className="w-8 h-8 text-blue" />
            </div>
            <p className="call-peer">
              <span>{callSession.connectedPeer}</span>
              <span className="quality-dot" title={`Quality: ${callSession.quality}`}>
                {QUALITY_BADGES[callSession.quality] || '🟢'}
              </span>
            </p>

            <div className="timer" aria-live="polite" aria-label="Call duration">
              {formatTimer(callSession.callDuration)}
            </div>

            {/* Visualizer Canvas */}
            <AudioVisualizer stream={callSession.activeStream} isActive={callSession.isInCall} />

            <div className="call-btns">
              <button
                type="button"
                className={`icon-btn ${callSession.isMuted ? 'muted' : ''}`}
                onClick={callSession.toggleMute}
                aria-pressed={callSession.isMuted}
                aria-label={callSession.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                title={callSession.isMuted ? 'Unmute' : 'Mute'}
              >
                {callSession.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                type="button"
                className="hangup"
                onClick={callSession.endCall}
                aria-label="End call"
                title="Hang up"
              >
                <PhoneOff className="w-6 h-6" />
              </button>

              <button
                type="button"
                className={`icon-btn ${callSession.isSpeakerOn ? 'speaker-on' : ''}`}
                onClick={callSession.toggleSpeaker}
                aria-pressed={callSession.isSpeakerOn}
                aria-label={callSession.isSpeakerOn ? 'Switch to earpiece' : 'Switch to speaker'}
                title={callSession.isSpeakerOn ? 'Speaker On' : 'Earpiece'}
              >
                {callSession.isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
            </div>
          </section>
        )}

        {/* Recent Contacts Drawer */}
        {!callSession.isInCall && !callSession.isCalling && (
          <RecentCalls
            onSelectPeer={(id) => {
              setCalleeInput(id);
              handleStartCall(id);
            }}
            currentPeerId={myId}
          />
        )}

        {/* Activity Log Card */}
        <section className="card log-card" aria-labelledby="activity-log-title">
          <div
            className="log-header"
            onClick={toggleLogs}
            role="button"
            tabIndex={0}
            aria-expanded={showLogs}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleLogs()}
          >
            <div className="log-title">
              <Activity className="w-4 h-4 text-blue" aria-hidden="true" />
              <span id="activity-log-title">Activity Log</span>
              {logs.length > 0 && <span className="log-badge">{logs.length}</span>}
            </div>
            <span className="log-toggle">{showLogs ? '▲' : '▼'}</span>
          </div>

          {showLogs && (
            <div className="log-body" id="log-container" tabIndex={0} aria-label="Activity history log">
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
        </section>
      </div>

      {/* Incoming Call Dialog Overlay */}
      {callSession.incomingCall && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incoming-caller-title"
        >
          <div className="overlay-card">
            <div className="inc-avatar" aria-hidden="true">
              <PhoneCall className="w-7 h-7 text-blue" />
            </div>
            <p className="inc-label">Incoming Call</p>
            <p className="inc-caller" id="incoming-caller-title">{callSession.incomingCall.peer}</p>
            <p className="inc-sub">Encrypted Audio · Low Latency P2P</p>

            <div className="inc-btns">
              <button
                type="button"
                className="btn btn-outline"
                onClick={callSession.declineCall}
                aria-label="Decline incoming call"
              >
                Decline
              </button>
              <button
                type="button"
                className="btn btn-green"
                onClick={callSession.answerCall}
                aria-label="Answer incoming call"
              >
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
