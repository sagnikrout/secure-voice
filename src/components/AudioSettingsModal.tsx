import React, { useRef, useEffect, useState } from 'react';
import { Volume2, Mic, MicOff, Check, X, SlidersHorizontal, Sliders, Bluetooth, Speaker, Headphones, Activity } from 'lucide-react';
import { CodecPreference, AcousticProfileId } from '../types';
import { ACOUSTIC_PROFILES, STORAGE_KEYS } from '../constants/config';
import './DeviceSelectors.css';

// Option 1: FaceTime / Discord 2-Mode Clarity Model
const ACTIVE_MODAL_PROFILES = [
  {
    id: 'balanced' as const,
    label: 'Standard (Natural Voice)',
    icon: Volume2
  },
  {
    id: 'neural-enhanced' as const,
    label: 'Voice Isolation (AI Denoise)',
    icon: SlidersHorizontal
  }
];

/**
 * Audio Settings & Device Routing Modal Component.
 * Ergonomic, streamlined modal allowing users to choose output devices,
 * input microphones, test speaker playback, test mic levels, and select acoustic clarity profiles.
 */
export function AudioSettingsModal({
  isOpen,
  onClose,
  outputOptions = [],
  activeOutputId,
  onSelectOutput,
  micDevices = [],
  activeMicId,
  onSelectMic,
  preferredCodec = 'auto',
  onSelectCodec,
  activeAcousticProfile = 'balanced',
  onSelectAcousticProfile
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
  activeAcousticProfile?: AcousticProfileId;
  onSelectAcousticProfile?: (profile: AcousticProfileId) => void;
}) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [blockedList, setBlockedList] = useState<string[]>([]);
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [speakerTesting, setSpeakerTesting] = useState(false);
  const testStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      try {
        setBlockedList(JSON.parse(localStorage.getItem('securevoice_blocked') || '[]'));
      } catch {}
    } else {
      stopMicTest();
      setSpeakerTesting(false);
    }
  }, [isOpen]);

  // Clean up mic test
  const stopMicTest = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach(t => t.stop());
      testStreamRef.current = null;
    }
    setMicTesting(false);
    setMicLevel(0);
  };

  // Start real-time mic visualizer test
  const startMicTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: activeMicId ? { deviceId: { exact: activeMicId } } : true
      });
      testStreamRef.current = stream;
      setMicTesting(true);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('Failed to start mic test:', e);
      stopMicTest();
    }
  };

  // Play two-tone acoustic speaker test chime
  const playSpeakerTest = async () => {
    if (speakerTesting) return;
    setSpeakerTesting(true);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        setTimeout(() => setSpeakerTesting(false), 600);
        return;
      }

      const ctx = new AudioCtx();
      if (activeOutputId && typeof (ctx as any).setSinkId === 'function') {
        try {
          await (ctx as any).setSinkId(activeOutputId);
        } catch {
          // Fall back to default audio sink
        }
      }

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const now = ctx.currentTime;
      // High-fidelity pleasant two-tone chime (523.25Hz [C5] -> 659.25Hz [E5])
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.18);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1046.5, now);
      osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.18);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);

      setTimeout(() => {
        ctx.close().catch(() => {});
        setSpeakerTesting(false);
      }, 650);
    } catch (err) {
      console.warn('Speaker test failed:', err);
      setSpeakerTesting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    closeBtnRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
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
        style={{ maxWidth: '440px', maxHeight: '88vh', overflowY: 'auto' }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-box">
            <SlidersHorizontal className="w-5 h-5 text-blue" />
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
            <div className="audio-settings-section-title-left">
              <Volume2 className="w-3.5 h-3.5 text-blue" />
              <span>Audio Output ({outputOptions.length})</span>
            </div>
            <button
              type="button"
              className={`test-btn ${speakerTesting ? 'active' : ''}`}
              onClick={playSpeakerTest}
              aria-label="Test speaker playback"
              title="Play test chime"
            >
              <Volume2 className={`w-3.5 h-3.5 ${speakerTesting ? 'animate-pulse' : ''}`} />
              <span>{speakerTesting ? 'Testing...' : 'Test Speaker'}</span>
            </button>
          </div>

          <div className="audio-settings-options" style={{ maxHeight: '160px', overflowY: 'auto' }}>
            {outputOptions.length > 0 ? (
              outputOptions.map((opt) => {
                const IconComp = opt.icon || Volume2;
                const isActive = activeOutputId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`audio-settings-option ${isActive ? 'selected' : ''}`}
                    onClick={() => onSelectOutput?.(opt.id)}
                    aria-pressed={isActive}
                  >
                    <div className="audio-settings-option-left">
                      <div className="audio-settings-option-icon">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="audio-settings-option-text">
                        <div className="audio-settings-option-name">{opt.label}</div>
                      </div>
                    </div>
                    {isActive && (
                      <div className="audio-settings-check">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="audio-settings-option selected" style={{ cursor: 'default' }}>
                <div className="audio-settings-option-left">
                  <div className="audio-settings-option-icon">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <div className="audio-settings-option-text">
                    <div className="audio-settings-option-name">Default System Speaker Active</div>
                  </div>
                </div>
                <div className="audio-settings-check">
                  <Check className="w-4 h-4" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Microphone Input Section */}
        <div className="audio-settings-section" style={{ marginTop: '14px' }}>
          <div className="audio-settings-section-title">
            <div className="audio-settings-section-title-left">
              <Mic className="w-3.5 h-3.5 text-blue" />
              <span>Microphone Input ({micDevices.length || 1})</span>
            </div>
            <button
              type="button"
              className={`test-btn ${micTesting ? 'active' : ''}`}
              onClick={micTesting ? stopMicTest : startMicTest}
              aria-label="Test microphone level"
              title="Test microphone input"
            >
              {micTesting ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{micTesting ? 'Stop Test' : 'Test Mic'}</span>
            </button>
          </div>

          {/* Real-time Mic Level Visualizer (Active during mic test) */}
          {micTesting && (
            <div style={{ marginBottom: '4px', padding: '8px 12px', background: 'var(--card-2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Input Level</span>
                <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: micLevel > 75 ? 'var(--red)' : 'var(--blue)' }}>{micLevel}%</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${micLevel}%`,
                    height: '100%',
                    background: micLevel > 75 ? 'var(--red)' : micLevel > 40 ? 'var(--green)' : 'var(--blue)',
                    transition: 'width 60ms ease'
                  }}
                />
              </div>
            </div>
          )}

          <div className="audio-settings-options" style={{ maxHeight: '160px', overflowY: 'auto' }}>
            {micDevices.length > 0 ? (
              micDevices.map((device, idx) => {
                const isSelected = activeMicId === device.deviceId;
                return (
                  <button
                    key={device.deviceId || idx}
                    type="button"
                    className={`audio-settings-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectMic?.(device.deviceId)}
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
              <div className="audio-settings-option selected" style={{ cursor: 'default' }}>
                <div className="audio-settings-option-left">
                  <div className="audio-settings-option-icon">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div className="audio-settings-option-text">
                    <div className="audio-settings-option-name">Default System Microphone Active</div>
                  </div>
                </div>
                <div className="audio-settings-check">
                  <Check className="w-4 h-4" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Voice Clarity Mode Section (Option 1: 2-Mode Model) */}
        <div className="audio-settings-section" style={{ marginTop: '14px' }}>
          <div className="audio-settings-section-title">
            <div className="audio-settings-section-title-left">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue" />
              <span>Voice Clarity Mode</span>
            </div>
          </div>

          <div className="audio-settings-options">
            {ACTIVE_MODAL_PROFILES.map((profile) => {
              const isSelected = activeAcousticProfile === profile.id ||
                (profile.id === 'balanced' && activeAcousticProfile !== 'neural-enhanced');
              const IconComp = profile.icon;
              return (
                <button
                  key={profile.id}
                  type="button"
                  className={`audio-settings-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    try {
                      localStorage.setItem(STORAGE_KEYS.ACOUSTIC_PROFILE, profile.id);
                    } catch {}
                    onSelectAcousticProfile?.(profile.id as AcousticProfileId);
                  }}
                  aria-pressed={isSelected}
                >
                  <div className="audio-settings-option-left">
                    <div className="audio-settings-option-icon">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="audio-settings-option-text">
                      <div className="audio-settings-option-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{profile.label}</span>
                        {profile.id === 'neural-enhanced' && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(2, 132, 199, 0.2)', color: '#38bdf8', fontWeight: 700 }}>
                            AI Edge
                          </span>
                        )}
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
            })}
          </div>
        </div>

        {/* Blocked Contacts */}
        <div className="audio-settings-section" style={{ marginTop: '14px' }}>
          <div className="audio-settings-section-title">
            <div className="audio-settings-section-title-left">
              <span>Blocked Contacts ({blockedList.length})</span>
            </div>
          </div>
          <div className="audio-settings-options">
            {blockedList.length === 0 ? (
              <div className="audio-settings-empty">
                <span>No blocked contacts</span>
              </div>
            ) : (
              blockedList.map(id => (
                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-2)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600 }}>{id}</span>
                  <button 
                    type="button"
                    onClick={() => {
                      const newBlocked = blockedList.filter(b => b !== id);
                      localStorage.setItem('securevoice_blocked', JSON.stringify(newBlocked));
                      setBlockedList(newBlocked);
                    }}
                    style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', cursor: 'pointer', color: 'var(--text)' }}
                  >
                    Unblock
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Close Done Button */}
        <div style={{ marginTop: '18px' }}>
          <button
            type="button"
            className="btn btn-blue"
            onClick={onClose}
            style={{ width: '100%', height: '44px', fontSize: '14px', borderRadius: '10px' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default AudioSettingsModal;

/**
 * Call action dock controller for Audio Settings & Routing.
 */
export function CallAudioDeviceSwitcher({ 
  isSpeakerOn, 
  onToggleSpeaker, 
  activeOutputId,
  outputDevices = [],
  micDevices = [], 
  activeMicId, 
  onSwitchMic,
  preferredCodec = 'auto',
  onSelectCodec,
  activeAcousticProfile = 'balanced',
  onSelectAcousticProfile
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
  activeAcousticProfile?: AcousticProfileId;
  onSelectAcousticProfile?: (profile: AcousticProfileId) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const outputOptions = outputDevices.length > 0
    ? outputDevices.map(d => ({
        id: d.deviceId,
        label: d.label || 'Audio Output',
        icon: d.label?.toLowerCase().includes('bluetooth')
          ? Bluetooth
          : d.label?.toLowerCase().includes('head')
          ? Headphones
          : Volume2
      }))
    : [
        { id: 'speaker', label: 'Speaker (Loudspeaker)', icon: Volume2 },
        { id: 'earpiece', label: 'Earpiece (Handset)', icon: Speaker }
      ];

  return (
    <div className="audio-settings-wrapper">
      <button
        type="button"
        className={`dock-btn icon-btn ${modalOpen ? 'active' : ''} ${isSpeakerOn ? 'active-speaker' : ''}`}
        onClick={() => setModalOpen(true)}
        aria-label="Audio Settings & Device Switcher"
        title="Audio Routing & Settings"
      >
        <SlidersHorizontal className="w-6 h-6" />
      </button>

      <AudioSettingsModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        outputOptions={outputOptions}
        activeOutputId={activeOutputId}
        onSelectOutput={onToggleSpeaker}
        micDevices={micDevices}
        activeMicId={activeMicId}
        onSelectMic={onSwitchMic}
        preferredCodec={preferredCodec}
        onSelectCodec={onSelectCodec}
        activeAcousticProfile={activeAcousticProfile}
        onSelectAcousticProfile={onSelectAcousticProfile}
      />
    </div>
  );
}
