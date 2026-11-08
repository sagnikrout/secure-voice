import React, { useState, useCallback, useEffect, useRef } from 'react';
import { platform } from './platform';
import {
  Shield,
  Phone,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Copy,
  Check,
  Activity,
  ShieldAlert,
  PhoneMissed,
  Sliders,
  QrCode,
  Volume2,
  Speaker,
  Lock,
  Share2
} from 'lucide-react';

import { useTheme, useLogs, usePeer, useCallSession, useAudioDevices } from './hooks';
import { sanitizePeerId, formatTimer } from './utils/formatters';
import { STATUS_LABELS, QUALITY_BADGES, APP_VERSION, STORAGE_KEYS } from './constants/config';
import { parseCallTargetFromUrl, buildCallInviteUrl } from './utils/qrCode';
import { AcousticProfileId } from './types';

import AudioVisualizer from './components/AudioVisualizer';
import RecentCalls from './components/RecentCalls';
import SecurityVerificationModal from './components/SecurityVerificationModal';
import AudioSettingsModal, { CallAudioDeviceSwitcher } from './components/AudioSettingsModal';
import WebRtcStatsOverlay from './components/WebRtcStatsOverlay';
import QRCodeModal from './components/QRCodeModal';

/**
 * SecureVoice Main Application Shell
 */
