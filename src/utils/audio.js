/**
 * Web Audio API & Audio Device Helper Utilities
 */

let globalAudioCtx = null;

/**
 * Get or create a shared AudioContext safely handling autoplay restrictions.
 */
export function getAudioContext() {
  if (typeof window === 'undefined') return null;

  if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return null;
    globalAudioCtx = new AudioCtxClass();
  }

  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }

  return globalAudioCtx;
}

/**
 * Ensures AudioContext is active on user interaction.
 */
export async function unlockAudioContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (e) {
      console.warn('AudioContext resume failed:', e);
    }
  }
  return ctx;
}

/**
 * Build Denoise pipeline: MediaStreamSource -> HighPass 80Hz -> DynamicsCompressor (Noise Gate) -> Destination
 */
export function createDenoisePipeline(stream) {
  if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) {
    return { processedStream: stream, audioCtx: null, nodes: null };
  }

  try {
    const ctx = getAudioContext();
    if (!ctx) return { processedStream: stream, audioCtx: null, nodes: null };

    const source = ctx.createMediaStreamSource(stream);

    // High-pass filter to remove low-frequency background rumble (below 80 Hz)
    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(80, ctx.currentTime);

    // DynamicsCompressor acting as a subtle noise gate & level normalizer
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, ctx.currentTime);
    compressor.knee.setValueAtTime(40, ctx.currentTime);
    compressor.ratio.setValueAtTime(12, ctx.currentTime);
    compressor.attack.setValueAtTime(0.005, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);

    const dest = ctx.createMediaStreamDestination();

    source.connect(highPass);
    highPass.connect(compressor);
    compressor.connect(dest);

    return {
      processedStream: dest.stream,
      audioCtx: ctx,
      nodes: { source, highPass, compressor, dest }
    };
  } catch (err) {
    console.warn('Failed to build Web Audio denoise pipeline, falling back to raw stream:', err);
    return { processedStream: stream, audioCtx: null, nodes: null };
  }
}

/**
 * Play synthetic incoming ringtone using Web Audio API oscillators and vibration.
 */
export function playRingtone() {
  let isPlaying = true;
  let intervalId = null;
  const activeOscillators = [];

  const playToneChunk = () => {
    if (!isPlaying) return;
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      // US phone ring style dual-tone (440Hz + 480Hz)
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.2);
      osc2.stop(now + 1.2);

      activeOscillators.push(osc1, osc2);

      // Clean reference after completion
      setTimeout(() => {
        const idx1 = activeOscillators.indexOf(osc1);
        if (idx1 >= 0) activeOscillators.splice(idx1, 1);
        const idx2 = activeOscillators.indexOf(osc2);
        if (idx2 >= 0) activeOscillators.splice(idx2, 1);
      }, 1300);
    } catch (e) {
      console.warn('Ringtone playback error:', e);
    }
  };

  const startVibration = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([800, 400, 800, 400, 800]);
      } catch (e) {}
    }
  };

  playToneChunk();
  startVibration();

  intervalId = setInterval(() => {
    if (!isPlaying) return;
    playToneChunk();
    startVibration();
  }, 3000);

  return function stopRingtone() {
    isPlaying = false;
    if (intervalId) clearInterval(intervalId);

    // Stop all active oscillators immediately
    activeOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    activeOscillators.length = 0;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(0);
      } catch (e) {}
    }
  };
}

/**
 * Safely switch audio output device (Speaker vs Earpiece)
 */
export async function setAudioOutputDevice(audioElement, isSpeakerOn) {
  if (!audioElement) return false;

  if (typeof audioElement.setSinkId === 'function') {
    try {
      const deviceId = isSpeakerOn ? 'default' : 'communications';
      await audioElement.setSinkId(deviceId);
      return true;
    } catch (err) {
      console.warn('setSinkId call failed or not allowed:', err);
      return false;
    }
  }
  return false;
}

/**
 * Completely stop all tracks on a MediaStream to avoid hardware mic light leaking.
 */
export function stopMediaStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  try {
    stream.getTracks().forEach(track => {
      track.stop();
      track.enabled = false;
    });
  } catch (e) {
    console.warn('Error stopping stream tracks:', e);
  }
}
