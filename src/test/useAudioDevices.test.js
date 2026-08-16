import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioDevices } from '../hooks/useAudioDevices';

describe('useAudioDevices Hook', () => {
  const originalMediaDevices = navigator.mediaDevices;
  
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        enumerateDevices: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices
    });
    vi.clearAllMocks();
  });

  it('enumerates devices and sets default if no localStorage exists', async () => {
    const mockDevices = [
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Internal Mic', groupId: 'g1' },
      { kind: 'audioinput', deviceId: 'mic-2', label: 'USB Mic', groupId: 'g2' },
      { kind: 'videoinput', deviceId: 'vid-1', label: 'Camera', groupId: 'g3' }
    ];
    navigator.mediaDevices.enumerateDevices.mockResolvedValue(mockDevices);

    const { result } = renderHook(() => useAudioDevices());
    
    // Wait for the async refreshDevices to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.audioInputs).toHaveLength(2);
    expect(result.current.selectedInputId).toBe('mic-1');
    expect(localStorage.getItem('securevoice_preferred_input_id')).toBe('mic-1');
    expect(result.current.permissionState).toBe('granted');
  });

  it('restores preferred device from localStorage', async () => {
    localStorage.setItem('securevoice_preferred_input_id', 'mic-2');
    
    const mockDevices = [
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Internal Mic', groupId: 'g1' },
      { kind: 'audioinput', deviceId: 'mic-2', label: 'USB Mic', groupId: 'g2' }
    ];
    navigator.mediaDevices.enumerateDevices.mockResolvedValue(mockDevices);

    const { result } = renderHook(() => useAudioDevices());
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.selectedInputId).toBe('mic-2');
  });

  it('falls back to default if preferred device is unplugged', async () => {
    localStorage.setItem('securevoice_preferred_input_id', 'mic-unplugged');
    
    const mockDevices = [
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Internal Mic', groupId: 'g1' }
    ];
    navigator.mediaDevices.enumerateDevices.mockResolvedValue(mockDevices);

    const { result } = renderHook(() => useAudioDevices());
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Should fall back to the first available device
    expect(result.current.selectedInputId).toBe('mic-1');
    expect(localStorage.getItem('securevoice_preferred_input_id')).toBe('mic-1');
  });

  it('sets permission state to prompt if labels are blank', async () => {
    const mockDevices = [
      { kind: 'audioinput', deviceId: 'mic-1', label: '', groupId: 'g1' }
    ];
    navigator.mediaDevices.enumerateDevices.mockResolvedValue(mockDevices);

    const { result } = renderHook(() => useAudioDevices());
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.permissionState).toBe('prompt');
    // It should generate a default label
    expect(result.current.audioInputs[0].label).toBe('Microphone 1');
  });
});
