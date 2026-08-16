import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import { getAvailableOutputs } from '../utils/audioRouting';
import { Volume2, Phone, Bluetooth, Mic, Check, X, Sliders } from 'lucide-react';
import './DeviceSelectors.css';

/**
 * Audio Settings & Routing Controller Component for active calls.
 * Provides unified management of Audio Output (Speaker / Earpiece / Bluetooth)
 * and Microphone Input devices with live switching.
 */
export default function CallAudioDeviceSwitcher({ 
  isSpeakerOn, 
  onToggleSpeaker, 
  micDevices = [], 
  activeMicId, 
  onSwitchMic 
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [availableOutputs, setAvailableOutputs] = useState(['speaker', 'earpiece']);
  const modalRef = useRef(null);
  const triggerRef = useRef(null);

  // Check for native Bluetooth availability
  useEffect(() => {
    getAvailableOutputs().then(outputs => {
      if (outputs && Array.isArray(outputs)) {
        setAvailableOutputs(outputs);
      }
    });
  }, []);

  const outputOptions = [
    {
      id: 'speaker',
      label: 'Speaker',
      description: 'Loudspeaker playback',
      icon: Volume2,
      isActive: isSpeakerOn
    },
    {
      id: 'earpiece',
      label: 'Earpiece',
      description: 'Handset receiver with proximity screen-off',
      icon: Phone,
      isActive: !isSpeakerOn
    },
    ...(availableOutputs.includes('bluetooth') ? [{
      id: 'bluetooth',
      label: 'Bluetooth Audio',
      description: 'Wireless headset or car audio',
      icon: Bluetooth,
      isActive: false
    }] : [])
  ];

  // Close on Escape or click outside
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && modalOpen) {
        setModalOpen(false);
        triggerRef.current?.focus();
      }
    }
    if (modalOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  const handleSelectOutput = (outputId) => {
    onToggleSpeaker(outputId);
  };

  const handleSelectMic = (deviceId) => {
    onSwitchMic(deviceId);
  };

  return (
    <div className="audio-settings-wrapper">
      <div aria-live="polite" className="sr-only">
        {`Audio output set to ${isSpeakerOn ? 'Speaker' : 'Earpiece'}`}
      </div>

      {/* Action Dock Trigger Button */}
      <button 
        ref={triggerRef}
        type="button"
        className={`icon-btn ${modalOpen ? 'active' : ''}`}
        onClick={() => setModalOpen(true)}
        aria-label="Audio Settings"
        title="Audio Settings"
        aria-expanded={modalOpen}
        aria-haspopup="dialog"
      >
        <Volume2 className="w-5 h-5" />
      </button>

      {/* Audio Settings Modal */}
      {modalOpen && (
        <div 
          className="overlay" 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="audio-settings-title"
          onClick={() => setModalOpen(false)}
        >
          <div 
            ref={modalRef} 
            className="overlay-card modal-card" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '420px' }}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-title-box">
                <Sliders className="w-5 h-5 text-blue" />
                <span id="audio-settings-title" className="modal-title">Audio Settings</span>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setModalOpen(false)}
                aria-label="Close audio settings"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Audio Output Section */}
            <div className="audio-settings-section">
              <div className="audio-settings-section-title">
                <Volume2 className="w-4 h-4 text-muted" />
                <span>Audio Output</span>
              </div>

              <div className="audio-settings-options">
                {outputOptions.map((opt) => {
                  const IconComp = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`audio-settings-option ${opt.isActive ? 'selected' : ''}`}
                      onClick={() => handleSelectOutput(opt.id)}
                      aria-pressed={opt.isActive}
                    >
                      <div className="audio-settings-option-left">
                        <div className="audio-settings-option-icon">
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div className="audio-settings-option-text">
                          <div className="audio-settings-option-name">{opt.label}</div>
                          <div className="audio-settings-option-desc">{opt.description}</div>
                        </div>
                      </div>
                      {opt.isActive && (
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
                <span>Microphone Input</span>
              </div>

              <div className="audio-settings-options">
                {micDevices.length > 0 ? (
                  micDevices.map((device, idx) => {
                    const isSelected = activeMicId === device.deviceId;
                    return (
                      <button
                        key={device.deviceId || idx}
                        type="button"
                        className={`audio-settings-option ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectMic(device.deviceId)}
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

            {/* Close Button */}
            <div style={{ marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-blue"
                onClick={() => setModalOpen(false)}
                style={{ width: '100%' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
