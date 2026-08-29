import React, { useEffect, useRef, memo } from 'react';
import { ShieldCheck, X, Cpu, Wifi, Lock, Zap, Sliders, Server } from 'lucide-react';

const SPECS = [
  { key: 'Encryption', val: 'DTLS-SRTP (WebRTC E2EE)', icon: Lock },
  { key: 'Audio Codec', val: 'Google Lyra v2 (3.2 kbps) · Opus HD', icon: Cpu },
  { key: 'Voice Pre-Processing', val: '6-Stage Vocal Formant DSP + RMS Gate', icon: Sliders },
  { key: 'Bandwidth Cap', val: '18.0 kbps session ceiling (b=AS:18)', icon: Zap },
  { key: 'Packet Aggregation', val: 'ptime=40ms (25 pkts/sec)', icon: Zap },
  { key: 'Loss Recovery', val: 'Neural PLC + In-band FEC + RFC 2198 RED', icon: Wifi },
  { key: 'Jitter Buffer', val: 'Dual-Clamped NetEQ Controller', icon: Sliders },
  { key: 'Connection Mode', val: 'Direct P2P with Adaptive TURN Failover', icon: ShieldCheck },
  { key: 'Signaling Protocol', val: 'E2E Encrypted Signaling (ECDH P-256 + AES-GCM)', icon: Server },
  { key: 'Privacy & Storage', val: 'Zero Server Logs · Local Device Sandbox Only', icon: Lock }
];

function InfoModalComponent({ onClose }) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
      onClick={onClose}
    >
      <div className="overlay-card modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-box">
            <ShieldCheck className="w-5 h-5 text-blue" />
            <span id="info-modal-title" className="modal-title">How SecureVoice Works</span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="info-list">
          {SPECS.map(({ key, val, icon: Icon }) => (
            <div className="info-row" key={key}>
              <div className="info-key-box">
                <Icon className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                <span className="info-key">{key}</span>
              </div>
              <span className="info-val">{val}</span>
            </div>
          ))}
        </div>

        <div className="modal-note">
          <Lock className="w-4 h-4 text-green inline-block mr-1" aria-hidden="true" />
          <span>Voice media travels directly peer-to-peer (DTLS-SRTP). Signaling is encrypted client-side. Call history and logs remain exclusively on your local device.</span>
        </div>
      </div>
    </div>
  );
}

export const InfoModal = memo(InfoModalComponent);
export default InfoModal;
