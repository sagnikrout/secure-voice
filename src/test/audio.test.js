import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAudioContext,
  unlockAudioContext,
  createDenoisePipeline,
  playRingtone,
  createMicLoopbackTest,
  setAudioOutputDevice,
  stopMediaStream
} from '../utils/audio';

describe('Audio Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getAudioContext & unlockAudioContext', () => {
    it('returns an AudioContext instance in browser environment', () => {
      const ctx = getAudioContext();
      expect(ctx).toBeDefined();
      expect(ctx.state).toBe('running');
    });

    it('resumes suspended audio context on unlock', async () => {
      const ctx = getAudioContext();
      ctx.state = 'suspended';
      const spy = vi.spyOn(ctx, 'resume');
      await unlockAudioContext();
      expect(spy).toHaveBeenCalled();
    });

    it('recreates AudioContext if previous global context is closed', () => {
      const ctx1 = getAudioContext();
      ctx1.state = 'closed';
      const ctx2 = getAudioContext();
      expect(ctx2).toBeDefined();
      expect(ctx2.state).toBe('running');
    });

    it('handles resume rejection gracefully without throwing unhandled exceptions', async () => {
      const ctx = getAudioContext();
      ctx.state = 'suspended';
      vi.spyOn(ctx, 'resume').mockRejectedValueOnce(new Error('Autoplay blocked'));
      const result = await unlockAudioContext();
      expect(result).toBe(ctx);
    });

    it('returns null and does not throw when AudioContext constructor throws', () => {
      const originalAudioCtx = window.AudioContext;
      const ctx = getAudioContext();
      if (ctx) ctx.state = 'closed';

      try {
        window.AudioContext = vi.fn().mockImplementation(() => {
          throw new Error('QuotaExceededError: Cannot create more AudioContexts');
        });
        const result = getAudioContext();
        expect(result).toBe(null);
      } finally {
        window.AudioContext = originalAudioCtx;
      }
    });
  });

  describe('createDenoisePipeline - 6-Stage Graph Topology & Node Parameters', () => {
    it('instantiates all 6 stages with exact node types and parameters', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream);
      expect(result.processedStream).toBeDefined();
      expect(result.audioCtx).toBeDefined();
      expect(result.nodes).toBeDefined();

      const { highPass, presenceEQ, hissCut, noiseGateGain, analyser, compressor, makeupGain, dest, source } = result.nodes;

      // Stage 1: Highpass 80Hz 2nd-order Butterworth (Q=0.7071)
      expect(highPass.type).toBe('highpass');
      expect(highPass.frequency.setValueAtTime).toHaveBeenCalledWith(80, expect.any(Number));
      expect(highPass.Q.setValueAtTime).toHaveBeenCalledWith(0.7071, expect.any(Number));

      // Stage 2: Peaking EQ 2.8kHz (+3.0dB, Q=1.2)
      expect(presenceEQ.type).toBe('peaking');
      expect(presenceEQ.frequency.setValueAtTime).toHaveBeenCalledWith(2800, expect.any(Number));
      expect(presenceEQ.gain.setValueAtTime).toHaveBeenCalledWith(3.0, expect.any(Number));
      expect(presenceEQ.Q.setValueAtTime).toHaveBeenCalledWith(1.2, expect.any(Number));

      // Stage 3: Lowpass 4.2kHz (Q=0.7071)
      expect(hissCut.type).toBe('lowpass');
      expect(hissCut.frequency.setValueAtTime).toHaveBeenCalledWith(4200, expect.any(Number));
      expect(hissCut.Q.setValueAtTime).toHaveBeenCalledWith(0.7071, expect.any(Number));

      // Stage 4: Noise Gate GainNode & AnalyserNode
      expect(noiseGateGain.gain.setValueAtTime).toHaveBeenCalledWith(1.0, expect.any(Number));
      expect(analyser.fftSize).toBe(256);
      expect(analyser.smoothingTimeConstant).toBe(0.0);

      // Backwards-compatible alias
      expect(result.nodes.gateAnalyser).toBe(analyser);

      // Stage 5: Dynamics Compressor (-18dB, 12dB knee, 4:1 ratio, 3ms attack, 150ms release)
      expect(compressor.threshold.setValueAtTime).toHaveBeenCalledWith(-18, expect.any(Number));
      expect(compressor.knee.setValueAtTime).toHaveBeenCalledWith(12, expect.any(Number));
      expect(compressor.ratio.setValueAtTime).toHaveBeenCalledWith(4, expect.any(Number));
      expect(compressor.attack.setValueAtTime).toHaveBeenCalledWith(0.003, expect.any(Number));
      expect(compressor.release.setValueAtTime).toHaveBeenCalledWith(0.150, expect.any(Number));

      // Stage 6: Makeup Gain (1.2x)
      expect(makeupGain.gain.setValueAtTime).toHaveBeenCalledWith(1.2, expect.any(Number));

      // Destination
      expect(dest.stream).toBe(result.processedStream);

      // Clean up test instance
      result.cleanup();
    });

    it('connects all nodes in the proper 6-stage sequential chain with sidechain analyser tap', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream);
      const { source, highPass, presenceEQ, hissCut, noiseGateGain, analyser, compressor, makeupGain, dest } = result.nodes;

      expect(source.connect).toHaveBeenCalledWith(highPass);
      expect(highPass.connect).toHaveBeenCalledWith(presenceEQ);
      expect(presenceEQ.connect).toHaveBeenCalledWith(hissCut);
      expect(hissCut.connect).toHaveBeenCalledWith(noiseGateGain);
      expect(hissCut.connect).toHaveBeenCalledWith(analyser); // Sidechain tap
      expect(noiseGateGain.connect).toHaveBeenCalledWith(compressor);
      expect(compressor.connect).toHaveBeenCalledWith(makeupGain);
      expect(makeupGain.connect).toHaveBeenCalledWith(dest);

      result.cleanup();
    });
  });

  describe('createDenoisePipeline - Noise Gate Controls & Behavior', () => {
    it('accepts custom initialization options (threshold, floor, enabled)', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream, {
        gateThreshold: -40,
        gateFloor: 0.05,
        gateEnabled: false,
      });

      expect(result.processedStream).toBeDefined();
      expect(result.nodes.noiseGateGain).toBeDefined();

      result.cleanup();
    });

    it('accepts alias options (noiseGateThreshold, noiseGateEnabled)', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream, {
        noiseGateThreshold: -42,
        noiseGateEnabled: true,
      });

      expect(result.processedStream).toBeDefined();
      result.cleanup();
    });

    it('dynamically disables and re-enables noise gate via setNoiseGateEnabled', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream);
      const gainNode = result.nodes.noiseGateGain;

      // Disabling forces gain to 1.0 (bypass)
      result.setNoiseGateEnabled(false);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.01);

      // Re-enabling allows gate state machine to operate
      result.setNoiseGateEnabled(true);
      expect(typeof result.setNoiseGateEnabled).toBe('function');

      result.cleanup();
    });

    it('dynamically updates threshold via setNoiseGateThreshold', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream);
      result.setNoiseGateThreshold(-38);
      // Verify safe handling of non-numeric values
      result.setNoiseGateThreshold(NaN);
      result.setNoiseGateThreshold('invalid');
      result.setNoiseGateThreshold(null);

      result.cleanup();
    });

    it('evaluates noise gate audio buffer and schedules gain transitions during timer ticks', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream, { gateThreshold: -46, gateFloor: 0.02 });
      const gainNode = result.nodes.noiseGateGain;
      const analyser = result.nodes.analyser;

      // Simulate float time domain speech data (high RMS)
      analyser.getFloatTimeDomainData.mockImplementation(arr => {
        arr.fill(0.5); // RMS = 0.5, db ~ -6 dBFS >= -46
      });

      vi.advanceTimersByTime(20);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.010);

      // Simulate silence (low RMS)
      analyser.getFloatTimeDomainData.mockImplementation(arr => {
        arr.fill(0.00001); // RMS ~ 0, db ~ -100 dBFS < -46
      });

      // Advance past hold time (80ms)
      vi.advanceTimersByTime(120);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.any(Number), 0.150);

      result.cleanup();
    });

    it('sanitizes NaN gateThreshold and gateFloor options to valid defaults', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream, { gateThreshold: NaN, gateFloor: NaN });
      const gainNode = result.nodes.noiseGateGain;
      const analyser = result.nodes.analyser;

      analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0));
      vi.advanceTimersByTime(200);

      const calls = gainNode.gain.setTargetAtTime.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const floorPassed = calls[calls.length - 1][0];
      expect(Number.isNaN(floorPassed)).toBe(false);
      expect(Number.isFinite(floorPassed)).toBe(true);

      result.cleanup();
    });

    it('silently handles analyser exceptions during interval ticks without crashing', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream);
      result.nodes.analyser.getFloatTimeDomainData.mockImplementation(() => {
        throw new Error('Hardware disconnected during tick');
      });

      expect(() => vi.advanceTimersByTime(50)).not.toThrow();
      result.cleanup();
    });
  });

  describe('createDenoisePipeline - Teardown & Lifecycle', () => {
    it('cleanup() stops evaluation timer and disconnects all 8 nodes', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream);
      const { source, highPass, presenceEQ, hissCut, noiseGateGain, analyser, compressor, makeupGain } = result.nodes;
      const ctx = result.audioCtx;

      result.cleanup();

      expect(source.disconnect).toHaveBeenCalled();
      expect(highPass.disconnect).toHaveBeenCalled();
      expect(presenceEQ.disconnect).toHaveBeenCalled();
      expect(hissCut.disconnect).toHaveBeenCalled();
      expect(noiseGateGain.disconnect).toHaveBeenCalled();
      expect(analyser.disconnect).toHaveBeenCalled();
      expect(compressor.disconnect).toHaveBeenCalled();
      expect(makeupGain.disconnect).toHaveBeenCalled();
      expect(ctx.state).toBe('closed');
    });

    it('cleanup() is idempotent and safe to call repeatedly', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream);
      expect(() => {
        result.cleanup();
        result.cleanup();
      }).not.toThrow();
    });
  });

  describe('createDenoisePipeline - Fallback & Edge Cases', () => {
    it('falls back to raw stream if stream is null or undefined', () => {
      const resNull = createDenoisePipeline(null);
      expect(resNull.processedStream).toBe(null);
      expect(resNull.audioCtx).toBe(null);
      expect(resNull.nodes).toBe(null);
      expect(typeof resNull.cleanup).toBe('function');
      expect(typeof resNull.setNoiseGateEnabled).toBe('function');
      expect(typeof resNull.setNoiseGateThreshold).toBe('function');

      const resUndef = createDenoisePipeline(undefined);
      expect(resUndef.processedStream).toBe(undefined);
      expect(resUndef.audioCtx).toBe(null);
    });

    it('falls back if stream has empty audio tracks', () => {
      const emptyTrackStream = {
        getAudioTracks: () => [],
        getTracks: () => [],
      };

      const result = createDenoisePipeline(emptyTrackStream);
      expect(result.processedStream).toBe(emptyTrackStream);
      expect(result.audioCtx).toBe(null);
      expect(result.nodes).toBe(null);
    });

    it('falls back if stream lacks getAudioTracks method', () => {
      const invalidStream = { id: 'invalid-stream' };
      const result = createDenoisePipeline(invalidStream);
      expect(result.processedStream).toBe(invalidStream);
      expect(result.audioCtx).toBe(null);
    });

    it('falls back when AudioContext is unavailable', () => {
      const originalAudioCtx = window.AudioContext;
      const originalWebkitAudioCtx = window.webkitAudioContext;
      window.AudioContext = undefined;
      window.webkitAudioContext = undefined;

      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream);
      expect(result.processedStream).toBe(mockStream);
      expect(result.audioCtx).toBe(null);

      window.AudioContext = originalAudioCtx;
      window.webkitAudioContext = originalWebkitAudioCtx;
    });

    it('catches AudioContext constructor error and returns fallback result', () => {
      const originalAudioCtx = window.AudioContext;
      window.AudioContext = vi.fn().mockImplementation(() => {
        throw new Error('Hardware audio device busy');
      });

      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream);
      expect(result.processedStream).toBe(mockStream);
      expect(result.audioCtx).toBe(null);

      window.AudioContext = originalAudioCtx;
    });
  });

  describe('stopMediaStream', () => {
    it('stops all tracks and sets enabled to false', () => {
      const track1 = { stop: vi.fn(), enabled: true };
      const track2 = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getTracks: () => [track1, track2],
        getAudioTracks: () => [track1],
      };

      stopMediaStream(mockStream);
      expect(track1.stop).toHaveBeenCalled();
      expect(track1.enabled).toBe(false);
      expect(track2.stop).toHaveBeenCalled();
      expect(track2.enabled).toBe(false);
    });

    it('disconnects all nodes in nodes dictionary and calls cleanup if available', () => {
      const node1 = { disconnect: vi.fn() };
      const node2 = { disconnect: vi.fn() };
      const nodesObj = {
        n1: node1,
        n2: node2,
        cleanup: vi.fn(),
      };

      stopMediaStream(null, null, nodesObj);
      expect(nodesObj.cleanup).toHaveBeenCalled();
      expect(node1.disconnect).toHaveBeenCalled();
      expect(node2.disconnect).toHaveBeenCalled();
    });

    it('disconnects all nodes if passed as an array', () => {
      const node1 = { disconnect: vi.fn() };
      const node2 = { disconnect: vi.fn() };

      stopMediaStream(null, null, [node1, node2]);
      expect(node1.disconnect).toHaveBeenCalled();
      expect(node2.disconnect).toHaveBeenCalled();
    });

    it('closes AudioContext if open context is passed', () => {
      const mockCtx = {
        state: 'running',
        close: vi.fn().mockResolvedValue(undefined),
      };

      stopMediaStream(null, mockCtx);
      expect(mockCtx.close).toHaveBeenCalled();
    });

    it('does not call close if AudioContext is already closed', () => {
      const mockCtx = {
        state: 'closed',
        close: vi.fn(),
      };

      stopMediaStream(null, mockCtx);
      expect(mockCtx.close).not.toHaveBeenCalled();
    });

    it('handles null / undefined / empty arguments safely without throwing', () => {
      expect(() => stopMediaStream(null)).not.toThrow();
      expect(() => stopMediaStream(undefined)).not.toThrow();
      expect(() => stopMediaStream(null, null, null)).not.toThrow();
      expect(() => stopMediaStream({}, {}, {})).not.toThrow();
    });

    it('safely stops and disables remaining tracks if one track stop throws', () => {
      const track1 = {
        stop: vi.fn().mockImplementation(() => {
          throw new Error('Hardware error');
        }),
        enabled: true,
      };
      const track2 = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getTracks: () => [track1, track2],
        getAudioTracks: () => [track1, track2],
      };

      expect(() => stopMediaStream(mockStream)).not.toThrow();
      expect(track1.enabled).toBe(false);
      expect(track2.stop).toHaveBeenCalled();
      expect(track2.enabled).toBe(false);
    });

    it('continues disconnecting nodes if nodes.cleanup throws', () => {
      const node1 = { disconnect: vi.fn() };
      const node2 = { disconnect: vi.fn() };
      const nodesObj = {
        n1: node1,
        n2: node2,
        cleanup: vi.fn().mockImplementation(() => {
          throw new Error('Cleanup failure');
        }),
      };

      expect(() => stopMediaStream(null, null, nodesObj)).not.toThrow();
      expect(node1.disconnect).toHaveBeenCalled();
      expect(node2.disconnect).toHaveBeenCalled();
    });
  });

  describe('createMicLoopbackTest, playRingtone & setAudioOutputDevice', () => {
    it('createMicLoopbackTest sets up 250ms delay, gain, analyser and triggers onLevel', async () => {
      const onLevel = vi.fn();
      const stop = await createMicLoopbackTest('default-mic', onLevel);

      expect(typeof stop).toBe('function');
      vi.advanceTimersByTime(60);
      expect(onLevel).toHaveBeenCalled();

      stop();
    });

    it('createMicLoopbackTest tolerates exceptions in onLevel callback without throwing unhandled exceptions', async () => {
      const throwingOnLevel = vi.fn().mockImplementation(() => {
        throw new Error('UI render error');
      });
      const stop = await createMicLoopbackTest('default-mic', throwingOnLevel);

      expect(() => vi.advanceTimersByTime(60)).not.toThrow();
      stop();
    });

    it('createMicLoopbackTest catches getUserMedia error and cleans up resources', async () => {
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(createMicLoopbackTest('blocked-mic', vi.fn())).rejects.toThrow('Permission denied');
    });

    it('playRingtone starts tone and vibration and returns working cleanup function', () => {
      const stop = playRingtone();
      expect(navigator.vibrate).toHaveBeenCalled();
      expect(typeof stop).toBe('function');

      stop();
      expect(navigator.vibrate).toHaveBeenCalledWith(0);
    });

    it('setAudioOutputDevice sets speaker and earpiece output modes', async () => {
      const mockAudio = {
        setSinkId: vi.fn().mockResolvedValue(undefined),
      };

      const speakerSuccess = await setAudioOutputDevice(mockAudio, true);
      expect(mockAudio.setSinkId).toHaveBeenCalledWith('default');
      expect(speakerSuccess).toBe(true);

      const earpieceSuccess = await setAudioOutputDevice(mockAudio, false);
      expect(mockAudio.setSinkId).toHaveBeenCalledWith('communications');
      expect(earpieceSuccess).toBe(true);
    });

    it('setAudioOutputDevice returns false when setSinkId is not supported or rejects', async () => {
      const mockAudioWithoutSink = {};
      const success = await setAudioOutputDevice(mockAudioWithoutSink, true);
      expect(success).toBe(false);

      const mockAudioFailing = {
        setSinkId: vi.fn().mockRejectedValue(new Error('Device not found')),
      };
      const failSuccess = await setAudioOutputDevice(mockAudioFailing, true);
      expect(failSuccess).toBe(false);

      const nullSuccess = await setAudioOutputDevice(null, true);
      expect(nullSuccess).toBe(false);
    });
  });
});
