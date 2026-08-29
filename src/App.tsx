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
  PhoneMissed,
  Sliders
} from 'lucide-react';

import { useTheme } from './hooks/useTheme';
import { useLogs } from './hooks/useLogs';
import { usePeer } from './hooks/usePeer';
import { useCallSession } from './hooks/useCallSession';
import { useAudioDevices } from './hooks/useAudioDevices';
import { sanitizePeerId, formatTimer } from './utils/formatters';
import { STATUS_LABELS, QUALITY_BADGES, APP_VERSION } from './constants/config';

import AudioVisualizer from './components/AudioVisualizer';
import RecentCalls from './components/RecentCalls';
import InfoModal from './components/InfoModal';
import SecurityVerificationModal from './components/SecurityVerificationModal';
import CallAudioDeviceSwitcher from './components/CallAudioDeviceSwitcher';
import AudioSettingsModal from './components/AudioSettingsModal';
import WebRtcStatsOverlay from './components/WebRtcStatsOverlay';

/**
 * SecureVoice Main Application Shell
 */
export default function App() {
  const { darkMode, toggleTheme } = useTheme();
  const { addLog } = useLogs();

  const [calleeInput, setCalleeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showRateLimitToast, setShowRateLimitToast] = useState(false);
  const [missedCallNotice, setMissedCallNotice] = useState(null);
  const [verificationDismissed, setVerificationDismissed] = useState(false);
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

  // Reset verification dismissed flag when not in active call
  useEffect(() => {
    if (!callSession.isInCall) {
      setVerificationDismissed(false);
    }
  }, [callSession.isInCall]);

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
      } catch (err: any) {
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
    } catch (err: any) {
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
    <div className="app"><div aria-live="polite" style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>Call status: {STATUS_LABELS[currentStatus]?.text || currentStatus}</div>
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
              <img src="./logo.svg" alt="" />
            </div>
            <div className="brand-text">
              <h1>SecureVoice</h1>
              <span className="v2-badge">{APP_VERSION}</span>
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
              onClick={() => setShowAudioSettings(true)}
              aria-label="Audio & Codec Settings"
              title="Audio & Codec Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>

            <button
              type="button"
              className="info-btn"
              onClick={() => setShowStats(true)}
              aria-label="Network Health"
              title="Network Health"
            >
              <Activity className="w-4 h-4" />
            </button>

            <button
              type="button"
              className="info-btn"
              onClick={() => setShowInfo(true)}
              aria-label="About SecureVoice"
              title="About SecureVoice"
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

            {/* Interactive Security Verification Code Badge */}
            {callSession.safetyCode && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={() => setVerificationDismissed(false)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    borderRadius: '99px',
                    background: callSession.isVerified ? 'var(--green-light)' : 'var(--blue-light)',
                    color: callSession.isVerified ? 'var(--green)' : 'var(--blue)',
                    border: `1px solid ${callSession.isVerified ? 'var(--green)' : 'var(--blue)'}`,
                    cursor: 'pointer'
                  }}
                  title="Click to view full security verification dialog"
                  aria-label="Security Verification Code"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>
                    {callSession.isVerified
                      ? `Verified (${callSession.safetyCode.slice(0, 4)}-${callSession.safetyCode.slice(4)})`
                      : `Code: ${callSession.safetyCode.slice(0, 4)}-${callSession.safetyCode.slice(4)}`}
                  </span>
                </button>
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
                preferredCodec={callSession.preferredCodec}
                onSelectCodec={callSession.setPreferredCodec}
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
                  onClick={() => {
                    const peerId = callSession.incomingCall.peer;
                    const blocked = JSON.parse(localStorage.getItem('securevoice_blocked') || '[]');
                    if (!blocked.includes(peerId)) {
                      blocked.push(peerId);
                      localStorage.setItem('securevoice_blocked', JSON.stringify(blocked));
                    }
                    callSession.declineCall();
                  }}
                  aria-label="Block caller"
                  style={{ background: 'var(--red)', color: 'white', opacity: 0.9 }}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Block</span>
                </button>
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
              addLog('Security verification rejected. Terminating call.', 'error');
              callSession.endCall();
            }}
          />
        )}

        {/* Specs & Privacy Info Modal */}
        {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

        {/* Audio & Neural Codec Settings Modal */}
        {showAudioSettings && (
          <AudioSettingsModal
            isOpen={showAudioSettings}
            onClose={() => setShowAudioSettings(false)}
            outputOptions={audioDevices.audioOutputs}
            activeOutputId={callSession.activeOutputId}
            onSelectOutput={(outputId) => callSession.toggleSpeaker(outputId)}
            micDevices={audioDevices.audioInputs}
            activeMicId={audioDevices.selectedInputId}
            onSelectMic={(deviceId) => {
              audioDevices.selectAudioInput(deviceId);
              callSession.switchMicrophone(deviceId);
            }}
            preferredCodec={callSession.preferredCodec}
            onSelectCodec={callSession.setPreferredCodec}
          />
        )}

        {/* WebRTC Diagnostics & Stats Modal */}
        {showStats && <WebRtcStatsOverlay isOpen={showStats} onClose={() => setShowStats(false)} callSession={callSession} />}
      </div>
    </div>
  );
}
