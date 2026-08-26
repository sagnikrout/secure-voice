import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Volume2, Phone, Bluetooth, Speaker, Headphones, ChevronUp } from 'lucide-react';
import { getAvailableOutputs } from '../utils/audioRouting';
import AudioSettingsModal from './AudioSettingsModal';
import './DeviceSelectors.css';

/**
 * Call action dock controller for Audio Settings & Routing.
 */
export default function CallAudioDeviceSwitcher({ 
  isSpeakerOn, 
  onToggleSpeaker, 
  activeOutputId,
  outputDevices = [],
  micDevices = [], 
  activeMicId, 
  onSwitchMic,
  preferredCodec = 'auto',
  onSelectCodec
}: {
  isSpeakerOn?: boolean;
  onToggleSpeaker: (mode: any) => void;
  activeOutputId?: string;
  outputDevices?: any[];
  micDevices?: any[];
  activeMicId?: string;
  onSwitchMic: (deviceId: string) => void;
  preferredCodec?: any;
  onSelectCodec?: (codec: any) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [nativeOutputs, setNativeOutputs] = useState(['speaker', 'earpiece']);
  const triggerRef = useRef(null);

  // Check for native Bluetooth availability on mount
  useEffect(() => {
    getAvailableOutputs().then(outputs => {
      if (outputs && Array.isArray(outputs)) {
        setNativeOutputs(outputs);
      }
    });
  }, []);

  // Assemble full list of output options (combining hardware devices & native modes)
  const combinedOutputOptions = useMemo(() => {
    const list = [];

    // 1. If discrete hardware outputs are detected, list them
    if (outputDevices.length > 0) {
      outputDevices.forEach((dev, idx) => {
        const isDefault = dev.deviceId === 'default' || dev.deviceId === '';
        const isHeadphones = dev.label.toLowerCase().includes('headphone') || dev.label.toLowerCase().includes('headset');
        const isBluetooth = dev.label.toLowerCase().includes('bluetooth') || dev.label.toLowerCase().includes('hands-free');

        list.push({
          id: dev.deviceId || `output-${idx}`,
          label: dev.label || `Output Device ${idx + 1}`,
          description: isDefault ? 'System Default Audio Output' : 'Hardware Audio Output Device',
          icon: isHeadphones ? Headphones : (isBluetooth ? Bluetooth : Speaker),
          rawDeviceId: dev.deviceId
        });
      });
    }

    // 2. Standard Native Output Targets (Speaker / Earpiece / Bluetooth SCO)
    if (list.length === 0 || nativeOutputs.includes('earpiece') || nativeOutputs.includes('bluetooth')) {
      const standardOptions = [
        {
          id: 'speaker',
          label: 'Speaker (Loudspeaker)',
          description: 'High-volume loudspeaker playback',
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

      standardOptions.forEach(std => {
        if (!list.some(item => item.id === std.id)) {
          list.push(std);
        }
      });
    }

    return list;
  }, [outputDevices, nativeOutputs]);

  const currentOutputId = activeOutputId || (isSpeakerOn ? 'speaker' : 'earpiece');

  // Select appropriate icon for current active output target
  const ActiveIcon = useMemo(() => {
    const activeOption = combinedOutputOptions.find(o => o.id === currentOutputId);
    if (activeOption?.icon) return activeOption.icon;
    if (currentOutputId === 'earpiece') return Phone;
    if (currentOutputId === 'bluetooth') return Bluetooth;
    return Volume2;
  }, [combinedOutputOptions, currentOutputId]);

  return (
    <div className="audio-settings-wrapper">
      {/* Action Dock Trigger Button with chevron toggle indicator */}
      <button 
        ref={triggerRef}
        type="button"
        className={`icon-btn ${modalOpen ? 'active' : ''}`}
        onClick={() => setModalOpen(prev => !prev)}
        aria-label="Audio Settings & Device Switcher"
        title="Audio Settings"
        aria-expanded={modalOpen}
        aria-haspopup="dialog"
      >
        <ActiveIcon className="w-5 h-5" />
      </button>

      {/* Audio Settings Modal */}
      <AudioSettingsModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          triggerRef.current?.focus();
        }}
        outputOptions={combinedOutputOptions}
        activeOutputId={currentOutputId}
        onSelectOutput={(outputId) => onToggleSpeaker(outputId)}
        micDevices={micDevices}
        activeMicId={activeMicId}
        onSelectMic={(deviceId) => onSwitchMic(deviceId)}
        preferredCodec={preferredCodec}
        onSelectCodec={onSelectCodec}
      />
    </div>
  );
}
