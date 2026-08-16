import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import {
  Shield,
  Phone,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Copy,
  Check,
  Moon,
  Sun,
  Info,
  Activity,
  ShieldAlert,
  PhoneMissed
} from 'lucide-react';

import { useTheme } from './hooks/useTheme';
import { useLogs } from './hooks/useLogs';
import { usePeer } from './hooks/usePeer';
import { useCallSession } from './hooks/useCallSession';
import { useAudioDevices } from './hooks/useAudioDevices';
import { sanitizePeerId, formatTimer } from './utils/formatters';
import { STATUS_LABELS, QUALITY_BADGES } from './constants/config';

import AudioVisualizer from './components/AudioVisualizer';
import RecentCalls from './components/RecentCalls';
import InfoModal from './components/InfoModal';
import SecurityVerificationModal from './components/SecurityVerificationModal';
import CallAudioDeviceSwitcher from './components/CallAudioDeviceSwitcher';
import WebRtcStatsOverlay from './components/WebRtcStatsOverlay';

/**
 * SecureVoice Main Application Shell
 */
export default function App() {
  const { darkMode, toggleTheme } = useTheme();
  const { logs, showLogs, addLog, toggleLogs } = useLogs();

  const [calleeInput, setCalleeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showRateLimitToast, setShowRateLimitToast] = useState(false);
  const [missedCallNotice, setMissedCallNotice] = useState(null);
  const copyTimeoutRef = useRef(null);
  const missedCallTimeoutRef = useRef(null);

  // Audio Device hook (dynamic inputs & outputs)
  const audioDevices = useAudioDevices();

  // Call session hook
  const callSession = useCallSession({
    addLog,
    onStatusChange: (s) => setPeerStatus(s),
    selectedInputId: audioDevices.selectedInputId
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
    isInActiveCall: () => callSession.isInCall || callSession.isCalling,
    onRateLimitHit: () => {
      setShowRateLimitToast(true);
      setTimeout(() => setShowRateLimitToast(false), 5000);
    },
    onMissedCall: (callerPeer) => {
      setMissedCallNotice(callerPeer);
      if (missedCallTimeoutRef.current) clearTimeout(missedCallTimeoutRef.current);
      missedCallTimeoutRef.current = setTimeout(() => setMissedCallNotice(null), 5000);
    }
  });

  // Keep WebRTC background connectivity active via Android Foreground Service
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    const startForeground = async () => {
      try {
        await ForegroundService.startForegroundService({
          id: 112,
          title: 'SecureVoice Active',
          body: 'Waiting for P2P connections...',
          smallIcon: 'ic_launcher'
        });
      } catch (err) {
        addLog(`Foreground Service: ${err.message}`, 'error');
      }
    };
    startForeground();

    return () => {
      ForegroundService.stopForegroundService().catch(() => {});
    };
  }, [addLog]);

  // Derive active UI status
  const currentStatus = callSession.isInCall
    ? 'in-call'
    : callSession.isCalling
    ? 'calling'
    : peerStatus;

  // Copy Peer ID to clipboard with visual feedback
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
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [myId, addLog]);

  // Initiate outgoing encrypted call
  const handleStartCall = useCallback((targetId) => {
    const target = sanitizePeerId(targetId || calleeInput);
    if (!target || !peer) return;
    callSession.startCall(target, peer, myId);
  }, [calleeInput, peer, myId, callSession]);

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
              <img src="./logo.png" alt="SecureVoice Logo" />
            </div>
            <div className="brand-text">
              <h1>SecureVoice</h1>
              <span className="v2-badge">v3.0.1</span>
            </div>
          </div>

          <div className="header-right">
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
              onClick={() => setShowStats(true)}
              aria-label="WebRTC Diagnostics & Stats"
              title="WebRTC Diagnostics"
            >
              <Activity className="w-4 h-4" />
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
          <div className="card-header-row">
            <p id="peer-id-label" className="label">Your Peer ID</p>
            <div className={`status-chip ${currentStatus}`} role="status" aria-live="polite">
              <span className="dot" aria-hidden="true" />
              <span>{STATUS_LABELS[currentStatus] || currentStatus}</span>
            </div>
          </div>
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
                maxLength={16}
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
            <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-2)', display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'var(--card-2)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
              <Shield className="w-4 h-4 text-green" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span style={{ lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--text)' }}>Privacy Note:</strong> Your microphone is fully disabled until a call is explicitly answered. Audio is routed P2P and is end-to-end encrypted.
              </span>
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

            {callSession.isVerified && (
              <div className="status-chip ready" style={{ marginBottom: '16px', background: 'var(--bg)', border: 'none' }} title="Connection is Verified & End-to-End Encrypted">
                <Shield className="w-3 h-3" />
                <span>Verified E2EE</span>
              </div>
            )}

            {/* Visualizer Canvas */}
            <AudioVisualizer stream={callSession.activeStream} isActive={callSession.isInCall} />

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: callSession.isMuted ? 'var(--red-light)' : 'var(--green-light)', color: callSession.isMuted ? 'var(--red)' : 'var(--green)', borderRadius: '99px', fontSize: '11px', fontWeight: '600' }}>
                 {callSession.isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                 <span>{callSession.isMuted ? 'Microphone Muted' : 'Microphone Live'}</span>
              </div>
            </div>

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

              <CallAudioDeviceSwitcher
                isSpeakerOn={callSession.isSpeakerOn}
                onToggleSpeaker={callSession.toggleSpeaker}
                activeOutputId={callSession.activeOutputId}
                outputDevices={audioDevices.audioOutputs}
                micDevices={audioDevices.audioInputs}
                activeMicId={audioDevices.selectedInputId}
                onSwitchMic={(deviceId) => {
                  audioDevices.selectAudioInput(deviceId);
                  callSession.switchMicrophone(deviceId);
                }}
              />
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

        {/* Global Rate Limit Toast */}
        {showRateLimitToast && (
          <div className="toast toast-warning" role="alert">
            <ShieldAlert className="w-4 h-4 text-amber" />
            <span>Spam Prevention: Incoming call throttled</span>
          </div>
        )}

        {/* Missed Call Banner Toast */}
        {missedCallNotice && (
          <div className="toast toast-warning" role="alert" style={{ background: 'var(--red-light)', borderColor: 'var(--red)', color: 'var(--red)' }}>
            <PhoneMissed className="w-4 h-4 text-red" />
            <span>Missed Call from <strong>{missedCallNotice}</strong> (Line Busy)</span>
          </div>
        )}

        {/* Incoming Call Modal */}
        {callSession.incomingCall && (
          <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="incoming-caller-id">
            <div className="overlay-card incoming-card">
              <div className="inc-avatar calling-pulse" aria-hidden="true">
                <Phone className="w-8 h-8 text-blue" />
              </div>
              <p className="inc-label">Incoming Encrypted Call</p>
              <p className="inc-caller" id="incoming-caller-id">{callSession.incomingCall.peer}</p>
              <div className="inc-btns">
                <button
                  type="button"
                  className="btn btn-red"
                  onClick={callSession.declineCall}
                  aria-label="Decline incoming call"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>Decline</span>
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

        {/* MITM Security Verification Modal */}
        {callSession.isInCall && callSession.safetyCode && !callSession.isVerified && (
          <SecurityVerificationModal
            safetyCode={callSession.safetyCode}
            connectedPeer={callSession.connectedPeer}
            onVerify={() => {
              callSession.setIsVerified(true);
              addLog('Connection authenticity verified by user', 'ok');
            }}
            onReject={() => {
              addLog('Security alert: Verbal safety code mismatched! Call aborted.', 'error');
              callSession.endCall();
            }}
          />
        )}

        {/* Specs & Privacy Info Modal */}
        {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

        {/* WebRTC Diagnostics & Stats Modal */}
        {showStats && <WebRtcStatsOverlay isOpen={showStats} onClose={() => setShowStats(false)} callSession={callSession} />}
      </div>
    </div>
  );
}
