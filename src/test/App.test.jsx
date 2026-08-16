import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

vi.mock('peerjs', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      call: vi.fn(),
      destroy: vi.fn()
    }))
  };
});

describe('App Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders branding and main UI elements', () => {
    render(<App />);
    expect(screen.getByText('SecureVoice')).toBeInTheDocument();
    expect(screen.getByText('v2.10')).toBeInTheDocument();
    expect(screen.getByText('Your Peer ID')).toBeInTheDocument();
    expect(screen.getByText('New Call')).toBeInTheDocument();
    expect(screen.getByText('Activity Log')).toBeInTheDocument();
  });

  it('allows entering and sanitizing peer ID in call input', () => {
    render(<App />);
    const input = screen.getByPlaceholderText("Enter Friend's Peer ID...");
    fireEvent.change(input, { target: { value: 'test-123!' } });
    expect(input.value).toBe('TES-T12-3');
  });

  it('toggles theme on dark mode button click', () => {
    render(<App />);
    const themeBtn = screen.getByTitle('Toggle theme');
    fireEvent.click(themeBtn);
    expect(document.documentElement.dataset.theme).toBeDefined();
  });

  it('opens and closes info modal', () => {
    render(<App />);
    const infoBtn = screen.getByTitle('Information');
    fireEvent.click(infoBtn);
    expect(screen.getByText('How SecureVoice Works')).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Close modal');
    fireEvent.click(closeBtn);
    expect(screen.queryByText('How SecureVoice Works')).not.toBeInTheDocument();
  });
});
