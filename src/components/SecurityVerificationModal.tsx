import React, { useEffect, useRef } from 'react';
import { Lock, Check } from 'lucide-react';

interface SecurityVerificationModalProps {
  safetyCode: string;
  onClose: () => void;
  connectedPeer: string;
}

export default function SecurityVerificationModal({ safetyCode, onClose, connectedPeer }: SecurityVerificationModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="verification-title">
      <div className="overlay-card" style={{ textAlign: 'center', padding: '24px', maxWidth: '380px' }}>
        <div
          className="inc-avatar"
          aria-hidden="true"
          style={{
            margin: '0 auto 14px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(52, 199, 89, 0.12)',
            border: '2px solid rgba(52, 199, 89, 0.3)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'var(--green)'
          }}
        >
          <Lock className="w-7 h-7" />
        </div>
        
        <p className="inc-label" style={{ fontSize: '12px', fontWeight: '500', color: 'var(--muted)', marginBottom: '4px' }}>
          End-to-End Encryption
        </p>
        <p className="inc-caller" id="verification-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '12px' }}>
          Call with {connectedPeer}
        </p>
        
        <p className="inc-sub" style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.4', marginBottom: '16px' }}>
          Compare these 4 emojis with your contact. If they match on both screens, your DTLS-SRTP keys are authenticated against MITM tampering.
        </p>
        
        <div
          style={{
            fontSize: '32px',
            letterSpacing: '10px',
            color: 'var(--text)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '16px',
            margin: '0 0 16px 0',
            display: 'flex',
            justifyContent: 'center',
            userSelect: 'all'
          }}
          aria-label={`Security verification emojis: ${safetyCode}`}
        >
          {safetyCode}
        </div>
        
        <p className="inc-sub" style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.4', marginBottom: '20px', background: 'var(--card-2)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <strong>How it works:</strong> These emojis are derived from your device's unique DTLS cryptographic keys. An eavesdropper in the middle would produce completely different emojis.
        </p>

        <div className="inc-btns" style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            ref={closeBtnRef}
            type="button"
            className="btn btn-blue"
            onClick={onClose}
            aria-label="Close security info"
            style={{ width: '100%', padding: '12px 16px' }}
          >
            <Check className="w-4 h-4" />
            <span>Got It</span>
          </button>
        </div>
      </div>
    </div>
  );
}
