import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditoryFeedback } from '../utils/auditoryFeedback';

describe('AuditoryFeedback (Call State Audio & Accessibility Synthesizer)', () => {
  let feedback: AuditoryFeedback;

  beforeEach(() => {
    feedback = new AuditoryFeedback({ enabled: true, speechEnabled: false });
  });

  it('contains valid tone configurations for all call lifecycle cues', () => {
    const cues = ['ringing', 'connected', 'disconnected', 'busy', 'reconnecting', 'verified'] as const;

    cues.forEach(cue => {
      const preset = AuditoryFeedback.TONE_PRESETS[cue];
      expect(preset).toBeDefined();
      if (Array.isArray(preset)) {
        preset.forEach(tone => {
          expect(tone.frequency).toBeDefined();
          expect(tone.durationMs).toBeGreaterThan(0);
        });
      } else {
        expect(preset.frequency).toBeDefined();
        expect(preset.durationMs).toBeGreaterThan(0);
      }
    });
  });

  it('allows toggling tone feedback enabled/disabled', async () => {
    feedback.setEnabled(false);
    // Should return immediately without playing tones
    await expect(feedback.notifyConnected()).resolves.toBeUndefined();

    feedback.setEnabled(true);
    await expect(feedback.notifyConnected()).resolves.toBeUndefined();
  });

  it('invokes speech synthesis when speechEnabled is true', () => {
    const mockSpeak = vi.fn();
    const originalSpeechSynthesis = window.speechSynthesis;
    (window as any).speechSynthesis = { speak: mockSpeak };

    feedback.setSpeechEnabled(true);
    feedback.announceVoice('Call connected');

    expect(mockSpeak).toHaveBeenCalled();

    (window as any).speechSynthesis = originalSpeechSynthesis;
  });

  it('plays sequences for polyphonic or multi-tone alerts', async () => {
    vi.useFakeTimers();
    const playToneSpy = vi.spyOn(feedback, 'playTone').mockResolvedValue(undefined);

    await feedback.notifyDisconnected();
    expect(playToneSpy).toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(playToneSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
