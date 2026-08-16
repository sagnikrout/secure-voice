import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import { getAvailableOutputs } from '../utils/audioRouting';
import './DeviceSelectors.css';

export default function CallAudioDeviceSwitcher({ 
  isSpeakerOn, 
  onToggleSpeaker, 
  micDevices = [], 
  activeMicId, 
  onSwitchMic 
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [availableOutputs, setAvailableOutputs] = useState(['earpiece', 'speaker']);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  // Check for native Bluetooth availability
  useEffect(() => {
    getAvailableOutputs().then(outputs => {
      if (outputs && Array.isArray(outputs)) {
        setAvailableOutputs(outputs);
      }
    });
  }, []);

  // Prepare flat list of actionable items for keyboard nav
  const outputItems = [
    { type: 'output', label: 'Speaker', value: 'speaker', booleanVal: true, icon: 'volume-2' },
    { type: 'output', label: 'Earpiece', value: 'earpiece', booleanVal: false, icon: 'phone' },
    ...(availableOutputs.includes('bluetooth') 
      ? [{ type: 'output', label: 'Bluetooth Headset', value: 'bluetooth', booleanVal: false, icon: 'bluetooth' }] 
      : [])
  ];

  const menuItems = [
    ...outputItems,
    ...micDevices.map(m => ({ type: 'input', label: m.label || 'External Mic', value: m.deviceId, icon: 'mic' }))
  ];

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target) &&
          triggerRef.current && !triggerRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTriggerKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setMenuOpen(!menuOpen);
      setFocusedIndex(0);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setMenuOpen(true);
      setFocusedIndex(0);
    }
  };

  const handleMenuKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev < menuItems.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0) {
          executeMenuItem(menuItems[focusedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setMenuOpen(false);
        triggerRef.current?.focus();
        break;
      default:
        break;
    }
  };

  const executeMenuItem = (item) => {
    if (item.type === 'output') {
      onToggleSpeaker(item.value);
    } else if (item.type === 'input') {
      onSwitchMic(item.value);
    }
    setMenuOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="device-switcher">
      <div aria-live="polite" className="sr-only">
        {`Audio output set to ${isSpeakerOn ? 'Speaker' : 'Earpiece'}`}
      </div>

      <button 
        ref={triggerRef}
        type="button"
        className="device-switcher__trigger"
        onClick={() => { setMenuOpen(!menuOpen); setFocusedIndex(0); }}
        onKeyDown={handleTriggerKeyDown}
        aria-label="Audio Devices and Routing Menu"
        aria-expanded={menuOpen}
        aria-activedescendant={menuOpen && focusedIndex >= 0 ? `menu-opt-${focusedIndex}` : undefined}
        aria-haspopup="menu"
      >
        <div className="device-switcher__icon-container">
          <Icon name={isSpeakerOn ? 'volume-2' : 'phone'} size={24} />
        </div>
        <div className="device-switcher__label">
          {isSpeakerOn ? 'Speaker' : 'Earpiece'}
          <Icon name="chevron-down" size={14} className="device-switcher__chevron" />
        </div>
      </button>

      {menuOpen && (
        <div 
          ref={menuRef} 
          className="device-switcher__menu"
          role="menu"
          tabIndex="-1"
          onKeyDown={handleMenuKeyDown}
        >
          <div className="device-switcher__menu-header" role="presentation">Output Mode</div>
          {outputItems.map((item) => {
            const isActive = (item.value === 'speaker' && isSpeakerOn) || (item.value === 'earpiece' && !isSpeakerOn);
            const actualIndex = menuItems.findIndex(m => m === item);
            return (
              <button
                key={`out-${item.value}`}
                id={`menu-opt-${actualIndex}`}
                role="menuitem"
                className={`device-switcher__menu-item ${isActive ? 'active' : ''} ${focusedIndex === actualIndex ? 'focused' : ''}`}
                onClick={() => executeMenuItem(item)}
                onMouseEnter={() => setFocusedIndex(actualIndex)}
                tabIndex="-1"
              >
                <Icon name={item.icon} size={18} /> {item.label}
              </button>
            );
          })}

          {micDevices.length > 1 && (
            <>
              <div className="device-switcher__menu-divider" role="separator"></div>
              <div className="device-switcher__menu-header" role="presentation">Microphone</div>
              {micDevices.map((device) => {
                const isActive = activeMicId === device.deviceId;
                const actualIndex = menuItems.findIndex(m => m.value === device.deviceId);
                return (
                  <button
                    key={`mic-${device.deviceId}`}
                    id={`menu-opt-${actualIndex}`}
                    role="menuitem"
                    className={`device-switcher__menu-item ${isActive ? 'active' : ''} ${focusedIndex === actualIndex ? 'focused' : ''}`}
                    onClick={() => executeMenuItem({ type: 'input', value: device.deviceId })}
                    onMouseEnter={() => setFocusedIndex(actualIndex)}
                    tabIndex="-1"
                  >
                    <Icon name="mic" size={18} /> 
                    <span className="truncate">{device.label || 'External Mic'}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