export default function App() {
  useTheme();
  const { addLog } = useLogs();

  const [calleeInput, setCalleeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showRateLimitToast, setShowRateLimitToast] = useState(false);
  const [missedCallNotice, setMissedCallNotice] = useState(null);
  const [verificationDismissed, setVerificationDismissed] = useState(false);
  const [acousticProfile, setAcousticProfile] = useState<AcousticProfileId>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.ACOUSTIC_PROFILE);
        if (saved === 'balanced' || saved === 'voice-boost' || saved === 'studio-clean') {
          return saved as AcousticProfileId;
        }
      } catch {}
    }
    return 'balanced';
  });
  const copyTimeoutRef = useRef(null);
  const shareTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const missedCallTimeoutRef = useRef(null);

  // Parse deep-link invite on launch
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = parseCallTargetFromUrl(window.location.hash);
    if (target) {
      setCalleeInput(sanitizePeerId(target));
      addLog(`Prepared call target from link: ${target}`, 'info');
    }
  }, [addLog]);

  // Audio Device hook (dynamic inputs & outputs)
  const audioDevices = useAudioDevices();

  // Call session hook
  const callSession = useCallSession({
    addLog,
    onStatusChange: (s) => setPeerStatus(s),
    selectedInputId: audioDevices.selectedInputId,
    acousticProfile
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

  // Initialize platform services (Foreground service, keepalive watchdog on Android; clean Web APIs on Web)
  useEffect(() => {
    platform.initialize().catch(err => {
      addLog(`Platform init: ${err?.message || err}`, 'warn');
    });
    platform.requestPermissions().catch(() => {});

    const removeBackButton = platform.onBackButton(() => {
      return false; // let platform handle default minimization
    });

    return () => {
      removeBackButton();
    };
  }, [addLog]);

  // Synchronize incoming call alerts across platforms
  useEffect(() => {
    if (callSession.incomingCall?.peer) {
      platform.showIncomingCallNotification(callSession.incomingCall.peer).catch(() => {});
    } else {
      platform.cancelIncomingCallNotification().catch(() => {});
    }
  }, [callSession.incomingCall]);

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

  // Share direct invite link with friends (Web Share API with clipboard fallback)
  const shareInviteLink = useCallback(async () => {
    if (!myId) return;
    const inviteUrl = buildCallInviteUrl(myId);
    if (typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function') {
      try {
        await (navigator as any).share({
          title: 'SecureVoice – Encrypted Call',
          text: 'Call me on SecureVoice. Direct peer-to-peer audio with zero accounts or tracking.',
          url: inviteUrl
        });
        addLog('Invite link shared via system share sheet', 'info');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return; // User closed share sheet
      }
    }
    // Desktop / fallback: copy invite link to clipboard
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = inviteUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setShared(true);
    addLog('Call invite link copied to clipboard', 'info');
    if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
    shareTimeoutRef.current = setTimeout(() => setShared(false), 2000);
  }, [myId, addLog]);

  // Initiate outgoing encrypted call
  const handleStartCall = useCallback((targetId) => {
    const target = sanitizePeerId(targetId || calleeInput);
    if (!target || !peer) return;
    callSession.startCall(target, peer, myId);
  }, [calleeInput, peer, myId, callSession]);

  return (
    <div className="app"><div aria-live="polite" style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>Call status: {STATUS_LABELS[currentStatus] || currentStatus}</div>
      {/* Hidden audio element for remote WebRTC stream playback */}
      <audio
        ref={callSession.remoteAudioRef}
        autoPlay
        playsInline
        id="remote-audio"
        aria-hidden="true"
      />

      <div className="shell">
        {/* Main Call State: Active Call Console */}
        {callSession.isInCall ? (
          <div className="call-screen" role="region" aria-label="Active call center">
            {/* Top Bar: Security & Diagnostics */}
            <div className="call-top-bar">
              <div className="call-security-badge" title="Direct peer-to-peer connection with DTLS-SRTP encryption">
                <Lock className="w-3.5 h-3.5 text-green" />
                <span>End-to-End Encrypted</span>
              </div>

              <div className="call-top-actions">
                {callSession.safetyCode && (
                  <button
                    type="button"
                    onClick={() => setVerificationDismissed(false)}
                    className={`call-safety-btn ${callSession.isVerified ? 'verified' : ''}`}
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
                )}

                <button
                  type="button"
                  className="call-top-btn"
                  onClick={() => setShowStats(true)}
                  aria-label="Network Health"
                  title="Network Health"
                >
                  <Activity className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Central Call Hero Stage */}
            <div className="call-hero">
              <div className="call-avatar" aria-hidden="true">
                <span className="call-avatar-initials">
                  {callSession.connectedPeer ? callSession.connectedPeer.slice(0, 2) : 'SV'}
                </span>
              </div>

              <p className="call-peer">
                <span>{callSession.connectedPeer}</span>
                <span className={`quality-badge quality-${callSession.quality}`} title={`Quality: ${callSession.quality}`}>
                  <span className={`dot dot-${callSession.quality || 'good'}`} aria-hidden="true" />
                  <span>{QUALITY_BADGES[callSession.quality] || 'Good'}</span>
                </span>
              </p>

              <div className="timer" aria-live="polite" aria-label="Call duration">
                {formatTimer(callSession.callDuration)}
              </div>

              {/* Visualizer Canvas */}
              <AudioVisualizer stream={callSession.activeStream} isActive={callSession.isInCall} />

              <div className="mic-status-wrapper">
                <div className={`mic-status-badge ${callSession.isMuted ? 'muted' : 'live'}`}>
                  {callSession.isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                  <span>{callSession.isMuted ? 'Microphone muted' : 'Microphone live'}</span>
                </div>
              </div>
            </div>

            {/* Ergonomic Bottom Action Dock (Thumb-Zone) */}
            <div className="call-dock call-btns">
              {/* 1. Mute */}
              <div className="dock-btn-wrapper">
                <button
                  type="button"
                  className={`dock-btn icon-btn ${callSession.isMuted ? 'muted active-mute' : ''}`}
                  onClick={callSession.toggleMute}
                  aria-pressed={callSession.isMuted}
                  aria-label={callSession.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  title={callSession.isMuted ? 'Unmute' : 'Mute'}
                >
                  {callSession.isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                <span className="dock-label">{callSession.isMuted ? 'Unmute' : 'Mute'}</span>
              </div>

              {/* 2. Speaker / Audio Route */}
              <div className="dock-btn-wrapper">
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
                  activeAcousticProfile={acousticProfile}
                  onSelectAcousticProfile={setAcousticProfile}
                />
                <span className="dock-label">{callSession.isSpeakerOn ? 'Speaker' : 'Audio'}</span>
              </div>

              {/* 3. Acoustic Clarity */}
              <div className="dock-btn-wrapper">
                <button
                  type="button"
                  className="dock-btn icon-btn"
                  onClick={() => setShowAudioSettings(true)}
                  aria-label="Audio & Codec Settings"
                  title="Audio & Codec Settings"
                >
                  <Sliders className="w-6 h-6" />
                </button>
                <span className="dock-label">Clarity</span>
              </div>

              {/* 4. End Call */}
              <div className="dock-btn-wrapper">
                <button
                  type="button"
                  className="dock-btn dock-hangup hangup"
                  onClick={callSession.endCall}
                  aria-label="End call"
                  title="Hang up"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
                <span className="dock-label">End</span>
              </div>
            </div>
          </div>
        ) : callSession.isCalling && !callSession.isInCall ? (
          <div className="call-screen calling-screen" role="region" aria-label="Outgoing call in progress">
            <div className="call-top-bar">
              <div className="call-security-badge">
                <Lock className="w-3.5 h-3.5 text-blue" />
                <span>Outgoing Encrypted Link</span>
              </div>
            </div>

            <div className="call-hero">
              <div className="call-avatar calling-pulse" aria-hidden="true">
                <PhoneCall className="w-8 h-8 text-blue" />
              </div>
              <p className="call-peer" style={{ fontSize: '22px' }}>{calleeInput}</p>
              <p className="calling-label">Connecting encrypted link...</p>
            </div>

            <div className="call-dock" style={{ justifyContent: 'center' }}>
              <div className="dock-btn-wrapper">
                <button
                  type="button"
                  className="dock-btn dock-hangup hangup btn-red"
                  onClick={callSession.cancelCall}
                  aria-label="Cancel outgoing call"
                  title="Cancel call"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
                <span className="dock-label">Cancel</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Header Bar */}
            <header className="card header">
              <div className="brand">
                <div className="brand-icon" aria-hidden="true">
                  <img src="./logo.svg" alt="SecureVoice" />
                </div>
                <div className="brand-text">
                  <h1>SecureVoice</h1>
                  <p className="brand-tagline">Encrypted P2P Voice</p>
                </div>
              </div>

              <div className="header-right">
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
                <div className="id-actions">
                  <button
                    type="button"
                    className={`copy-btn ${copied ? 'copied' : ''}`}
                    onClick={copyMyId}
                    disabled={!myId}
                    aria-label="Copy ID to clipboard"
                    title="Copy Peer ID"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    className={`copy-btn share-btn ${shared ? 'copied' : ''}`}
                    onClick={shareInviteLink}
                    disabled={!myId}
                    aria-label="Share invite link with a friend"
                    title="Share invite link"
                  >
                    {shared ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                    <span>{shared ? 'Shared' : 'Share'}</span>
                  </button>
                  <button
                    type="button"
                    className="copy-btn qr-btn"
                    onClick={() => setShowQrModal(true)}
                    disabled={!myId}
                    aria-label="Share QR Code"
                    title="Share QR Code"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>QR</span>
                  </button>
                </div>
              </div>
            </section>

            {/* New Call Action Card */}
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
              <div className="privacy-banner">
                <Shield className="w-4 h-4 text-green" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Private & Direct:</strong> Zero accounts required. Audio is end-to-end encrypted and routed direct peer-to-peer with neural noise suppression.
                </span>
              </div>
            </section>

            {/* Recent Contacts List */}
            <RecentCalls
              onSelectPeer={(id) => {
                setCalleeInput(id);
                handleStartCall(id);
              }}
              currentPeerId={myId}
            />

            {/* App Footer */}
            <footer className="app-footer">
              <span>SecureVoice {APP_VERSION}</span>
              <span className="footer-dot">•</span>
              <span>Direct Peer-to-Peer</span>
              <span className="footer-dot">•</span>
              <span>Open Source</span>
            </footer>
          </>
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
                  className="btn btn-green"
                  onClick={callSession.answerCall}
                  aria-label="Answer incoming call"
                  style={{ width: '100%' }}
                >
                  <Phone className="w-4 h-4" />
                  <span>Answer</span>
                </button>
                <div className="inc-btns-row">
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
                    style={{ opacity: 0.85 }}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Block</span>
                  </button>
                </div>
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
            activeAcousticProfile={acousticProfile}
            onSelectAcousticProfile={setAcousticProfile}
          />
        )}

        {/* QR Code Air-Gapped Share Modal */}
        {showQrModal && (
          <QRCodeModal
            isOpen={showQrModal}
            onClose={() => setShowQrModal(false)}
            peerId={myId}
          />
        )}

        {/* WebRTC Diagnostics & Stats Modal */}
        {showStats && <WebRtcStatsOverlay isOpen={showStats} onClose={() => setShowStats(false)} callSession={callSession} />}
      </div>
    </div>
  );
}
