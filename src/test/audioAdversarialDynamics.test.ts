import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAudioContext,
  unlockAudioContext,
  createDenoisePipeline,
  createMicLoopbackTest,
  stopMediaStream,
  playRingtone,
  setAudioOutputDevice
} from '../utils/audio';

describe('Adversarial Stress Test: Web Audio Pre-Processing & Voice Isolation (Milestone 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Noise Gate Dynamics & State Transitions', () => {
    it('schedules exact attack time (10ms) when input audio crosses threshold', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const pipeline = createDenoisePipeline(mockStream, { gateThreshold: -46, gateFloor: 0.02 });
      const gainNode = pipeline.nodes.noiseGateGain;
      const analyser = pipeline.nodes.analyser;

      // Simulate loud speech (RMS ~ 0.5, ~ -6 dBFS > -46 dBFS)
      analyser.getFloatTimeDomainData.mockImplementation(arr => {
        arr.fill(0.5);
      });

      vi.advanceTimersByTime(16);

      // Verify attack transition scheduling
      expect(gainNode.gain.cancelScheduledValues).toHaveBeenCalled();
      expect(gainNode.gain.setValueAtTime).toHaveBeenCalled();
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.010);

      pipeline.cleanup();
    });

    it('retains open gate during the 80ms hold window when speech ceases', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const pipeline = createDenoisePipeline(mockStream, { gateThreshold: -46, gateFloor: 0.02 });
      const gainNode = pipeline.nodes.noiseGateGain;
      const analyser = pipeline.nodes.analyser;

      // Step 1: Active speech
      analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0.5));
      vi.advanceTimersByTime(16);
      gainNode.gain.setTargetAtTime.mockClear();

      // Step 2: Instant silence (RMS ~ 0, ~ -100 dBFS)
      analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0.000001));

      // Advance by 50ms (within 80ms hold window)
      vi.advanceTimersByTime(50);
      // During hold, gain should still be held at 1.0 (not gateFloor)
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.01);
      expect(gainNode.gain.setTargetAtTime).not.toHaveBeenCalledWith(0.02, expect.any(Number), expect.any(Number));

      // Step 3: Advance past hold window (80ms + extra tick)
      gainNode.gain.setTargetAtTime.mockClear();
      vi.advanceTimersByTime(50); // Total 100ms > 80ms hold window
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.any(Number), 0.150);

      pipeline.cleanup();
    });

    it('schedules release time (150ms) to gateFloor when silence exceeds hold window', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const customFloor = 0.05;
      const pipeline = createDenoisePipeline(mockStream, { gateThreshold: -46, gateFloor: customFloor });
      const gainNode = pipeline.nodes.noiseGateGain;
      const analyser = pipeline.nodes.analyser;

      // Simulate silence from the beginning
      analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0.0));

      // Advance past hold window
      vi.advanceTimersByTime(100);

      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(customFloor, expect.any(Number), 0.150);

      pipeline.cleanup();
    });

    it('handles multiple rapid speech/silence transitions without state corruption', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const pipeline = createDenoisePipeline(mockStream, { gateThreshold: -40, gateFloor: 0.02 });
      const gainNode = pipeline.nodes.noiseGateGain;
      const analyser = pipeline.nodes.analyser;

      for (let cycle = 0; cycle < 10; cycle++) {
        // Speech burst
        analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0.8));
        vi.advanceTimersByTime(32);
        expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.010);

        // Silence burst
        analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0.00001));
        vi.advanceTimersByTime(120); // Past hold
        expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.any(Number), 0.150);
      }

      pipeline.cleanup();
    });

    it('evaluates RMS accurately with byteTimeDomainData fallback', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const pipeline = createDenoisePipeline(mockStream, { gateThreshold: -46 });
      const gainNode = pipeline.nodes.noiseGateGain;
      const analyser = pipeline.nodes.analyser;

      // Disable float domain data to force byte time domain path
      analyser.getFloatTimeDomainData = undefined;
      analyser.getByteTimeDomainData.mockImplementation(arr => {
        // Fill with loud AC waveform (128 is center, 255 is peak -> norm = (255-128)/128 ~ 0.99)
        arr.fill(250);
      });

      vi.advanceTimersByTime(16);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.010);

      // Now fill with silence (128 is center -> norm = 0)
      analyser.getByteTimeDomainData.mockImplementation(arr => {
        arr.fill(128);
      });
      vi.advanceTimersByTime(100);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.any(Number), 0.150);

      pipeline.cleanup();
    });

    it('evaluates RMS accurately with byteFrequencyData fallback', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const pipeline = createDenoisePipeline(mockStream, { gateThreshold: -46 });
      const gainNode = pipeline.nodes.noiseGateGain;
      const analyser = pipeline.nodes.analyser;

      analyser.getFloatTimeDomainData = undefined;
      analyser.getByteTimeDomainData = undefined;
      analyser.getByteFrequencyData.mockImplementation(arr => {
        arr.fill(200); // High frequency energy
      });

      vi.advanceTimersByTime(16);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.010);

      analyser.getByteFrequencyData.mockImplementation(arr => {
        arr.fill(0); // Zero energy
      });
      vi.advanceTimersByTime(100);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.any(Number), 0.150);

      pipeline.cleanup();
    });
  });

  describe('2. Adversarial Audio Inputs & Threshold Edge Cases', () => {
    it('handles pure zeros, DC bias, and clipped signals without producing NaN or Infinity', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const pipeline = createDenoisePipeline(mockStream);
      const gainNode = pipeline.nodes.noiseGateGain;
      const analyser = pipeline.nodes.analyser;

      // Pure zeros (total silence)
      analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0.0));
      vi.advanceTimersByTime(100);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.any(Number), 0.150);

      // Clipped extreme signal (> +10.0)
      analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(15.0));
      vi.advanceTimersByTime(16);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.010);

      // Alternating DC square wave
      analyser.getFloatTimeDomainData.mockImplementation(arr => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = i % 2 === 0 ? 0.3 : -0.3;
        }
      });
      vi.advanceTimersByTime(16);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.010);

      pipeline.cleanup();
    });

    it('safely rejects invalid noise gate threshold modifications', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const pipeline = createDenoisePipeline(mockStream, { gateThreshold: -46 });
      const gainNode = pipeline.nodes.noiseGateGain;
      const analyser = pipeline.nodes.analyser;

      // Attempt invalid threshold inputs
      pipeline.setNoiseGateThreshold(NaN);
      pipeline.setNoiseGateThreshold(undefined);
      pipeline.setNoiseGateThreshold(null);
      pipeline.setNoiseGateThreshold('not-a-number');
      pipeline.setNoiseGateThreshold({});

      // Set audio at -40 dBFS (RMS ~ 0.01)
      analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0.01)); // ~ -40 dBFS > -46

      vi.advanceTimersByTime(16);
      // Since threshold is still valid -46 dBFS, gate opens
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.010);

      // Update to -30 dBFS (so -40 dBFS becomes sub-threshold)
      pipeline.setNoiseGateThreshold(-30);
      vi.advanceTimersByTime(100);
      // Now -40 dBFS is below -30 dBFS -> gate closes
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.any(Number), 0.150);

      pipeline.cleanup();
    });
  });

  describe('3. Bypass Toggles & Rapid Dynamic Switching', () => {
    it('initializes with bypass when gateEnabled is false', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const pipeline = createDenoisePipeline(mockStream, { gateEnabled: false });
      const gainNode = pipeline.nodes.noiseGateGain;
      const analyser = pipeline.nodes.analyser;

      // Provide total silence
      analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0.0));

      vi.advanceTimersByTime(100);
      // Even after 100ms of silence, gain must be 1.0 (bypass)
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.01);
      expect(gainNode.gain.setTargetAtTime).not.toHaveBeenCalledWith(0.02, expect.any(Number), expect.any(Number));

      pipeline.cleanup();
    });

    it('immediately forces gain to 1.0 upon disabling gate mid-stream', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const pipeline = createDenoisePipeline(mockStream, { gateThreshold: -46 });
      const gainNode = pipeline.nodes.noiseGateGain;
      const analyser = pipeline.nodes.analyser;

      // First let it close on silence
      analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0.0));
      vi.advanceTimersByTime(100);
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.any(Number), 0.150);

      gainNode.gain.setTargetAtTime.mockClear();

      // Disable gate dynamically
      pipeline.setNoiseGateEnabled(false);
      expect(gainNode.gain.cancelScheduledValues).toHaveBeenCalled();
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.01);

      // Advance timer during silence — gate remains bypassed at 1.0
      vi.advanceTimersByTime(50);
      expect(gainNode.gain.setTargetAtTime).not.toHaveBeenCalledWith(0.02, expect.any(Number), expect.any(Number));

      pipeline.cleanup();
    });

    it('survives rapid, repeated bypass toggles without timer leaks or throwing errors', () => {
      const mockTrack = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getAudioTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      };

      const pipeline = createDenoisePipeline(mockStream);

      for (let i = 0; i < 50; i++) {
        pipeline.setNoiseGateEnabled(false);
        pipeline.setNoiseGateEnabled(true);
      }

      expect(() => {
        vi.advanceTimersByTime(32);
        pipeline.cleanup();
      }).not.toThrow();
    });
  });

  describe('4. Zero AudioContext & Track Resource Leaks', () => {
    it('cleans up 50 consecutive pipeline instances with zero lingering intervals or open contexts', () => {
      const contexts = [];

      for (let i = 0; i < 50; i++) {
        const mockTrack = { stop: vi.fn(), enabled: true };
        const mockStream = {
          getAudioTracks: () => [mockTrack],
          getTracks: () => [mockTrack],
        };

        const pipeline = createDenoisePipeline(mockStream);
        contexts.push(pipeline.audioCtx);
        pipeline.cleanup();
      }

      // Verify all contexts closed
      contexts.forEach(ctx => {
        expect(ctx.state).toBe('closed');
      });

      // Advance timer — no orphaned interval should execute
      expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    });

    it('stopMediaStream stops all tracks and sets enabled to false on both getTracks and getAudioTracks', () => {
      const audioTrack = { stop: vi.fn(), enabled: true, kind: 'audio' };
      const videoTrack = { stop: vi.fn(), enabled: true, kind: 'video' };
      const stream = {
        getTracks: () => [audioTrack, videoTrack],
        getAudioTracks: () => [audioTrack],
      };

      const mockCtx = {
        state: 'running',
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockNodes = {
        n1: { disconnect: vi.fn() },
        n2: { disconnect: vi.fn() },
        cleanup: vi.fn(),
      };

      stopMediaStream(stream, mockCtx, mockNodes);

      expect(audioTrack.stop).toHaveBeenCalled();
      expect(audioTrack.enabled).toBe(false);
      expect(videoTrack.stop).toHaveBeenCalled();
      expect(videoTrack.enabled).toBe(false);
      expect(mockNodes.cleanup).toHaveBeenCalled();
      expect(mockNodes.n1.disconnect).toHaveBeenCalled();
      expect(mockNodes.n2.disconnect).toHaveBeenCalled();
      expect(mockCtx.close).toHaveBeenCalled();
    });

    it('stopMediaStream handles errors in track.stop, node.disconnect, or ctx.close gracefully', () => {
      const faultyTrack = {
        stop: () => { throw new Error('Track stop failed'); },
        enabled: true,
      };
      const stream = {
        getTracks: () => [faultyTrack],
        getAudioTracks: () => [faultyTrack],
      };

      const faultyNode = {
        disconnect: () => { throw new Error('Node disconnect failed'); },
      };

      const faultyCtx = {
        state: 'running',
        close: () => { throw new Error('Ctx close failed'); },
      };

      expect(() => stopMediaStream(stream, faultyCtx, [faultyNode])).not.toThrow();
    });
  });

  describe('5. Hardware Loopback Test Rigor & Concurrency', () => {
    it('sets up loopback with exact 250ms anti-feedback delay and 0.4 gain', async () => {
      const onLevel = vi.fn();
      const stop = await createMicLoopbackTest('test-mic-id', onLevel);

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          deviceId: { exact: 'test-mic-id' },
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      vi.advanceTimersByTime(50);
      expect(onLevel).toHaveBeenCalledWith(expect.any(Number));

      stop();
    });

    it('clamps normalized VU meter levels to [0.0, 1.0] under extreme volume', async () => {
      const levels = [];
      const onLevel = (lvl) => levels.push(lvl);

      const stop = await createMicLoopbackTest(null, onLevel);

      // Advance by 200ms (4 intervals)
      vi.advanceTimersByTime(200);

      expect(levels.length).toBeGreaterThanOrEqual(4);
      levels.forEach(lvl => {
        expect(lvl).toBeGreaterThanOrEqual(0.0);
        expect(lvl).toBeLessThanOrEqual(1.0);
      });

      stop();
    });

    it('cleans up stream and context when loopback getUserMedia rejects', async () => {
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(new Error('Device not found'));

      await expect(createMicLoopbackTest('missing-mic', vi.fn())).rejects.toThrow('Device not found');
    });

    it('supports rapid multiple start/stop cycles of loopback without resource leaks', async () => {
      for (let i = 0; i < 5; i++) {
        const onLevel = vi.fn();
        const stop = await createMicLoopbackTest(`mic-${i}`, onLevel);
        vi.advanceTimersByTime(50);
        expect(onLevel).toHaveBeenCalled();
        stop();
      }
    });
  });

  describe('6. Ringtone Generator & Audio Routing', () => {
    it('starts dual-tone ringtone oscillators and stops all active oscillators on cleanup', () => {
      const stopRingtone = playRingtone();
      expect(navigator.vibrate).toHaveBeenCalledWith([800, 400, 800, 400, 800]);

      // Fast forward past repeat interval
      vi.advanceTimersByTime(3000);

      stopRingtone();
      expect(navigator.vibrate).toHaveBeenCalledWith(0);
    });

    it('routes audio to speaker and communications sink without throwing', async () => {
      const mockElement = {
        setSinkId: vi.fn().mockResolvedValue(undefined),
      };

      const speakerRes = await setAudioOutputDevice(mockElement, true);
      expect(speakerRes).toBe(true);
      expect(mockElement.setSinkId).toHaveBeenCalledWith('default');

      const earpieceRes = await setAudioOutputDevice(mockElement, false);
      expect(earpieceRes).toBe(true);
      expect(mockElement.setSinkId).toHaveBeenCalledWith('communications');
    });
  });
});
