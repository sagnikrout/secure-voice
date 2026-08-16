import React, { useState, useRef, useEffect, useMemo } from 'react';
import { getAvailableOutputs } from '../utils/audioRouting';
import { Volume2, Phone, Bluetooth, Mic, Check, X, Sliders, Speaker, Headphones } from 'lucide-react';
import './DeviceSelectors.css';

/**
 * Unified Audio Settings & Routing Controller Component.
 * Lists ALL detected hardware microphones and ALL detected output options
 * (Speaker, Earpiece, Bluetooth, and discrete Hardware Output Sinks).
 */
export default function CallAudioDeviceSwitcher({ 
  isSpeakerOn, 
  onToggleSpeaker, 
  activeOutputId,
  outputDevices = [],
  micDevices = [], 
  activeMicId, 
  onSwitchMic 
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [nativeOutputs, setNativeOutputs] = useState(['speaker', 'earpiece']);
  const modalRef = useRef(null);
  const triggerRef = useRef(null);

  // Check for native Bluetooth availability
  useEffect(() => {
    getAvailableOutputs().then(outputs => {
      if (outputs && Array.isArray(outputs)) {
        setNativeOutputs(outputs);
      }
    });
  }, []);

  // Assemble full list of output options (combining native modes & hardware devices)
  const combinedOutputOptions = useMemo(() => {
    const list = [];

    // 1. If discrete hardware outputs are detected (e.g. on Desktop browsers), list them
    if (outputDevices.length > 0) {
      outputDevices.forEach((dev, idx) => {
        const isDefault = dev.deviceId === 'default' || dev.deviceId === '';
        const isHeadphones = dev.label.toLowerCase().includes('headphone') || dev.label.toLowerCase().includes('headset');
        const isBluetooth = dev.label.toLowerCase().includes('bluetooth') || dev.label.toLowerCase().includes('hands-free');

        list.push({
          id: dev.deviceId || `output-${idx}`,
          label: dev.label || `Output Device ${idx + 1}`,
          description: isDefault ? 'System Default Audio Output' : 'Hardware Audio Device',
          icon: isHeadphones ? Headphones : (isBluetooth ? Bluetooth : Speaker),
          rawDeviceId: dev.deviceId
        });
      });
    }

    // 2. Standard / Native Output Targets
    // Only add basic Speaker/Earpiece if discrete devices weren't already enumerating specific ones,
    // or to ensure earpiece / bluetooth native switching is accessible on mobile
    if (list.length === 0 || nativeOutputs.includes('earpiece') || nativeOutputs.includes('bluetooth')) {
      const standardOptions = [
        {
          id: 'speaker',
          label: 'Speaker (Loudspeaker)',
          description: 'High-volume loudspeaker output',
          icon: Volume2
        },
        {
          id: 'earpiece',
          label: 'Earpiece (Handset)',
          description: 'Ear receiver with proximity screen-off',
          icon: Phone
        }
      ];

      if (nativeOutputs.includes('bluetooth')) {
        standardOptions.push({
          id: 'bluetooth',
          label: 'Bluetooth SCO Headset',
          description: 'Wireless Bluetooth connected peripheral',
          icon: Bluetooth
        });
      }

      // Prepend standard modes if not already in list
      standardOptions.forEach(std => {
        if (!list.some(item => item.id === std.id)) {
          list.push(std);
        }
      });
    }

    return list;
  }, [outputDevices, nativeOutputs]);

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

  // Determine which output is currently active
  const isOutputActive = (optId) => {
    if (activeOutputId) {
      return activeOutputId === optId;
    }
    if (optId === 'speaker') return isSpeakerOn;
    if (optId === 'earpiece') return !isSpeakerOn;
    return false;
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
            style={{ maxWidth: '440px' }}
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
                <span>Audio Output Options ({combinedOutputOptions.length})</span>
              </div>

              <div className="audio-settings-options" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                {combinedOutputOptions.map((opt) => {
                  const IconComp = opt.icon;
                  const active = isOutputActive(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`audio-settings-option ${active ? 'selected' : ''}`}
                      onClick={() => handleSelectOutput(opt.id)}
                      aria-pressed={active}
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
                      {active && (
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
                            <div className="audio-settings-option-desc">
                              {isSelected ? 'Active Input Device' : 'Detected Microphone'}
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
