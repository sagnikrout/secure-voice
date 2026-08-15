import React, { useEffect, memo } from 'react';
import { ShieldCheck, X, Cpu, Wifi, Lock, Zap, Sliders, Server } from 'lucide-react';

const SPECS = [
  { key: 'Encryption', val: 'DTLS-SRTP (WebRTC E2EE)', icon: Lock },
  { key: 'Audio Codec', val: 'Opus · 12 kbps (Low-latency)', icon: Cpu },
  { key: 'Noise Cancellation', val: 'Web Audio Gate + High-Pass 80Hz', icon: Sliders },
  { key: 'Bandwidth Cap', val: '16 kbps max (SDP b=AS)', icon: Zap },
  { key: 'Silence Suppression', val: 'DTX Active (usedtx=1)', icon: Wifi },
  { key: 'Connection Mode', val: 'Direct Peer-to-Peer (Mesh)', icon: ShieldCheck },
  { key: 'NAT Traversal', val: 'STUN / TURN (Metered Cloud)', icon: Server },
  { key: 'Signaling Protocol', val: 'PeerJS Cloud Engine', icon: Wifi }
];

function InfoModalComponent({ onClose }) {
  useEffect(() => {
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
          <span>Calls are end-to-end encrypted. Audio streams peer-to-peer and never traverses any intermediate server.</span>
        </div>
      </div>
    </div>
  );
}

export const InfoModal = memo(InfoModalComponent);
export default InfoModal;
