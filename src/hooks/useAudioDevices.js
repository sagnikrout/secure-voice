import { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/config';

const PREFERRED_INPUT_KEY = STORAGE_KEYS.PREFERRED_INPUT || 'securevoice_preferred_input_id';

/**
 * @typedef {Object} AudioDeviceInfo
 * @property {string} deviceId
 * @property {string} label
 * @property {string} groupId
 */

/**
 * Hook to manage audio devices, enumerating microphones and listening for device changes.
 */
export function useAudioDevices() {
  const [audioInputs, setAudioInputs] = useState([]);
  const [selectedInputId, setSelectedInputId] = useState(null);
  const [isEnumerating, setIsEnumerating] = useState(true);
  const [permissionState, setPermissionState] = useState('prompt');
  
  const enumeratingRef = useRef(false);
  const debounceRef = useRef(null);

  const refreshDevices = useCallback(async () => {
    if (enumeratingRef.current) return;
    enumeratingRef.current = true;
    setIsEnumerating(true);

    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        throw new Error('enumerateDevices is not supported');
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = Array.isArray(devices) ? devices.filter(d => d.kind === 'audioinput') : [];

      // Check if labels are blank, indicating permissions haven't been fully granted
      if (inputs.length > 0 && inputs[0].label === '') {
        setPermissionState('prompt');
      } else if (inputs.length > 0) {
        setPermissionState('granted');
      }

      // Format and sanitize labels
      const formattedInputs = inputs.map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${index + 1}`,
        groupId: d.groupId
      }));

      setAudioInputs(formattedInputs);

      // Restore preferred device from localStorage if it exists
      const savedId = localStorage.getItem(PREFERRED_INPUT_KEY);
      const isSavedAvailable = formattedInputs.some(d => d.deviceId === savedId);

      if (isSavedAvailable) {
        setSelectedInputId(savedId);
      } else if (formattedInputs.length > 0) {
        // Fallback to default
        setSelectedInputId(formattedInputs[0].deviceId);
        localStorage.setItem(PREFERRED_INPUT_KEY, formattedInputs[0].deviceId);
      } else {
        setSelectedInputId(null);
      }
    } catch (err) {
      console.warn('Failed to enumerate audio devices', err);
      setPermissionState('denied');
    } finally {
      setIsEnumerating(false);
      enumeratingRef.current = false;
    }
  }, []);

  const selectAudioInput = useCallback((deviceId) => {
    setSelectedInputId(deviceId);
    if (deviceId) {
      localStorage.setItem(PREFERRED_INPUT_KEY, deviceId);
    } else {
      localStorage.removeItem(PREFERRED_INPUT_KEY);
    }
  }, []);

  useEffect(() => {
    refreshDevices();

    const handleDeviceChange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        refreshDevices();
      }, 300);
    };

    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (navigator.mediaDevices && typeof navigator.mediaDevices.removeEventListener === 'function') {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [refreshDevices]);

  return {
    audioInputs,
    selectedInputId,
    isEnumerating,
    permissionState,
    selectAudioInput,
    refreshDevices
  };
}
