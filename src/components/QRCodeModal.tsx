import React, { useState, useEffect, useRef } from 'react';
import { QrCode, X, Copy, Check, Share2, ShieldCheck } from 'lucide-react';
import { generateQrCodeDataUrl, buildCallInviteUrl } from '../utils/qrCode';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  peerId: string;
}

export function QRCodeModal({ isOpen, onClose, peerId }: QRCodeModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const inviteUrl = buildCallInviteUrl(peerId);

  useEffect(() => {
    if (!isOpen || !peerId) return;

    setIsLoading(true);
    generateQrCodeDataUrl(inviteUrl, { width: 260, margin: 2 })
      .then(url => {
        setQrDataUrl(url);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to generate QR code:', err);
        setIsLoading(false);
      });
  }, [isOpen, peerId, inviteUrl]);

  useEffect(() => {
    if (!isOpen) return;

    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = inviteUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(peerId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = peerId;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      onClick={onClose}
    >
      <div
        className="overlay-card modal-card"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '400px', textAlign: 'center' }}
      >
        <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div className="modal-title-box">
            <QrCode className="w-5 h-5 text-blue" />
            <span id="qr-modal-title" className="modal-title">Share Peer ID</span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Close QR modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '8px', marginBottom: '16px' }}>
          Scan to call immediately or share the one-click invitation link.
        </p>

        {/* QR Code Container */}
        <div
          style={{
            background: '#ffffff',
            padding: '16px',
            borderRadius: '16px',
            display: 'inline-block',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            marginBottom: '16px',
            minWidth: '220px',
            minHeight: '220px'
          }}
        >
          {isLoading ? (
            <div style={{ padding: '60px 20px', color: '#666', fontSize: '13px' }}>
              Generating secure QR...
            </div>
          ) : qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code for Peer ${peerId}`}
              style={{ width: '220px', height: '220px', display: 'block', margin: '0 auto' }}
            />
          ) : (
            <div style={{ padding: '60px 20px', color: '#c00', fontSize: '13px' }}>
              Unable to load QR Code
            </div>
          )}
        </div>

        {/* Peer ID Display */}
        <div
          style={{
            background: 'var(--card-2)',
            border: '1px solid var(--border)',
            padding: '8px 14px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px'
          }}
        >
          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '15px', color: 'var(--text)' }}>
            {peerId}
          </span>
          <button
            type="button"
            className="copy-btn"
            onClick={handleCopyId}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            aria-label="Copy peer ID"
          >
            {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedId ? 'Copied' : 'Copy ID'}</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-blue"
            onClick={handleCopyLink}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {copiedLink ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            <span>{copiedLink ? 'Link Copied to Clipboard!' : 'Copy Direct Call Link'}</span>
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginTop: '4px'
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-green" />
            <span>Air-gapped and End-to-End Encrypted</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QRCodeModal;
