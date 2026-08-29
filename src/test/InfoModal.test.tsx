import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InfoModal from '../components/InfoModal';

describe('InfoModal Component', () => {
  it('renders technical details correctly', () => {
    render(<InfoModal onClose={vi.fn()} />);
    expect(screen.getByText('How SecureVoice Works')).toBeInTheDocument();
    expect(screen.getByText('DTLS-SRTP (WebRTC E2EE)')).toBeInTheDocument();
    expect(screen.getByText('Google Lyra v2 (3.2 kbps) · Opus HD')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const closeMock = vi.fn();
    render(<InfoModal onClose={closeMock} />);

    const closeBtn = screen.getByLabelText('Close modal');
    fireEvent.click(closeBtn);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const closeMock = vi.fn();
    render(<InfoModal onClose={closeMock} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
