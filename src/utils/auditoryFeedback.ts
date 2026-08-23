/**
 * Auditory Call State Feedback & Accessibility Synthesizer
 *
 * Provides synthesized Web Audio oscillator tones and optional speech synthesis
 * for visual accessibility (blind and low-vision users), confirming call lifecycle
 * transitions (ringing, connected, disconnected, busy, reconnecting, verified).
 */

import { AuditoryToneConfig, CallAudioCue } from '../types';
import { getAudioContext, unlockAudioContext } from './audio';

export class AuditoryFeedback {
  private enabled: boolean;
  private speechEnabled: boolean;

  // Preset frequencies and timing per call state cue
  static TONE_PRESETS: Record<CallAudioCue, AuditoryToneConfig | AuditoryToneConfig[]> = {
    ringing: [
      { frequency: [440, 480], durationMs: 1200, type: 'sine', gain: 0.12 }
    ],
    connected: {
      frequency: 880,
      durationMs: 150,
      type: 'sine',
      gain: 0.15
    },
    disconnected: [
      { frequency: 440, durationMs: 150, type: 'sine', gain: 0.12 },
      { frequency: 220, durationMs: 300, type: 'sine', gain: 0.12 }
    ],
    busy: [
      { frequency: 300, durationMs: 120, type: 'sine', gain: 0.14 },
      { frequency: 300, durationMs: 120, type: 'sine', gain: 0.14 }
    ],
    reconnecting: {
      frequency: 520,
      durationMs: 80,
      type: 'triangle',
      gain: 0.10
    },
    verified: [
      { frequency: 587.33, durationMs: 120, type: 'sine', gain: 0.12 }, // D5
      { frequency: 880.00, durationMs: 250, type: 'sine', gain: 0.12 }  // A5
    ]
  };

  constructor(options: { enabled?: boolean; speechEnabled?: boolean } = {}) {
    this.enabled = options.enabled ?? true;
    this.speechEnabled = options.speechEnabled ?? false;
  }

  /**
   * Enable or disable audio tones
   */
  setEnabled(enabled: boolean): void {
    this.enabled = Boolean(enabled);
  }

  /**
   * Enable or disable speech announcements
   */
  setSpeechEnabled(speechEnabled: boolean): void {
    this.speechEnabled = Boolean(speechEnabled);
  }

  /**
   * Synthesize a single tone or polyphonic chord using Web Audio API
   */
  async playTone(config: AuditoryToneConfig): Promise<void> {
    if (!this.enabled || typeof window === 'undefined') return;

    try {
      const audioCtx = await unlockAudioContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      const durationSec = config.durationMs / 1000;
      const gainNode = audioCtx.createGain();
      const gainVal = config.gain ?? 0.12;

      gainNode.gain.setValueAtTime(gainVal, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
      gainNode.connect(audioCtx.destination);

      const frequencies = Array.isArray(config.frequency) ? config.frequency : [config.frequency];
      const oscillators: OscillatorNode[] = [];

      frequencies.forEach(freq => {
        const osc = audioCtx.createOscillator();
        osc.type = config.type || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + durationSec);
        oscillators.push(osc);
      });

      // Cleanup
      setTimeout(() => {
        oscillators.forEach(osc => {
          try { osc.disconnect(); } catch (e) {}
        });
        try { gainNode.disconnect(); } catch (e) {}
      }, config.durationMs + 100);
    } catch (e) {
      // AudioContext unavailable or autoplay blocked
    }
  }

  /**
   * Play a sequence of tones with optional intervals
   */
  async playToneSequence(tones: AuditoryToneConfig[]): Promise<void> {
    if (!this.enabled || !Array.isArray(tones) || tones.length === 0) return;

    let offsetMs = 0;
    for (const tone of tones) {
      if (offsetMs === 0) {
        this.playTone(tone);
      } else {
        setTimeout(() => {
          this.playTone(tone);
        }, offsetMs);
      }
      offsetMs += tone.durationMs + (tone.intervalMs || 50);
    }
  }

  /**
   * Announce call state by name
   */
  async notifyState(cue: CallAudioCue): Promise<void> {
    const preset = AuditoryFeedback.TONE_PRESETS[cue];
    if (!preset) return;

    if (Array.isArray(preset)) {
      await this.playToneSequence(preset);
    } else {
      await this.playTone(preset);
    }

    if (this.speechEnabled) {
      this.announceVoice(`Call ${cue}`);
    }
  }

  /**
   * Accessibility speech synthesis voice announcement
   */
  announceVoice(message: string): void {
    if (typeof window === 'undefined' || !message) return;
    const synth = (window as any).speechSynthesis;
    if (!synth || typeof synth.speak !== 'function') return;

    try {
      const UtteranceClass = (window as any).SpeechSynthesisUtterance || (globalThis as any).SpeechSynthesisUtterance;
      const utterance = UtteranceClass ? new UtteranceClass(message) : { text: message };
      if (utterance) {
        utterance.rate = 1.1;
        utterance.pitch = 1.0;
      }
      synth.speak(utterance);
    } catch (e) {}
  }

  notifyRinging(): Promise<void> { return this.notifyState('ringing'); }
  notifyConnected(): Promise<void> { return this.notifyState('connected'); }
  notifyDisconnected(): Promise<void> { return this.notifyState('disconnected'); }
  notifyBusy(): Promise<void> { return this.notifyState('busy'); }
  notifyReconnecting(): Promise<void> { return this.notifyState('reconnecting'); }
  notifyVerified(): Promise<void> { return this.notifyState('verified'); }
}

export const auditoryFeedback = new AuditoryFeedback();
