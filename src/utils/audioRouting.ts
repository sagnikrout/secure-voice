import { Capacitor } from '@capacitor/core';
import { STORAGE_KEYS } from '../constants/config';

const PREFERRED_OUTPUT_KEY = STORAGE_KEYS.PREFERRED_OUTPUT || 'securevoice_output_mode';

/**
 * Gets reference to the native AudioRouting plugin
 */
function getNativePlugin() {
  if (Capacitor.isPluginAvailable('AudioRouting') && (Capacitor as any).Plugins?.AudioRouting) {
    return (Capacitor as any).Plugins.AudioRouting;
  }
  return null;
}

/**
 * Helper to execute commands against our custom Capacitor AudioRouting plugin
 */
async function invokeNativeAudioRouting(mode: any) {
  const plugin = getNativePlugin();
  if (!plugin) {
    console.warn('AudioRouting native plugin not found');
    return { success: false, mode, error: 'Plugin missing' };
  }
  
  try {
    return await plugin.setAudioMode({ mode });
  } catch (err: any) {
    console.error('Failed to invoke native audio routing', err);
    return { success: false, mode, error: err.message };
  }
}

/**
 * Checks if the current environment supports output switching.
 * @returns {boolean}
 */
export function isOutputSwitchingSupported() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return true;
  }
  
  // Standard web browser check
  return typeof HTMLAudioElement !== 'undefined' && 
         'setSinkId' in HTMLAudioElement.prototype;
}

/**
 * Sets the audio output mode (earpiece vs speaker vs bluetooth or specific hardware output deviceId)
 * across Capacitor Android or standard Web.
 * @param {string} modeOrDeviceId 
 * @param {HTMLAudioElement} [audioElement]
 * @returns {Promise<{ success: boolean, mode: string, error?: string }>}
 */
export async function setAudioOutputMode(modeOrDeviceId: any, audioElement: any) {
  try {
    localStorage.setItem(PREFERRED_OUTPUT_KEY, modeOrDeviceId);

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      const nativeMode = (modeOrDeviceId === 'earpiece' || modeOrDeviceId === 'bluetooth') ? modeOrDeviceId : 'speaker';
      return await invokeNativeAudioRouting(nativeMode);
    }

    if (audioElement && typeof audioElement.setSinkId === 'function') {
      let sinkId = modeOrDeviceId;
      if (modeOrDeviceId === 'earpiece') {
        sinkId = 'communications';
      } else if (modeOrDeviceId === 'speaker') {
        sinkId = 'default';
      }

      try {
        await audioElement.setSinkId(sinkId);
        return { success: true, mode: modeOrDeviceId };
      } catch (err: any) {
        if (sinkId !== 'default') {
          await audioElement.setSinkId('default').catch(() => {});
        }
        return { success: true, mode: 'default' };
      }
    }

    return { success: true, mode: modeOrDeviceId };
  } catch (err: any) {
    console.error('Error setting audio output mode:', err);
    return { success: false, mode: modeOrDeviceId, error: err.message };
  }
}

/**
 * Query available native audio outputs (earpiece, speaker, bluetooth)
 * @returns {Promise<string[]>}
 */
export async function getAvailableOutputs() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const plugin = getNativePlugin();
    if (plugin && plugin.getAvailableOutputs) {
      try {
        const res = await plugin.getAvailableOutputs();
        return res.outputs || ['earpiece', 'speaker'];
      } catch (e) {}
    }
  }
  return ['earpiece', 'speaker'];
}

/**
 * Request audio focus when a call begins
 */
export async function requestAudioFocus() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const plugin = getNativePlugin();
    if (plugin && plugin.requestAudioFocus) {
      try {
        return await plugin.requestAudioFocus();
      } catch (e) {}
    }
  }
  return { granted: true };
}

/**
 * Abandon audio focus when a call ends
 */
export async function abandonAudioFocus() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const plugin = getNativePlugin();
    if (plugin && plugin.abandonAudioFocus) {
      try {
        return await plugin.abandonAudioFocus();
      } catch (e) {}
    }
  }
  return { success: true };
}

/**
 * Listen for native audio focus events (e.g. cellular phone call interruptions)
 */
export function addAudioFocusListener(callback: any) {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const plugin = getNativePlugin();
    if (plugin && plugin.addListener) {
      return plugin.addListener('audioFocusChange', callback);
    }
  }
  return { remove: () => {} };
}

/**
 * Listen for native audio device connection changes (e.g. bluetooth headset or wired headphones)
 */
export function addAudioDevicesListener(callback: (data: { outputs: string[] }) => void) {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const plugin = getNativePlugin();
    if (plugin && plugin.addListener) {
      return plugin.addListener('audioDevicesChanged', callback);
    }
  }
  return { remove: () => {} };
}

/**
 * Retrieves the currently saved audio output mode.
 * @returns {'earpiece' | 'speaker' | 'bluetooth' | 'default'}
 */
export function getAudioOutputMode() {
  const saved = localStorage.getItem(PREFERRED_OUTPUT_KEY);
  return (saved === 'speaker' || saved === 'earpiece' || saved === 'bluetooth') ? saved : 'default';
}
