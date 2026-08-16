import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAudioOutputMode, isOutputSwitchingSupported, getAudioOutputMode, getAvailableOutputs } from '../utils/audioRouting';
import { Capacitor } from '@capacitor/core';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
    isPluginAvailable: vi.fn(),
    Plugins: {
      AudioRouting: {
        setAudioMode: vi.fn(),
        getAvailableOutputs: vi.fn()
      }
    }
  }
}));

describe('audioRouting Utility', () => {
  const originalHTMLAudioElement = window.HTMLAudioElement;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.HTMLAudioElement = originalHTMLAudioElement;
  });

  it('detects native platform support', () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    Capacitor.getPlatform.mockReturnValue('android');
    
    expect(isOutputSwitchingSupported()).toBe(true);
  });

  it('detects standard web setSinkId support', () => {
    Capacitor.isNativePlatform.mockReturnValue(false);
    
    window.HTMLAudioElement = function() {};
    window.HTMLAudioElement.prototype.setSinkId = vi.fn();
    
    expect(isOutputSwitchingSupported()).toBe(true);
  });

  it('calls native plugin on Android', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    Capacitor.getPlatform.mockReturnValue('android');
    Capacitor.isPluginAvailable.mockReturnValue(true);
    Capacitor.Plugins.AudioRouting.setAudioMode.mockResolvedValue({ success: true, mode: 'speaker' });

    const result = await setAudioOutputMode('speaker');
    
    expect(Capacitor.Plugins.AudioRouting.setAudioMode).toHaveBeenCalledWith({ mode: 'speaker' });
    expect(result.success).toBe(true);
    expect(localStorage.getItem('securevoice_output_mode')).toBe('speaker');
  });

  it('calls setSinkId on web', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false);
    
    const mockAudioElement = {
      setSinkId: vi.fn().mockResolvedValue(undefined)
    };

    const result = await setAudioOutputMode('earpiece', mockAudioElement);
    
    // 'earpiece' maps to 'communications'
    expect(mockAudioElement.setSinkId).toHaveBeenCalledWith('communications');
    expect(result.success).toBe(true);
  });

  it('queries available outputs on native Android', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true);
    Capacitor.getPlatform.mockReturnValue('android');
    Capacitor.isPluginAvailable.mockReturnValue(true);
    Capacitor.Plugins.AudioRouting.getAvailableOutputs.mockResolvedValue({ outputs: ['earpiece', 'speaker', 'bluetooth'] });

    const outputs = await getAvailableOutputs();
    expect(outputs).toContain('bluetooth');
  });

  it('retrieves saved mode', () => {
    localStorage.setItem('securevoice_output_mode', 'speaker');
    expect(getAudioOutputMode()).toBe('speaker');
  });
});
