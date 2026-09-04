import React, { useEffect, useRef } from 'react';
import { Shield, ShieldAlert, Check } from 'lucide-react';

export default function SecurityVerificationModal({ safetyCode, onVerify, onReject, connectedPeer }) {
  const verifyBtnRef = useRef(null);

  useEffect(() => {
    verifyBtnRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onReject();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onReject]);

  // Format the code: 12345678 -> 1234-5678 for easier verbal reading
  const formattedCode = safetyCode ? `${safetyCode.substring(0, 4)}-${safetyCode.substring(4)}` : '';

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="verification-title">
      <div className="overlay-card" style={{ textAlign: 'center', padding: '24px' }}>
        <div className="inc-avatar" aria-hidden="true" style={{ margin: '0 auto 14px', width: '64px', height: '64px', borderRadius: '50%', background: 'var(--blue-light)', border: '2px solid var(--blue-mid)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--blue)' }}>
          <Shield className="w-8 h-8" />
        </div>
        
        <p className="inc-label" style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Verifying Secure Connection</p>
        <p className="inc-caller" id="verification-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '12px' }}>Peer: {connectedPeer}</p>
        
        <p className="inc-sub" style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: '1.4', marginBottom: '12px' }}>
          To ensure no one is intercepting this call (Man-in-the-Middle attack), you must read this 8-digit security code aloud to your contact:
        </p>
        
        <div style={{ fontSize: '36px', fontWeight: '700', letterSpacing: '6px', fontFamily: 'var(--mono)', color: 'var(--text)', background: 'var(--bg)', border: '2px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px', margin: '0 0 16px 0', display: 'flex', justifyContent: 'center' }}>
          {formattedCode}
        </div>
        
        <p className="inc-sub" style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.4', marginBottom: '20px', background: 'var(--bg)', padding: '12px', borderRadius: '8px' }}>
          <strong>Why do this?</strong> This code is derived mathematically from your device's encryption keys. If an attacker is listening, their keys will produce a different code.
        </p>

        <p className="inc-sub" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-2)', marginBottom: '16px' }}>
          Did they read the exact same code back to you?
        </p>

        <div className="inc-btns" style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            className="btn btn-red"
            onClick={onReject}
            aria-label="No, the code does not match"
            style={{ flex: 1, padding: '14px 16px' }}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Mismatch</span>
          </button>
          <button
            ref={verifyBtnRef}
            type="button"
            className="btn btn-green"
            onClick={onVerify}
            aria-label="Yes, the code exactly matches"
            style={{ flex: 1, padding: '14px 16px' }}
          >
            <Check className="w-4 h-4" />
            <span>Matches</span>
          </button>
        </div>
      </div>
    </div>
  );
}
