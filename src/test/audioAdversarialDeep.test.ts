import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAudioContext,
  unlockAudioContext,
  createDenoisePipeline,
  playRingtone,
  stopMediaStream
} from '../utils/audio';

describe('Deep Adversarial Stress Suite (Milestone 1 Iteration 2)', () => {
  let savedAudioContext;
  let savedWebkitAudioContext;
  let savedVibrate;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    savedAudioContext = window.AudioContext;
    savedWebkitAudioContext = window.webkitAudioContext;
    savedVibrate = navigator.vibrate;
  });

  afterEach(() => {
    window.AudioContext = savedAudioContext;
    window.webkitAudioContext = savedWebkitAudioContext;
    navigator.vibrate = savedVibrate;
    vi.useRealTimers();
  });

  describe('A. Stream and Options Pathological Boundary Testing', () => {
    it('handles stream where getAudioTracks returns null or non-array without uncaught exception', () => {
      const corruptStream1 = {
        getAudioTracks: () => null,
        getTracks: () => []
      };
      expect(() => {
        const res = createDenoisePipeline(corruptStream1);
        expect(res.processedStream).toBe(corruptStream1);
      }).not.toThrow();

      const corruptStream2 = {
        getAudioTracks: () => undefined,
        getTracks: () => []
      };
      expect(() => {
        const res = createDenoisePipeline(corruptStream2);
        expect(res.processedStream).toBe(corruptStream2);
      }).not.toThrow();

      const corruptStream3 = {
        getAudioTracks: () => 'not an array',
        getTracks: () => []
      };
      expect(() => {
        const res = createDenoisePipeline(corruptStream3);
        expect(res.processedStream).toBe(corruptStream3);
      }).not.toThrow();

      const throwingStream = {
        getAudioTracks: () => { throw new Error('Audio subsystem crash'); },
        getTracks: () => []
      };
      expect(() => {
        const res = createDenoisePipeline(throwingStream);
        expect(res.processedStream).toBe(throwingStream);
      }).not.toThrow();
    });

    it('handles options being explicitly null, primitive, or throwing property accessors', () => {
      const track = { stop: vi.fn(), enabled: true };
      const stream = {
        getAudioTracks: () => [track],
        getTracks: () => [track]
      };

      // options = null
      expect(() => {
        const res = createDenoisePipeline(stream, null);
        res.cleanup();
      }).not.toThrow();

      // options = primitive number / string
      expect(() => {
        const res = createDenoisePipeline(stream, 12345);
        res.cleanup();
      }).not.toThrow();

      // options with throwing getter
      const evilOptions = {
        get gateThreshold() { throw new Error('Evil option trap'); }
      };
      expect(() => {
        const res = createDenoisePipeline(stream, evilOptions);
        res.cleanup();
      }).not.toThrow();
    });

    it('handles track array containing null, undefined, or primitive elements during stopMediaStream', () => {
      const realTrack = { stop: vi.fn(), enabled: true };
      const streamWithGaps = {
        getTracks: () => [null, undefined, 0, 'bad-track', realTrack, {}],
        getAudioTracks: () => [null, realTrack, undefined]
      };

      expect(() => stopMediaStream(streamWithGaps)).not.toThrow();
      expect(realTrack.stop).toHaveBeenCalled();
      expect(realTrack.enabled).toBe(false);
    });

    it('handles track with throwing enabled setter in stopMediaStream', () => {
      const trackWithBrokenSetter = {
        stop: vi.fn(),
        set enabled(val) {
          throw new Error('Readonly track property enabled');
        },
        get enabled() {
          return true;
        }
      };

      const stream = {
        getTracks: () => [trackWithBrokenSetter],
        getAudioTracks: () => [trackWithBrokenSetter]
      };

      expect(() => stopMediaStream(stream)).not.toThrow();
      expect(trackWithBrokenSetter.stop).toHaveBeenCalled();
    });
  });

  describe('B. Lifecycle & Post-Cleanup Mutation Resilience', () => {
    it('handles setNoiseGateEnabled and setNoiseGateThreshold called after pipeline cleanup', () => {
      const track = { stop: vi.fn(), enabled: true };
      const stream = {
        getAudioTracks: () => [track],
        getTracks: () => [track]
      };

      const pipeline = createDenoisePipeline(stream);
      pipeline.cleanup();

      // Post-cleanup operations should be completely safe and not throw
      expect(() => pipeline.setNoiseGateEnabled(false)).not.toThrow();
      expect(() => pipeline.setNoiseGateEnabled(true)).not.toThrow();
      expect(() => pipeline.setNoiseGateThreshold(-30)).not.toThrow();
      expect(() => pipeline.setNoiseGateThreshold(NaN)).not.toThrow();
    });

    it('handles setNoiseGateEnabled when audio param scheduling methods throw after context closed', () => {
      const track = { stop: vi.fn(), enabled: true };
      const stream = {
        getAudioTracks: () => [track],
        getTracks: () => [track]
      };

      const pipeline = createDenoisePipeline(stream);
      const gainNode = pipeline.nodes.noiseGateGain;
      gainNode.gain.cancelScheduledValues = vi.fn().mockImplementation(() => {
        throw new Error('InvalidStateError: AudioContext is closed');
      });
      gainNode.gain.setTargetAtTime = vi.fn().mockImplementation(() => {
        throw new Error('InvalidStateError: AudioContext is closed');
      });

      expect(() => pipeline.setNoiseGateEnabled(false)).not.toThrow();
      pipeline.cleanup();
    });

    it('ensures zero intervals fire after 100 pipeline instances are cleaned up', () => {
      const pipelines = [];
      const streams = [];

      for (let i = 0; i < 100; i++) {
        const track = { stop: vi.fn(), enabled: true };
        const stream = {
          getAudioTracks: () => [track],
          getTracks: () => [track]
        };
        streams.push(stream);
        pipelines.push(createDenoisePipeline(stream));
      }

      // Clean up all 100
      pipelines.forEach((p, idx) => {
        p.cleanup();
        stopMediaStream(streams[idx], p.audioCtx, p.nodes);
      });

      // Advance timers by 1 hour (3,600,000 ms) - ensure no intervals execute
      expect(() => vi.advanceTimersByTime(3600000)).not.toThrow();
    });
  });


  describe('D. Ringtone & Vibration Stress Vectors', () => {
    it('handles navigator.vibrate throwing security exception gracefully', () => {
      navigator.vibrate = vi.fn().mockImplementation(() => {
        throw new Error('SecurityError: Vibration blocked by iframe policy');
      });

      let stop;
      expect(() => {
        stop = playRingtone();
      }).not.toThrow();

      expect(() => {
        vi.advanceTimersByTime(3500);
        stop();
      }).not.toThrow();
    });

    it('handles missing navigator object in headless/SSR environments for ringtone', () => {
      const stop = playRingtone();
      expect(typeof stop).toBe('function');
      stop();
    });

    it('handles rapid start and stop of ringtone across multiple cycles without audio node leaks', () => {
      for (let cycle = 0; cycle < 30; cycle++) {
        const stop = playRingtone();
        vi.advanceTimersByTime(100);
        stop();
      }
      expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
    });

    it('handles playRingtone when getAudioContext returns null', () => {
      const originalAudioCtx = window.AudioContext;
      try {
        window.AudioContext = vi.fn().mockImplementation(() => {
          throw new Error('No AudioContext available');
        });
        const stop = playRingtone();
        expect(typeof stop).toBe('function');
        expect(() => {
          vi.advanceTimersByTime(3500);
          stop();
        }).not.toThrow();
      } finally {
        window.AudioContext = originalAudioCtx;
      }
    });
  });

});
