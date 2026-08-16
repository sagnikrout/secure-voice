import { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/config';

const PREFERRED_INPUT_KEY = STORAGE_KEYS.PREFERRED_INPUT || 'securevoice_preferred_input_id';
const PREFERRED_OUTPUT_KEY = STORAGE_KEYS.PREFERRED_OUTPUT || 'securevoice_output_mode';

/**
 * @typedef {Object} AudioDeviceInfo
 * @property {string} deviceId
 * @property {string} label
 * @property {string} groupId
 */

/**
 * Hook to manage audio devices, enumerating both microphones and audio output devices,
 * and listening for hardware device changes.
 */
export function useAudioDevices() {
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [selectedInputId, setSelectedInputId] = useState(null);
  const [selectedOutputId, setSelectedOutputId] = useState('default');
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
      const outputs = Array.isArray(devices) ? devices.filter(d => d.kind === 'audiooutput') : [];

      // Check if labels are blank, indicating permissions haven't been fully granted
      if (inputs.length > 0 && inputs[0].label === '') {
        setPermissionState('prompt');
      } else if (inputs.length > 0) {
        setPermissionState('granted');
      }

      // Format and sanitize input labels
      const formattedInputs = inputs.map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${index + 1}`,
        groupId: d.groupId
      }));

      // Format and sanitize output labels
      const formattedOutputs = outputs.map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Audio Output ${index + 1}`,
        groupId: d.groupId
      }));

      setAudioInputs(formattedInputs);
      setAudioOutputs(formattedOutputs);

      // Restore preferred microphone from localStorage if available
      const savedInputId = localStorage.getItem(PREFERRED_INPUT_KEY);
      const isSavedInputAvailable = formattedInputs.some(d => d.deviceId === savedInputId);

      if (isSavedInputAvailable) {
        setSelectedInputId(savedInputId);
      } else if (formattedInputs.length > 0) {
        setSelectedInputId(formattedInputs[0].deviceId);
        localStorage.setItem(PREFERRED_INPUT_KEY, formattedInputs[0].deviceId);
      } else {
        setSelectedInputId(null);
      }

      // Restore preferred output from localStorage if available
      const savedOutputId = localStorage.getItem(PREFERRED_OUTPUT_KEY);
      const isSavedOutputAvailable = savedOutputId === 'speaker' || 
                                     savedOutputId === 'earpiece' || 
                                     savedOutputId === 'bluetooth' ||
                                     formattedOutputs.some(d => d.deviceId === savedOutputId);

      if (isSavedOutputAvailable) {
        setSelectedOutputId(savedOutputId);
      } else if (formattedOutputs.length > 0) {
        setSelectedOutputId(formattedOutputs[0].deviceId);
      } else {
        setSelectedOutputId('speaker');
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

  const selectAudioOutput = useCallback((deviceIdOrMode) => {
    setSelectedOutputId(deviceIdOrMode);
    if (deviceIdOrMode) {
      localStorage.setItem(PREFERRED_OUTPUT_KEY, deviceIdOrMode);
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
    audioOutputs,
    selectedInputId,
    selectedOutputId,
    isEnumerating,
    permissionState,
    selectAudioInput,
    selectAudioOutput,
    refreshDevices
  };
}
