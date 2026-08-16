import React, { useState, useRef, useEffect, useCallback } from 'react';
import Icon from './Icon';
import { createMicLoopbackTest } from '../utils/audio';
import './DeviceSelectors.css';

export default function AudioDeviceSelector({ 
  devices = [], 
  activeDeviceId, 
  onSelect, 
  isPending = false 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isTesting, setIsTesting] = useState(false);
  const [testVolume, setTestVolume] = useState(0);
  const [testError, setTestError] = useState(null);

  const listboxRef = useRef(null);
  const triggerRef = useRef(null);
  const stopTestRef = useRef(null);

  const activeDevice = devices.find(d => d.deviceId === activeDeviceId);
  const activeLabel = isPending ? 'Requesting permissions...' : 
                      devices.length === 0 ? 'No microphones found' : 
                      (activeDevice?.label || 'Default Microphone');

  // Stop test helper
  const handleStopTest = useCallback(() => {
    if (stopTestRef.current) {
      stopTestRef.current();
      stopTestRef.current = null;
    }
    setIsTesting(false);
    setTestVolume(0);
  }, []);

  // Toggle hardware loopback test
  const handleToggleTest = async () => {
    if (isTesting) {
      handleStopTest();
      return;
    }

    setTestError(null);
    try {
      setIsTesting(true);
      const stopFn = await createMicLoopbackTest(activeDeviceId, (level) => {
        setTestVolume(level);
      });
      stopTestRef.current = stopFn;
    } catch (err) {
      setTestError('Mic test unavailable');
      setIsTesting(false);
    }
  };

  // Clean up on unmount or device switch
  useEffect(() => {
    return () => {
      handleStopTest();
    };
  }, [handleStopTest, activeDeviceId]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (listboxRef.current && !listboxRef.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (isPending || devices.length === 0) return;

    const activeIndex = devices.findIndex(d => d.deviceId === activeDeviceId);

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen && focusedIndex >= 0) {
          onSelect(devices[focusedIndex].deviceId);
          setIsOpen(false);
          triggerRef.current?.focus();
        } else {
          setIsOpen(true);
          setFocusedIndex(activeIndex >= 0 ? activeIndex : 0);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(activeIndex >= 0 ? Math.min(devices.length - 1, activeIndex + 1) : 0);
        } else {
          setFocusedIndex(prev => (prev < devices.length - 1 ? prev + 1 : prev));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(activeIndex >= 0 ? Math.max(0, activeIndex - 1) : 0);
        } else {
          setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      default:
        break;
    }
  };

  return (
    <div className="device-selector">
      <div className="device-selector__header">
        <label className="device-selector__label" id="mic-select-label">
          Microphone Input
        </label>
        
        {devices.length > 0 && !isPending && (
          <button
            type="button"
            className={`device-selector__test-btn ${isTesting ? 'active' : ''}`}
            onClick={handleToggleTest}
            title={isTesting ? 'Stop loopback test' : 'Test microphone and hear loopback'}
            aria-pressed={isTesting}
          >
            <Icon name={isTesting ? 'volume-x' : 'volume-2'} size={14} />
            <span>{isTesting ? 'Stop Test' : 'Test Mic'}</span>
          </button>
        )}
      </div>
      
      {/* Live region for announcements */}
      <div aria-live="polite" className="sr-only">
        {`Microphone is currently set to ${activeLabel}. ${isTesting ? 'Microphone test running' : ''}`}
      </div>

      <div className="device-selector__wrapper">
        <button
          ref={triggerRef}
          type="button"
          className={`device-selector__trigger ${isPending ? 'device-selector__trigger--pending' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-activedescendant={isOpen && focusedIndex >= 0 ? `device-opt-${focusedIndex}` : undefined}
          aria-labelledby="mic-select-label"
          onClick={() => !isPending && devices.length > 0 && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={isPending || devices.length === 0}
        >
          <div className="device-selector__visual">
            {isPending || devices.length === 0 ? (
              <Icon name="x" className="text-muted" size={20} />
            ) : (
              <Icon name="mic" className="text-success" size={20} />
            )}
            
            <span className="device-selector__text">{activeLabel}</span>
            <Icon name="chevron-down" className="text-muted" size={18} />
          </div>
        </button>

        {isOpen && devices.length > 0 && (
          <ul
            ref={listboxRef}
            className="device-selector__dropdown"
            role="listbox"
            tabIndex="-1"
            aria-labelledby="mic-select-label"
          >
            {devices.map((device, index) => {
              const isSelected = device.deviceId === activeDeviceId;
              return (
                <li
                  key={device.deviceId}
                  id={`device-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`device-selector__option ${focusedIndex === index ? 'focused' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelect(device.deviceId);
                    setIsOpen(false);
                    triggerRef.current?.focus();
                  }}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  {device.label || `Microphone (${device.deviceId.slice(0, 5)})`}
                  {isSelected && <Icon name="check" size={16} className="text-success" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Live VU Meter during loopback test */}
      {isTesting && (
        <div className="device-selector__meter-box" aria-label="Microphone volume test meter">
          <div className="device-selector__meter-label">
            <span>Speak now to test audio level (250ms delayed loopback)</span>
            <span>{Math.round(testVolume * 100)}%</span>
          </div>
          <div className="device-selector__meter-track">
            <div 
              className="device-selector__meter-fill" 
              style={{ width: `${Math.min(100, Math.max(5, testVolume * 100))}%` }}
            />
          </div>
        </div>
      )}

      {testError && (
        <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '2px' }}>
          {testError}
        </div>
      )}
    </div>
  );
}
