import React, { useRef, useEffect } from 'react';
import { Volume2, Phone, Bluetooth, Mic, Check, X, Sliders, Speaker, Headphones, Cpu, Sparkles } from 'lucide-react';
import { isWasmSimdSupported } from '../utils/lyra/lyraWasmLoader';
import { CodecType, CodecPreference } from '../types';
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

        {/* Neural Codec Architecture Section */}
        <div className="audio-settings-section" style={{ marginTop: '16px' }}>
          <div className="audio-settings-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Cpu className="w-4 h-4 text-muted" />
              <span>Voice Codec Engine</span>
            </div>
            {isWasmSimdSupported() ? (
              <span style={{ fontSize: '11px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                WASM SIMD Ready
              </span>
            ) : (
              <span style={{ fontSize: '11px', background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', padding: '2px 6px', borderRadius: '4px' }}>
                Standard CPU
              </span>
            )}
          </div>

          <div className="audio-settings-options">
            {/* Smart Auto Crossover Option (Recommended) */}
            <button
              type="button"
              className={`audio-settings-option ${preferredCodec === 'auto' ? 'selected' : ''}`}
              onClick={() => onSelectCodec?.('auto')}
              aria-pressed={preferredCodec === 'auto'}
            >
              <div className="audio-settings-option-left">
                <div className="audio-settings-option-icon" style={{ color: '#22c55e' }}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="audio-settings-option-text">
                  <div className="audio-settings-option-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Smart Auto Crossover (Recommended)</span>
                  </div>
                  <div className="audio-settings-option-desc">
                    Lyra v2 Neural (&lt;14 kbps) · Opus HD (&ge;14 kbps broadband)
                  </div>
                </div>
              </div>
              {preferredCodec === 'auto' && (
                <div className="audio-settings-check">
                  <Check className="w-4 h-4" />
                </div>
              )}
            </button>

            {/* Lyra Locked Option */}
            <button
              type="button"
              className={`audio-settings-option ${preferredCodec === 'lyra' ? 'selected' : ''}`}
              onClick={() => onSelectCodec?.('lyra')}
              aria-pressed={preferredCodec === 'lyra'}
            >
              <div className="audio-settings-option-left">
                <div className="audio-settings-option-icon" style={{ color: '#3b82f6' }}>
                  <Cpu className="w-4 h-4" />
                </div>
                <div className="audio-settings-option-text">
                  <div className="audio-settings-option-name">Google Lyra v2 (Locked 3.2 kbps)</div>
                  <div className="audio-settings-option-desc">
                    SoundStream wideband AI vocoder (~0.84 kB/s sub-1 kB/s data rate)
                  </div>
                </div>
              </div>
              {preferredCodec === 'lyra' && (
                <div className="audio-settings-check">
                  <Check className="w-4 h-4" />
                </div>
              )}
            </button>

            {/* Opus Option */}
            <button
              type="button"
              className={`audio-settings-option ${preferredCodec === 'opus' ? 'selected' : ''}`}
              onClick={() => onSelectCodec?.('opus')}
              aria-pressed={preferredCodec === 'opus'}
            >
              <div className="audio-settings-option-left">
                <div className="audio-settings-option-icon">
                  <Sliders className="w-4 h-4" />
                </div>
                <div className="audio-settings-option-text">
                  <div className="audio-settings-option-name">Standard Opus (Adaptive)</div>
                  <div className="audio-settings-option-desc">
                    6-tier adaptive SILK/CELT ladder (1.2 to 24.0 kbps)
                  </div>
                </div>
              </div>
              {preferredCodec === 'opus' && (
                <div className="audio-settings-check">
                  <Check className="w-4 h-4" />
                </div>
              )}
            </button>
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
