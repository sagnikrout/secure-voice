import React, { useRef, useEffect } from 'react';
import { Volume2, Mic, Check, X, Sliders } from 'lucide-react';
import { CodecPreference } from '../types';
import './DeviceSelectors.css';

/**
 * Audio Settings & Device Routing Modal Component.
 * Allows users to choose between all enumerated hardware speakers,
 * headphones, earpieces, bluetooth devices, hardware microphones,
 * and the Google Lyra v2 Neural Speech Codec.
 */
export default function AudioSettingsModal({
  isOpen,
  onClose,
  outputOptions = [],
  activeOutputId,
  onSelectOutput,
  micDevices = [],
  activeMicId,
  onSelectMic,
  preferredCodec = 'auto',
  onSelectCodec
}: {
  isOpen: boolean;
  onClose: () => void;
  outputOptions?: any[];
  activeOutputId?: string;
  onSelectOutput?: (id: string) => void;
  micDevices?: any[];
  activeMicId?: string;
  onSelectMic?: (id: string) => void;
  preferredCodec?: CodecPreference;
  onSelectCodec?: (codec: CodecPreference) => void;
}) {
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);
  const [blockedList, setBlockedList] = React.useState([]);

  useEffect(() => {
    if (isOpen) {
      try {
        setBlockedList(JSON.parse(localStorage.getItem('securevoice_blocked') || '[]'));
      } catch(e){}
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    closeBtnRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audio-settings-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="overlay-card modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-box">
            <Sliders className="w-5 h-5 text-blue" />
            <span id="audio-settings-title" className="modal-title">Audio Settings</span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Close audio settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Audio Output Section */}
        <div className="audio-settings-section">
          <div className="audio-settings-section-title">
            <Volume2 className="w-4 h-4 text-muted" />
            <span>Audio Output Options ({outputOptions.length})</span>
          </div>

          <div className="audio-settings-options" style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {outputOptions.map((opt) => {
              const IconComp = opt.icon || Volume2;
              const isActive = activeOutputId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`audio-settings-option ${isActive ? 'selected' : ''}`}
                  onClick={() => onSelectOutput(opt.id)}
                  aria-pressed={isActive}
                >
                  <div className="audio-settings-option-left">
                    <div className="audio-settings-option-icon">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="audio-settings-option-text">
                      <div className="audio-settings-option-name">{opt.label}</div>
                      {opt.description && (
                        <div className="audio-settings-option-desc">{opt.description}</div>
                      )}
                    </div>
                  </div>
                  {isActive && (
                    <div className="audio-settings-check">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Microphone Input Section */}
        <div className="audio-settings-section" style={{ marginTop: '16px' }}>
          <div className="audio-settings-section-title">
            <Mic className="w-4 h-4 text-muted" />
            <span>Microphone Input Options ({micDevices.length || 1})</span>
          </div>

          <div className="audio-settings-options" style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {micDevices.length > 0 ? (
              micDevices.map((device, idx) => {
                const isSelected = activeMicId === device.deviceId;
                return (
                  <button
                    key={device.deviceId || idx}
                    type="button"
                    className={`audio-settings-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectMic(device.deviceId)}
                    aria-pressed={isSelected}
                  >
                    <div className="audio-settings-option-left">
                      <div className="audio-settings-option-icon">
                        <Mic className="w-4 h-4" />
                      </div>
                      <div className="audio-settings-option-text">
                        <div className="audio-settings-option-name">
                          {device.label || `Microphone ${idx + 1}`}
                        </div>
                        <div className="audio-settings-option-desc">
                          {isSelected ? 'Active Microphone' : 'Detected Microphone'}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="audio-settings-check">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="audio-settings-empty">
                <span>Default System Microphone Active</span>
              </div>
            )}
          </div>
        </div>

        {/* Blocked Contacts */}
        <div className="audio-settings-section" style={{ marginTop: '16px' }}>
          <div className="audio-settings-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Blocked Contacts</span>
            </div>
          </div>
          <div className="audio-settings-options" style={{ marginTop: '8px' }}>
            {blockedList.length === 0 ? (
              <div className="audio-settings-empty">
                <span>No blocked contacts</span>
              </div>
            ) : (
              blockedList.map(id => (
                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '8px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: 600 }}>{id}</span>
                  <button 
                    onClick={() => {
                      const newBlocked = blockedList.filter(b => b !== id);
                      localStorage.setItem('securevoice_blocked', JSON.stringify(newBlocked));
                      setBlockedList(newBlocked);
                    }}
                    style={{ background: 'var(--bg-hover)', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}
                  >
                    Unblock
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Close Done Button */}
        <div style={{ marginTop: '20px' }}>
          <button
            type="button"
            className="btn btn-blue"
            onClick={onClose}
            style={{ width: '100%' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
