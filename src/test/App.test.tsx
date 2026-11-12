import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../App';
import { APP_VERSION } from '../constants/config';

vi.mock('peerjs', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      const listeners: Record<string, Function[]> = {};
      return {
        on: vi.fn((event, cb) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
          if (event === 'open') {
            queueMicrotask(() => cb('MY1-PEE-RID'));
          }
        }),
        call: vi.fn(),
        destroy: vi.fn(),
        _emit: (event: string, ...args: any[]) => {
          listeners[event]?.forEach(cb => cb(...args));
        }
      };
    })
  };
});

describe('App Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders branding and main UI elements', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByText('Secure Voice')).toBeInTheDocument();
    expect(screen.getByText('SV')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(APP_VERSION))).toBeInTheDocument();
    expect(screen.getByText('Your Peer ID')).toBeInTheDocument();
    expect(screen.getByText('New Call')).toBeInTheDocument();
    expect(screen.getByTitle('Network Health')).toBeInTheDocument();
  });

  it('allows entering and sanitizing peer ID in call input', async () => {
    await act(async () => {
      render(<App />);
    });
    const input = screen.getByPlaceholderText("Enter Friend's Peer ID...") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'test-123!' } });
    });
    expect(input.value).toBe('TES-T12-3');
  });

  it('automatically sets theme based on device preferences', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(document.documentElement.getAttribute('data-theme')).toMatch(/dark|light/);
  });

  it('opens and closes audio settings modal', async () => {
    await act(async () => {
      render(<App />);
    });
    const settingsBtn = screen.getByTitle('Audio & Codec Settings');
    await act(async () => {
      fireEvent.click(settingsBtn);
    });
    expect(screen.getByText('Audio Settings')).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Close audio settings');
    await act(async () => {
      fireEvent.click(closeBtn);
    });
    expect(screen.queryByText('Audio Settings')).not.toBeInTheDocument();
  });

  it('displays user-facing notice when dialing with empty or invalid peer ID', async () => {
    await act(async () => {
      render(<App />);
      await new Promise(r => setTimeout(r, 20));
    });

    const callBtn = screen.getByLabelText('Initiate encrypted call');
    await act(async () => {
      fireEvent.click(callBtn);
    });

    expect(screen.getByText('Please enter a Peer ID to call.')).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Enter Friend's Peer ID...") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'AB' } });
      fireEvent.click(callBtn);
    });

    expect(screen.getByText('Invalid Peer ID format. Enter a valid ID (e.g. ABC-DEF-GHI).')).toBeInTheDocument();
  });
});
