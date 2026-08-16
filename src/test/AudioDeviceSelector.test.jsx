import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AudioDeviceSelector from '../components/AudioDeviceSelector';

describe('AudioDeviceSelector', () => {
  const mockDevices = [
    { deviceId: 'mic-1', label: 'Internal Mic' },
    { deviceId: 'mic-2', label: 'USB Headset' }
  ];

  it('renders correctly with devices', () => {
    render(<AudioDeviceSelector devices={mockDevices} activeDeviceId="mic-1" onSelect={() => {}} />);
    
    // Check if the trigger button displays the active device
    expect(screen.getByText('Internal Mic')).toBeInTheDocument();
    expect(screen.getByText('Test Mic')).toBeInTheDocument();
  });

  it('shows pending state when permissions are missing', () => {
    render(<AudioDeviceSelector devices={[]} activeDeviceId={null} onSelect={() => {}} isPending={true} />);
    
    expect(screen.getByText('Requesting permissions...')).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: /microphone input/i });
    expect(trigger).toBeDisabled();
  });

  it('opens dropdown on click and calls onSelect when option clicked', () => {
    const handleSelect = vi.fn();
    render(<AudioDeviceSelector devices={mockDevices} activeDeviceId="mic-1" onSelect={handleSelect} />);
    
    const trigger = screen.getByRole('button', { name: /microphone input/i });
    fireEvent.click(trigger);
    
    // Dropdown should be open
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    
    // Click the second option
    fireEvent.click(options[1]);
    expect(handleSelect).toHaveBeenCalledWith('mic-2');
  });

  it('supports keyboard navigation', () => {
    const handleSelect = vi.fn();
    render(<AudioDeviceSelector devices={mockDevices} activeDeviceId="mic-1" onSelect={handleSelect} />);
    
    const trigger = screen.getByRole('button', { name: /microphone input/i });
    
    // Press Space to open
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    
    // Press ArrowDown to focus second item
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    
    // Press Enter to select
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(handleSelect).toHaveBeenCalledWith('mic-2');
  });
});
