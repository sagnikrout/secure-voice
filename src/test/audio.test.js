import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAudioContext,
  unlockAudioContext,
  createDenoisePipeline,
  playRingtone,
  setAudioOutputDevice,
  stopMediaStream
} from '../utils/audio';

describe('Audio Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  describe('createDenoisePipeline', () => {
    it('creates highpass filter and compressor on valid stream', () => {
      const mockStream = {
        getAudioTracks: () => [{ stop: vi.fn(), enabled: true }],
        getTracks: () => [{ stop: vi.fn(), enabled: true }],
      };

      const result = createDenoisePipeline(mockStream);
      expect(result.processedStream).toBeDefined();
      expect(result.audioCtx).toBeDefined();
      expect(result.nodes).toBeDefined();
      expect(result.nodes.highPass.type).toBe('highpass');
    });

    it('falls back to raw stream if invalid stream or error occurs', () => {
      const emptyStream = null;
      const result = createDenoisePipeline(emptyStream);
      expect(result.processedStream).toBe(null);
      expect(result.audioCtx).toBe(null);
    });
  });

  describe('playRingtone', () => {
    it('starts tone and vibration and returns a functional cleanup function', () => {
      const stop = playRingtone();
      expect(navigator.vibrate).toHaveBeenCalled();
      expect(typeof stop).toBe('function');

      // Calling stop cleans up
      stop();
      expect(navigator.vibrate).toHaveBeenCalledWith(0);
    });
  });

  describe('setAudioOutputDevice', () => {
    it('calls setSinkId when supported', async () => {
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

    it('returns false when setSinkId is not supported', async () => {
      const mockAudioWithoutSink = {};
      const success = await setAudioOutputDevice(mockAudioWithoutSink, true);
      expect(success).toBe(false);
    });

    it('handles null audioElement safely', async () => {
      const success = await setAudioOutputDevice(null, true);
      expect(success).toBe(false);
    });
  });

  describe('stopMediaStream', () => {
    it('stops all tracks and disables them', () => {
      const track1 = { stop: vi.fn(), enabled: true };
      const track2 = { stop: vi.fn(), enabled: true };
      const mockStream = {
        getTracks: () => [track1, track2],
      };

      stopMediaStream(mockStream);
      expect(track1.stop).toHaveBeenCalled();
      expect(track1.enabled).toBe(false);
      expect(track2.stop).toHaveBeenCalled();
      expect(track2.enabled).toBe(false);
    });

    it('handles null / undefined stream safely without throwing', () => {
      expect(() => stopMediaStream(null)).not.toThrow();
      expect(() => stopMediaStream(undefined)).not.toThrow();
    });
  });
});
