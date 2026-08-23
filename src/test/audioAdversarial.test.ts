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

describe('Adversarial & Stress Testing: Web Audio Pipeline (Milestone 1)', () => {
  let savedAudioContext;
  let savedWebkitAudioContext;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    savedAudioContext = window.AudioContext;
    savedWebkitAudioContext = window.webkitAudioContext;
  });

  afterEach(() => {
    window.AudioContext = savedAudioContext;
    window.webkitAudioContext = savedWebkitAudioContext;
    vi.useRealTimers();
  });

  // =========================================================================
  // 1. STREAM & TRACK PATHOLOGIES & TEARDOWN DEFENSES
  // =========================================================================
  describe('Stream & Track Pathologies & Teardown Attacks', () => {
    it('handles stream tracks whose stop() throws without crashing or leaking remaining tracks', () => {
      const track1 = {
        stop: vi.fn().mockImplementation(() => {
          throw new Error('Hardware lock exception during track stop');
        }),
        enabled: true
      };
      const track2 = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getTracks: () => [track1, track2],
        getAudioTracks: () => [track1, track2]
      };

      expect(() => stopMediaStream(mockStream)).not.toThrow();
      expect(track1.enabled).toBe(false);
      expect(track2.stop).toHaveBeenCalled();
      expect(track2.enabled).toBe(false);
    });

    it('handles stream with corrupt or throwing getTracks and getAudioTracks methods', () => {
      const throwingStream = {
        getTracks: () => { throw new Error('Dead stream access error'); },
        getAudioTracks: () => { throw new Error('Audio subsystem unavailable'); }
      };

      expect(() => stopMediaStream(throwingStream)).not.toThrow();
    });

    it('handles stream containing non-audio tracks only (e.g. video tracks)', () => {
      const videoTrack = { kind: 'video', stop: vi.fn(), enabled: true };
      const videoOnlyStream = {
        getTracks: () => [videoTrack],
        getAudioTracks: () => []
      };

      const result = createDenoisePipeline(videoOnlyStream);
      // Must fall back to raw stream since there are no audio tracks
      expect(result.processedStream).toBe(videoOnlyStream);
      expect(result.audioCtx).toBe(null);
      expect(result.nodes).toBe(null);
      expect(() => result.cleanup()).not.toThrow();
    });

    it('handles stream with 20 audio tracks and disables all of them on teardown', () => {
      const tracks = Array.from({ length: 20 }, () => ({
        stop: vi.fn(),
        enabled: true
      }));
      const multiTrackStream = {
        getTracks: () => tracks,
        getAudioTracks: () => tracks
      };

      const result = createDenoisePipeline(multiTrackStream);
      expect(result.processedStream).toBeDefined();

      stopMediaStream(multiTrackStream, result.audioCtx, result.nodes);
      tracks.forEach(track => {
        expect(track.stop).toHaveBeenCalled();
        expect(track.enabled).toBe(false);
      });
    });

    it('handles track with throwing getter for enabled property', () => {
      const badTrack = {
        stop: vi.fn(),
        get enabled() {
          throw new Error('SecurityError: property access blocked');
        },
        set enabled(val) {
          // ignore or throw
        }
      };
      const mockStream = {
        getTracks: () => [badTrack],
        getAudioTracks: () => [badTrack]
      };

      expect(() => stopMediaStream(mockStream)).not.toThrow();
      expect(badTrack.stop).toHaveBeenCalled();
    });

    it('survives rapid sequential pipeline creation and teardown in tight loop (50 iterations)', () => {
      for (let i = 0; i < 50; i++) {
        const track = { stop: vi.fn(), enabled: true };
        const stream = {
          getTracks: () => [track],
          getAudioTracks: () => [track]
        };

        const pipeline = createDenoisePipeline(stream);
        expect(pipeline.processedStream).toBeDefined();
        pipeline.setNoiseGateThreshold(-40 + (i % 10));
        pipeline.setNoiseGateEnabled(i % 2 === 0);

        // Advance timers slightly
        vi.advanceTimersByTime(8);

        pipeline.cleanup();
        stopMediaStream(stream, pipeline.audioCtx, pipeline.nodes);
      }
    });

    it('survives immediate teardown before the first noise gate interval tick', () => {
      const track = { stop: vi.fn(), enabled: true };
      const stream = {
        getTracks: () => [track],
        getAudioTracks: () => [track]
      };

      const pipeline = createDenoisePipeline(stream);
      // Immediately clean up without advancing timers
      pipeline.cleanup();

      // Advance timers now - verify no intervals fire or throw on closed context
      expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    });

    it('handles idempotent and repeated calls to stopMediaStream under concurrent execution', () => {
      const mockCtx = {
        state: 'running',
        close: vi.fn().mockImplementation(async () => {
          mockCtx.state = 'closed';
        })
      };
      const mockNode = { disconnect: vi.fn() };
      const mockStream = {
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      // Call stopMediaStream 10 times concurrently
      for (let i = 0; i < 10; i++) {
        stopMediaStream(mockStream, mockCtx, { n: mockNode });
      }

      expect(mockNode.disconnect).toHaveBeenCalled();
      expect(mockCtx.close).toHaveBeenCalledTimes(1);
    });

    it('continues disconnecting nodes when nodes.cleanup() throws', () => {
      const node1 = { disconnect: vi.fn() };
      const node2 = { disconnect: vi.fn() };
      const nodesObj = {
        n1: node1,
        n2: node2,
        cleanup: vi.fn().mockImplementation(() => {
          throw new Error('Cleanup callback threw error');
        })
      };

      expect(() => stopMediaStream(null, null, nodesObj)).not.toThrow();
      expect(node1.disconnect).toHaveBeenCalled();
      expect(node2.disconnect).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. WEB AUDIO API FAULT INJECTION & ERROR RECOVERY
  // =========================================================================
  describe('Web Audio API Fault Injection & Error Recovery', () => {
    it('gracefully handles AudioContext constructor throwing in getAudioContext', () => {
      const originalAudioCtx = window.AudioContext;
      try {
        window.AudioContext = vi.fn().mockImplementation(() => {
          throw new Error('QuotaExceededError: Cannot create more AudioContexts');
        });

        expect(() => getAudioContext()).not.toThrow();
      } finally {
        window.AudioContext = originalAudioCtx;
      }
    });

    it('gracefully falls back when AudioContext constructor throws DOMException NotAllowedError', () => {
      const originalAudioCtx = window.AudioContext;
      try {
        window.AudioContext = vi.fn().mockImplementation(() => {
          const err = new Error('The play() request was interrupted because the document was not active');
          err.name = 'NotAllowedError';
          throw err;
        });

        const track = { stop: vi.fn(), enabled: true };
        const mockStream = {
          getTracks: () => [track],
          getAudioTracks: () => [track]
        };

        const result = createDenoisePipeline(mockStream);
        expect(result.processedStream).toBe(mockStream);
        expect(result.audioCtx).toBe(null);
        expect(result.nodes).toBe(null);

        // Verify controls are safe no-ops
        expect(() => result.setNoiseGateEnabled(false)).not.toThrow();
        expect(() => result.setNoiseGateThreshold(-30)).not.toThrow();
        expect(() => result.cleanup()).not.toThrow();
      } finally {
        window.AudioContext = originalAudioCtx;
      }
    });

    it('gracefully falls back when createMediaStreamSource throws InvalidStateError', () => {
      const originalAudioCtx = window.AudioContext;
      try {
        class FaultyAudioCtx extends originalAudioCtx {
          createMediaStreamSource() {
            const err = new Error('MediaStream has no valid audio tracks');
            err.name = 'InvalidStateError';
            throw err;
          }
        }
        window.AudioContext = FaultyAudioCtx;

        const track = { stop: vi.fn(), enabled: true };
        const mockStream = {
          getTracks: () => [track],
          getAudioTracks: () => [track]
        };

        const result = createDenoisePipeline(mockStream);
        expect(result.processedStream).toBe(mockStream);
        expect(result.audioCtx).toBe(null);
      } finally {
        window.AudioContext = originalAudioCtx;
      }
    });

    it('gracefully falls back when createBiquadFilter throws QuotaExceededError', () => {
      const originalAudioCtx = window.AudioContext;
      try {
        class FaultyAudioCtx extends originalAudioCtx {
          createBiquadFilter() {
            const err = new Error('Too many hardware DSP filters allocated');
            err.name = 'QuotaExceededError';
            throw err;
          }
        }
        window.AudioContext = FaultyAudioCtx;

        const track = { stop: vi.fn(), enabled: true };
        const mockStream = {
          getTracks: () => [track],
          getAudioTracks: () => [track]
        };

        const result = createDenoisePipeline(mockStream);
        expect(result.processedStream).toBe(mockStream);
        expect(result.audioCtx).toBe(null);
      } finally {
        window.AudioContext = originalAudioCtx;
      }
    });

    it('gracefully falls back when createDynamicsCompressor throws', () => {
      const originalAudioCtx = window.AudioContext;
      try {
        class FaultyAudioCtx extends originalAudioCtx {
          createDynamicsCompressor() {
            throw new Error('Compressor node allocation failed');
          }
        }
        window.AudioContext = FaultyAudioCtx;

        const mockStream = {
          getTracks: () => [{ stop: vi.fn(), enabled: true }],
          getAudioTracks: () => [{ stop: vi.fn(), enabled: true }]
        };

        const result = createDenoisePipeline(mockStream);
        expect(result.processedStream).toBe(mockStream);
        expect(result.audioCtx).toBe(null);
      } finally {
        window.AudioContext = originalAudioCtx;
      }
    });

    it('gracefully falls back when createMediaStreamDestination throws', () => {
      const originalAudioCtx = window.AudioContext;
      try {
        class FaultyAudioCtx extends originalAudioCtx {
          createMediaStreamDestination() {
            throw new Error('MediaStreamDestination unavailable');
          }
        }
        window.AudioContext = FaultyAudioCtx;

        const mockStream = {
          getTracks: () => [{ stop: vi.fn(), enabled: true }],
          getAudioTracks: () => [{ stop: vi.fn(), enabled: true }]
        };

        const result = createDenoisePipeline(mockStream);
        expect(result.processedStream).toBe(mockStream);
        expect(result.audioCtx).toBe(null);
      } finally {
        window.AudioContext = originalAudioCtx;
      }
    });

    it('handles node.disconnect throwing on teardown without crashing', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const result = createDenoisePipeline(mockStream);
      result.nodes.highPass.disconnect = vi.fn().mockImplementation(() => {
        throw new Error('InvalidAccessError: Node not connected');
      });

      expect(() => result.cleanup()).not.toThrow();
    });

    it('handles audioCtx.close() throwing synchronous error or rejecting promise', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const result = createDenoisePipeline(mockStream);
      result.audioCtx.close = vi.fn().mockImplementation(() => {
        throw new Error('AudioContext internal thread deadlock');
      });

      expect(() => result.cleanup()).not.toThrow();
    });

    it('handles legacy Web Audio nodes with missing AudioParam scheduling methods', () => {
      const originalAudioCtx = window.AudioContext;
      try {
        class LegacyAudioCtx extends originalAudioCtx {
          createGain() {
            return {
              gain: {
                value: 1.0,
                // Only setValueAtTime, missing setTargetAtTime / cancelScheduledValues
                setValueAtTime: vi.fn()
              },
              connect: vi.fn(),
              disconnect: vi.fn()
            };
          }
        }
        window.AudioContext = LegacyAudioCtx;

        const mockStream = {
          getTracks: () => [{ stop: vi.fn(), enabled: true }],
          getAudioTracks: () => [{ stop: vi.fn(), enabled: true }]
        };

        const result = createDenoisePipeline(mockStream);
        expect(result.processedStream).toBeDefined();

        // Tick noise gate
        vi.advanceTimersByTime(40);

        // Verify toggle and threshold work with fallback
        expect(() => result.setNoiseGateEnabled(false)).not.toThrow();
        expect(() => result.setNoiseGateEnabled(true)).not.toThrow();
        expect(() => result.cleanup()).not.toThrow();
      } finally {
        window.AudioContext = originalAudioCtx;
      }
    });
  });

  // =========================================================================
  // 3. NOISE GATE SIGNAL PROCESSING & ADVERSARIAL BUFFER INPUTS
  // =========================================================================
  describe('Noise Gate Signal Processing & Boundary Attacks', () => {
    it('handles NaN, Infinity, -Infinity and subnormal floats in audio buffer safely', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const result = createDenoisePipeline(mockStream);
      const analyser = result.nodes.analyser;
      const gainNode = result.nodes.noiseGateGain;

      // Corrupt buffer with NaN and Inf
      analyser.getFloatTimeDomainData.mockImplementation(arr => {
        arr[0] = NaN;
        arr[1] = Infinity;
        arr[2] = -Infinity;
        arr[3] = 1e-40; // subnormal
        for (let i = 4; i < arr.length; i++) {
          arr[i] = 0.5;
        }
      });

      expect(() => vi.advanceTimersByTime(32)).not.toThrow();
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalled();

      result.cleanup();
    });

    it('handles extreme and corrupt gateThreshold inputs gracefully', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const extremeThresholds = [-Infinity, +Infinity, 0, +100, -1000, NaN, null, undefined, {}, [], 'loud'];

      extremeThresholds.forEach(thresh => {
        const result = createDenoisePipeline(mockStream, { gateThreshold: thresh });
        expect(result.processedStream).toBeDefined();

        result.setNoiseGateThreshold(thresh);
        expect(() => vi.advanceTimersByTime(20)).not.toThrow();

        result.cleanup();
      });
    });

    it('handles NaN gateFloor or gateThreshold in initial options without passing NaN to AudioParam', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const result = createDenoisePipeline(mockStream, { gateThreshold: NaN, gateFloor: NaN });
      expect(result.processedStream).toBeDefined();

      const gainNode = result.nodes.noiseGateGain;
      // Feed silence
      result.nodes.analyser.getFloatTimeDomainData.mockImplementation(arr => arr.fill(0));
      vi.advanceTimersByTime(200);

      // Verify setTargetAtTime was called with a finite floor, not NaN
      const calls = gainNode.gain.setTargetAtTime.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const floorPassed = calls[calls.length - 1][0];
      expect(Number.isNaN(floorPassed)).toBe(false);

      result.cleanup();
    });

    it('survives rapid burst of 1,000 noise gate enable/disable toggle calls', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const result = createDenoisePipeline(mockStream);
      for (let i = 0; i < 1000; i++) {
        result.setNoiseGateEnabled(i % 2 === 0);
      }
      expect(result.nodes.noiseGateGain.gain.setTargetAtTime).toHaveBeenCalled();

      result.cleanup();
    });

    it('falls back to getByteTimeDomainData if getFloatTimeDomainData is unavailable', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const result = createDenoisePipeline(mockStream);
      const analyser = result.nodes.analyser;
      analyser.getFloatTimeDomainData = undefined; // simulate browser lacking float time domain
      analyser.getByteTimeDomainData = vi.fn(arr => {
        arr.fill(200); // 200 > 128 -> active speech
      });

      vi.advanceTimersByTime(32);
      expect(analyser.getByteTimeDomainData).toHaveBeenCalled();
      expect(result.nodes.noiseGateGain.gain.setTargetAtTime).toHaveBeenCalled();

      result.cleanup();
    });

    it('falls back to getByteFrequencyData if both time domain methods are unavailable', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const result = createDenoisePipeline(mockStream);
      const analyser = result.nodes.analyser;
      analyser.getFloatTimeDomainData = undefined;
      analyser.getByteTimeDomainData = undefined;
      analyser.getByteFrequencyData = vi.fn(arr => {
        arr.fill(180);
      });

      vi.advanceTimersByTime(32);
      expect(analyser.getByteFrequencyData).toHaveBeenCalled();
      expect(result.nodes.noiseGateGain.gain.setTargetAtTime).toHaveBeenCalled();

      result.cleanup();
    });

    it('handles analyser throwing during tick evaluation without crashing timer thread', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const result = createDenoisePipeline(mockStream);
      result.nodes.analyser.getFloatTimeDomainData = vi.fn().mockImplementation(() => {
        throw new Error('Underlying Web Audio DSP thread lost');
      });

      // The interval tick should execute without throwing uncaught exceptions to caller
      expect(() => vi.advanceTimersByTime(50)).not.toThrow();

      result.cleanup();
    });

    it('handles closed AudioContext during evaluateNoiseGate tick without unhandled exceptions', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }]
      };

      const result = createDenoisePipeline(mockStream);
      // Simulate external closure of context without calling cleanup
      result.audioCtx.state = 'closed';
      result.nodes.noiseGateGain.gain.setValueAtTime = vi.fn().mockImplementation(() => {
        throw new Error('InvalidStateError: AudioContext is closed');
      });

      expect(() => vi.advanceTimersByTime(50)).not.toThrow();
      result.cleanup();
    });
  });

  // =========================================================================
  // 4. MICROPHONE LOOPBACK TEST, RINGTONE & DEVICE ROUTING STRESS
  // =========================================================================
  describe('Loopback, Ringtone & Audio Device Routing Adversarial Tests', () => {
    it('createMicLoopbackTest handles exception inside onLevel callback cleanly', async () => {
      const throwingOnLevel = vi.fn().mockImplementation(() => {
        throw new Error('UI rendering exception in VU meter');
      });

      const stop = await createMicLoopbackTest('device-1', throwingOnLevel);
      expect(typeof stop).toBe('function');

      // Let interval fire
      expect(() => vi.advanceTimersByTime(120)).not.toThrow();

      // Clean up
      expect(() => stop()).not.toThrow();
    });

    it('createMicLoopbackTest handles analyser exception inside tick callback cleanly', async () => {
      const onLevel = vi.fn();
      const originalAudioContext = window.AudioContext;
      try {
        class FaultyAnalyserContext extends originalAudioContext {
          createAnalyser() {
            const a = super.createAnalyser();
            a.getByteFrequencyData = vi.fn().mockImplementation(() => {
              throw new Error('Hardware analyser node error');
            });
            return a;
          }
        }
        window.AudioContext = FaultyAnalyserContext;

        const stop = await createMicLoopbackTest('device-1', onLevel);
        expect(typeof stop).toBe('function');

        expect(() => vi.advanceTimersByTime(120)).not.toThrow();

        stop();
      } finally {
        window.AudioContext = originalAudioContext;
      }
    });

    it('createMicLoopbackTest supports multiple concurrent loopback instances without collision', async () => {
      const levels1 = [];
      const levels2 = [];

      const stop1 = await createMicLoopbackTest('mic-1', lvl => levels1.push(lvl));
      const stop2 = await createMicLoopbackTest('mic-2', lvl => levels2.push(lvl));

      vi.advanceTimersByTime(100);

      expect(levels1.length).toBeGreaterThan(0);
      expect(levels2.length).toBeGreaterThan(0);

      stop1();
      stop2();
    });

    it('playRingtone handles missing window.AudioContext gracefully', () => {
      const originalAudioCtx = window.AudioContext;
      const originalWebkitAudioCtx = window.webkitAudioContext;
      try {
        window.AudioContext = undefined;
        window.webkitAudioContext = undefined;

        const stop = playRingtone();
        expect(typeof stop).toBe('function');

        expect(() => {
          vi.advanceTimersByTime(3500);
          stop();
        }).not.toThrow();
      } finally {
        window.AudioContext = originalAudioCtx;
        window.webkitAudioContext = originalWebkitAudioCtx;
      }
    });

    it('playRingtone handles 20 rapid start and stop calls without leaking oscillators or timer leaks', () => {
      const stoppers = [];
      for (let i = 0; i < 20; i++) {
        stoppers.push(playRingtone());
      }

      vi.advanceTimersByTime(500);

      stoppers.forEach(stop => {
        expect(() => stop()).not.toThrow();
        // Call stop again (idempotent)
        expect(() => stop()).not.toThrow();
      });
    });

    it('setAudioOutputDevice handles non-standard arguments and rejection errors', async () => {
      // 1. Primitive arguments
      expect(await setAudioOutputDevice('audio-element-string', true)).toBe(false);
      expect(await setAudioOutputDevice(12345, false)).toBe(false);
      expect(await setAudioOutputDevice({}, true)).toBe(false);

      // 2. Audio element with setSinkId rejecting with AbortError
      const mockElement = {
        setSinkId: vi.fn().mockRejectedValue(new Error('AbortError: audio device in exclusive mode'))
      };
      expect(await setAudioOutputDevice(mockElement, true)).toBe(false);

      // 3. Truthy / Falsy non-boolean isSpeakerOn arguments
      const successfulElement = {
        setSinkId: vi.fn().mockResolvedValue(undefined)
      };
      expect(await setAudioOutputDevice(successfulElement, 1)).toBe(true);
      expect(successfulElement.setSinkId).toHaveBeenCalledWith('default');

      expect(await setAudioOutputDevice(successfulElement, 0)).toBe(true);
      expect(successfulElement.setSinkId).toHaveBeenCalledWith('communications');
    });
  });

  // =========================================================================
  // 5. CONCURRENCY, MEMORY LEAKS & PIPELINE INTEGRITY
  // =========================================================================
  describe('Concurrency & Resource Lifecycle Verification', () => {
    it('creates 50 completely isolated pipelines in parallel and cleanly tears down all 50', () => {
      const pipelines = [];
      const streams = [];

      for (let i = 0; i < 50; i++) {
        const track = { stop: vi.fn(), enabled: true };
        const stream = {
          getTracks: () => [track],
          getAudioTracks: () => [track]
        };
        streams.push(stream);

        const pipeline = createDenoisePipeline(stream, {
          gateThreshold: -46 + (i % 5),
          gateFloor: 0.02
        });
        pipelines.push(pipeline);
      }

      expect(pipelines.length).toBe(50);

      // Advance time with all 50 active
      vi.advanceTimersByTime(60);

      // Clean up all 50
      pipelines.forEach((p, idx) => {
        p.cleanup();
        stopMediaStream(streams[idx], p.audioCtx, p.nodes);
        expect(p.audioCtx.state).toBe('closed');
      });

      // Advance timers further to ensure no zombie timers fire
      expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    });

    it('verifies stopMediaStream with arbitrary malformed objects never throws', () => {
      const malformedInputs = [
        null,
        undefined,
        0,
        1,
        'string',
        true,
        false,
        {},
        [],
        { getTracks: 'not a function' },
        { getAudioTracks: null },
        { tracks: [] },
        () => {},
        Symbol('test')
      ];

      malformedInputs.forEach(input1 => {
        malformedInputs.forEach(input2 => {
          malformedInputs.forEach(input3 => {
            expect(() => stopMediaStream(input1, input2, input3)).not.toThrow();
          });
        });
      });
    });
  });
});
