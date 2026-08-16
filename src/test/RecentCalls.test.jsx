import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RecentCalls, { saveCallHistory } from '../components/RecentCalls';

describe('RecentCalls Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders nothing when history is empty', () => {
    const { container } = render(<RecentCalls onSelectPeer={vi.fn()} currentPeerId="ME123" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders list of recent calls when saved in localStorage', () => {
    saveCallHistory('FRIEND1');
    saveCallHistory('FRIEND2');

    render(<RecentCalls onSelectPeer={vi.fn()} currentPeerId="ME123" />);
    expect(screen.getByText('Recent Contacts')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Badge count
  });

  it('expands drawer on header click and allows selecting contact', () => {
    saveCallHistory('ALICE9');
    const selectMock = vi.fn();

    render(<RecentCalls onSelectPeer={selectMock} currentPeerId="ME123" />);
    const header = screen.getByRole('button', { name: /recent contacts/i });
    fireEvent.click(header);

    expect(screen.getByText('ALI-CE9')).toBeInTheDocument();

    const callBtn = screen.getByLabelText('Call ALI-CE9');
    fireEvent.click(callBtn);
    expect(selectMock).toHaveBeenCalledWith('ALI-CE9');
  });

  it('filters out current user peer ID from the recents list', () => {
    saveCallHistory('MYSELF');
    saveCallHistory('BOB456');

    render(<RecentCalls onSelectPeer={vi.fn()} currentPeerId="MYS-ELF" />);
    const header = screen.getByRole('button', { name: /recent contacts/i });
    fireEvent.click(header);

    expect(screen.queryByText('MYS-ELF')).not.toBeInTheDocument();
    expect(screen.getByText('BOB-456')).toBeInTheDocument();
  });

  it('allows clearing call history', () => {
    saveCallHistory('CHARLIE');
    render(<RecentCalls onSelectPeer={vi.fn()} currentPeerId="ME123" />);

    fireEvent.click(screen.getByRole('button', { name: /recent contacts/i }));
    const clearBtn = screen.getByRole('button', { name: /clear history/i });
    fireEvent.click(clearBtn);

    expect(screen.queryByText('CHA-RLI-E')).not.toBeInTheDocument();
  });
});
