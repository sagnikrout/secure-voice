import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AudioSettingsModal, { CallAudioDeviceSwitcher } from '../components/AudioSettingsModal';

describe('AudioSettingsModal Component', () => {
  const mockOutputs = [
    { id: 'speaker', label: 'Speaker (Loudspeaker)', description: 'Loudspeaker playback' },
    { id: 'earpiece', label: 'Earpiece (Handset)', description: 'Ear receiver' },
    { id: 'headphones-1', label: 'Headphones (Realtek Audio)', description: 'Hardware Audio Output Device' }
  ];

  const mockMics = [
    { deviceId: 'mic-1', label: 'Internal Microphone' },
    { deviceId: 'mic-2', label: 'USB Headset Microphone' }
  ];

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <AudioSettingsModal
        isOpen={false}
        onClose={() => {}}
        outputOptions={mockOutputs}
        activeOutputId="speaker"
        onSelectOutput={() => {}}
        micDevices={mockMics}
        activeMicId="mic-1"
        onSelectMic={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal dialog with outputs and microphones when open', () => {
    render(
      <AudioSettingsModal
        isOpen={true}
        onClose={() => {}}
        outputOptions={mockOutputs}
        activeOutputId="speaker"
        onSelectOutput={() => {}}
        micDevices={mockMics}
        activeMicId="mic-1"
        onSelectMic={() => {}}
      />
    );

    expect(screen.getByText('Audio Settings')).toBeInTheDocument();
    expect(screen.getByText('Speaker (Loudspeaker)')).toBeInTheDocument();
    expect(screen.getByText('Earpiece (Handset)')).toBeInTheDocument();
    expect(screen.getByText('Headphones (Realtek Audio)')).toBeInTheDocument();
    expect(screen.getByText('Internal Microphone')).toBeInTheDocument();
    expect(screen.getByText('USB Headset Microphone')).toBeInTheDocument();
  });

  it('calls onSelectOutput when an output option is clicked', () => {
    const handleSelectOutput = vi.fn();
    render(
      <AudioSettingsModal
        isOpen={true}
        onClose={() => {}}
        outputOptions={mockOutputs}
        activeOutputId="speaker"
        onSelectOutput={handleSelectOutput}
        micDevices={mockMics}
        activeMicId="mic-1"
        onSelectMic={() => {}}
      />
    );

    fireEvent.click(screen.getByText('Headphones (Realtek Audio)'));
    expect(handleSelectOutput).toHaveBeenCalledWith('headphones-1');
  });

  it('calls onSelectMic when a microphone option is clicked', () => {
    const handleSelectMic = vi.fn();
    render(
      <AudioSettingsModal
        isOpen={true}
        onClose={() => {}}
        outputOptions={mockOutputs}
        activeOutputId="speaker"
        onSelectOutput={() => {}}
        micDevices={mockMics}
        activeMicId="mic-1"
        onSelectMic={handleSelectMic}
      />
    );

    fireEvent.click(screen.getByText('USB Headset Microphone'));
    expect(handleSelectMic).toHaveBeenCalledWith('mic-2');
  });

  it('calls onClose when close or done button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <AudioSettingsModal
        isOpen={true}
        onClose={handleClose}
        outputOptions={mockOutputs}
        activeOutputId="speaker"
        onSelectOutput={() => {}}
        micDevices={mockMics}
        activeMicId="mic-1"
        onSelectMic={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Close audio settings'));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Done'));
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it('renders Voice Clarity Mode with Standard and Voice Isolation options and handles selection', () => {
    const handleSelectProfile = vi.fn();
    render(
      <AudioSettingsModal
        isOpen={true}
        onClose={() => {}}
        outputOptions={mockOutputs}
        activeOutputId="speaker"
        micDevices={mockMics}
        activeMicId="mic-1"
        activeAcousticProfile="balanced"
        onSelectAcousticProfile={handleSelectProfile}
      />
    );

    expect(screen.getByText('Voice Clarity Mode')).toBeInTheDocument();
    expect(screen.getByText('Standard (Natural Voice)')).toBeInTheDocument();
    expect(screen.getByText('Voice Isolation (AI Denoise)')).toBeInTheDocument();
    expect(screen.getByText('AI Edge')).toBeInTheDocument();

    // Redundant legacy options should NOT be in the modal
    expect(screen.queryByText('Studio Clean (Quiet Room)')).not.toBeInTheDocument();
    expect(screen.queryByText('Voice Boost (Noisy Environment)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Voice Isolation (AI Denoise)'));
    expect(handleSelectProfile).toHaveBeenCalledWith('neural-enhanced');
  });

  it('renders Test Speaker and Test Mic buttons', () => {
    render(
      <AudioSettingsModal
        isOpen={true}
        onClose={() => {}}
        outputOptions={mockOutputs}
        activeOutputId="speaker"
        micDevices={mockMics}
        activeMicId="mic-1"
      />
    );

    expect(screen.getByRole('button', { name: /test speaker playback/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /test microphone level/i })).toBeInTheDocument();
  });

  describe('CallAudioDeviceSwitcher Component', () => {
    it('renders the trigger button and toggles the settings modal on click', () => {
      const handleToggleSpeaker = vi.fn();
      const handleSwitchMic = vi.fn();

      render(
        <CallAudioDeviceSwitcher
          isSpeakerOn={true}
          onToggleSpeaker={handleToggleSpeaker}
          activeOutputId="speaker"
          outputDevices={[]}
          micDevices={mockMics}
          activeMicId="mic-1"
          onSwitchMic={handleSwitchMic}
        />
      );

      const triggerBtn = screen.getByLabelText('Audio Settings & Device Switcher');
      expect(triggerBtn).toBeInTheDocument();

      // Initially modal is closed
      expect(screen.queryByText('Audio Settings')).not.toBeInTheDocument();

      // Clicking trigger opens the modal
      fireEvent.click(triggerBtn);
      expect(screen.getByText('Audio Settings')).toBeInTheDocument();

      // Clicking an output option delegates to onToggleSpeaker
      fireEvent.click(screen.getByText('Earpiece (Handset)'));
      expect(handleToggleSpeaker).toHaveBeenCalledWith('earpiece');
    });
  });
});
