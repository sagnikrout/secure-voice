/**
 * Web Audio API & Audio Device Helper Utilities
 */

let globalAudioCtx = null;

/**
 * Get or create a shared AudioContext for UI audio / ringtones safely handling autoplay restrictions.
 */
export function getAudioContext() {
  if (typeof window === 'undefined') return null;

  if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return null;
    try {
      globalAudioCtx = new AudioCtxClass();
    } catch (e) {
      console.warn('Failed to create AudioContext:', e);
      return null;
    }
  }

  if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
    try {
      globalAudioCtx.resume().catch(() => {});
    } catch (e) {}
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
 * Build 6-stage isolated Web Audio denoise and voice isolation pipeline:
 * MediaStreamSource
 *   -> Stage 1: 80Hz 2nd-order Butterworth Highpass (rumble/HVAC cut)
 *   -> Stage 2: 2.8kHz Peaking EQ (+3dB gain, Q=1.2) (vocal formant presence)
 *   -> Stage 3: 4.2kHz 2nd-order Lowpass (Q=0.7071) (hiss/fan cut)
 *   -> Stage 4: Active downward RMS Noise Gate (AnalyserNode + GainNode envelope follower, threshold -46 dBFS, floor 0.02, attack 10ms, hold 80ms, release 150ms)
 *   -> Stage 5: Dynamics Compressor (-18dB threshold, 12dB knee, 4:1 ratio, 3ms attack, 150ms release)
 *   -> Stage 6: 1.2x Makeup Gain (+1.58 dB)
 *   -> MediaStreamDestination
 *
 * @param {MediaStream} stream - Input microphone MediaStream
 * @param {Object} [options] - Configuration overrides
 * @param {number} [options.gateThreshold=-46] - Noise gate threshold in dBFS
 * @param {number} [options.noiseGateThreshold=-46] - Alias for gateThreshold
 * @param {number} [options.gateFloor=0.02] - Attenuation floor when gate is closed
 * @param {boolean} [options.gateEnabled=true] - Initial noise gate state
 * @param {boolean} [options.noiseGateEnabled=true] - Alias for gateEnabled
 * @returns {{
 *   processedStream: MediaStream,
 *   audioCtx: AudioContext|null,
 *   nodes: Object|null,
 *   setNoiseGateEnabled: (enabled: boolean) => void,
 *   setNoiseGateThreshold: (db: number) => void,
 *   cleanup: () => void
 * }}
 */
export function createDenoisePipeline(stream: any, options: any = {}) {
  const fallbackResult = {
    processedStream: stream,
    audioCtx: null,
    nodes: null,
    setNoiseGateEnabled: () => {},
    setNoiseGateThreshold: () => {},
    cleanup: () => {}
  };

  if (!stream || typeof stream.getAudioTracks !== 'function') {
    return fallbackResult;
  }
  try {
    const audioTracks = stream.getAudioTracks();
    if (!Array.isArray(audioTracks) || audioTracks.length === 0) {
      return fallbackResult;
    }
  } catch (e) {
    return fallbackResult;
  }

  let ctx = null;
  let gateIntervalId = null;

  try {
    const AudioCtxClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AudioCtxClass) return fallbackResult;

    // Dedicated isolated context for the call session
    ctx = new AudioCtxClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const source = ctx.createMediaStreamSource(stream);

    // Stage 1: 80Hz 2nd-order Butterworth Highpass filter (cuts mic rumble / HVAC)
    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(80, ctx.currentTime);
    if (highPass.Q && highPass.Q.setValueAtTime) {
      highPass.Q.setValueAtTime(0.7071, ctx.currentTime);
    }

    // Stage 2: 2.8kHz Peaking EQ (+3dB gain, Q=1.2) for vocal formant clarity
    const presenceEQ = ctx.createBiquadFilter();
    presenceEQ.type = 'peaking';
    presenceEQ.frequency.setValueAtTime(2800, ctx.currentTime);
    if (presenceEQ.gain && presenceEQ.gain.setValueAtTime) {
      presenceEQ.gain.setValueAtTime(3.0, ctx.currentTime);
    }
    if (presenceEQ.Q && presenceEQ.Q.setValueAtTime) {
      presenceEQ.Q.setValueAtTime(1.2, ctx.currentTime);
    }

    // Stage 3: 4.2kHz 2nd-order Lowpass filter (Q=0.7071) to eliminate ambient hiss
    const hissCut = ctx.createBiquadFilter();
    hissCut.type = 'lowpass';
    hissCut.frequency.setValueAtTime(4200, ctx.currentTime);
    if (hissCut.Q && hissCut.Q.setValueAtTime) {
      hissCut.Q.setValueAtTime(0.7071, ctx.currentTime);
    }

    // Stage 4: Active Downward RMS Noise Gate
    const noiseGateGain = ctx.createGain();
    noiseGateGain.gain.setValueAtTime(1.0, ctx.currentTime);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.0;

    let gateEnabled = options.gateEnabled !== false && options.noiseGateEnabled !== false;
    let gateThreshold = (typeof options.gateThreshold === 'number' && Number.isFinite(options.gateThreshold))
      ? options.gateThreshold
      : ((typeof options.noiseGateThreshold === 'number' && Number.isFinite(options.noiseGateThreshold))
          ? options.noiseGateThreshold
          : -46);
    const gateFloor = (typeof options.gateFloor === 'number' && Number.isFinite(options.gateFloor))
      ? options.gateFloor
      : 0.02;
    const attackTime = 0.010;  // 10ms
    const holdTimeMs = 80;     // 80ms
    const releaseTime = 0.150; // 150ms

    let lastSpeechTime = Date.now();
    const timeBuffer = new Float32Array(analyser.fftSize);
    const byteBuffer = new Uint8Array(analyser.frequencyBinCount);

    const evaluateNoiseGate = () => {
      try {
        if (!gateEnabled) {
          const now = ctx.currentTime;
          if (noiseGateGain.gain.cancelScheduledValues) {
            noiseGateGain.gain.cancelScheduledValues(now);
          }
          if (noiseGateGain.gain.setValueAtTime) {
            noiseGateGain.gain.setValueAtTime(noiseGateGain.gain.value, now);
          }
          if (noiseGateGain.gain.setTargetAtTime) {
            noiseGateGain.gain.setTargetAtTime(1.0, now, 0.01);
          } else if (noiseGateGain.gain.setValueAtTime) {
            noiseGateGain.gain.setValueAtTime(1.0, now);
          }
          return;
        }

        let rms = 0;
        if (typeof analyser.getFloatTimeDomainData === 'function') {
          analyser.getFloatTimeDomainData(timeBuffer);
          let sumSq = 0;
          for (let i = 0; i < timeBuffer.length; i++) {
            const sample = timeBuffer[i];
            if (Number.isFinite(sample)) {
              sumSq += sample * sample;
            }
          }
          rms = Math.sqrt(sumSq / timeBuffer.length);
        } else if (typeof analyser.getByteTimeDomainData === 'function') {
          analyser.getByteTimeDomainData(byteBuffer);
          let sumSq = 0;
          for (let i = 0; i < byteBuffer.length; i++) {
            const norm = (byteBuffer[i] - 128) / 128;
            sumSq += norm * norm;
          }
          rms = Math.sqrt(sumSq / byteBuffer.length);
        } else if (typeof analyser.getByteFrequencyData === 'function') {
          analyser.getByteFrequencyData(byteBuffer);
          let sum = 0;
          for (let i = 0; i < byteBuffer.length; i++) {
            sum += byteBuffer[i];
          }
          rms = (sum / byteBuffer.length) / 255;
        }

        if (!Number.isFinite(rms)) {
          rms = 0;
        }

        const db = 20 * Math.log10(Math.max(rms, 1e-5));
        const nowMs = Date.now();
        const currentAudioTime = ctx.currentTime;

        if (db >= gateThreshold) {
          lastSpeechTime = nowMs;
          if (noiseGateGain.gain.cancelScheduledValues) {
            noiseGateGain.gain.cancelScheduledValues(currentAudioTime);
          }
          if (noiseGateGain.gain.setValueAtTime) {
            noiseGateGain.gain.setValueAtTime(noiseGateGain.gain.value, currentAudioTime);
          }
          if (noiseGateGain.gain.setTargetAtTime) {
            noiseGateGain.gain.setTargetAtTime(1.0, currentAudioTime, attackTime);
          } else if (noiseGateGain.gain.setValueAtTime) {
            noiseGateGain.gain.setValueAtTime(1.0, currentAudioTime);
          }
        } else if (nowMs - lastSpeechTime < holdTimeMs) {
          if (noiseGateGain.gain.setTargetAtTime) {
            noiseGateGain.gain.setTargetAtTime(1.0, currentAudioTime, 0.01);
          }
        } else {
          if (noiseGateGain.gain.cancelScheduledValues) {
            noiseGateGain.gain.cancelScheduledValues(currentAudioTime);
          }
          if (noiseGateGain.gain.setValueAtTime) {
            noiseGateGain.gain.setValueAtTime(noiseGateGain.gain.value, currentAudioTime);
          }
          if (noiseGateGain.gain.setTargetAtTime) {
            noiseGateGain.gain.setTargetAtTime(gateFloor, currentAudioTime, releaseTime);
          } else if (noiseGateGain.gain.setValueAtTime) {
            noiseGateGain.gain.setValueAtTime(gateFloor, currentAudioTime);
          }
        }
      } catch (e) {
        // Defensive: silence DSP tick evaluation errors
      }
    };

    gateIntervalId = setInterval(evaluateNoiseGate, 16);

    // Stage 5: Dynamics Compressor (-18dB threshold, 12dB knee, 4:1 ratio, 3ms attack, 150ms release)
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, ctx.currentTime);
    compressor.knee.setValueAtTime(12, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.150, ctx.currentTime);

    // Stage 6: 1.2x Makeup Gain (+1.58 dB)
    const makeupGain = ctx.createGain();
    makeupGain.gain.setValueAtTime(1.2, ctx.currentTime);

    // Destination
    const dest = ctx.createMediaStreamDestination();

    // Signal Routing Chain
    source.connect(highPass);
    highPass.connect(presenceEQ);
    presenceEQ.connect(hissCut);
    hissCut.connect(noiseGateGain);
    hissCut.connect(analyser); // Sidechain tap
    noiseGateGain.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(dest);

    const nodes = {
      source,
      highPass,
      presenceEQ,
      hissCut,
      noiseGateGain,
      analyser,
      gateAnalyser: analyser,
      compressor,
      makeupGain,
      dest
    };

    const cleanup = () => {
      if (gateIntervalId) {
        clearInterval(gateIntervalId);
        gateIntervalId = null;
      }
      Object.values(nodes).forEach(node => {
        if (node && typeof node.disconnect === 'function') {
          try { node.disconnect(); } catch (e) {}
        }
      });
      if (ctx && ctx.state !== 'closed') {
        try { ctx.close().catch(() => {}); } catch (e) {}
      }
    };

    return {
      processedStream: dest.stream,
      audioCtx: ctx,
      nodes,
      setNoiseGateEnabled: (enabled) => {
        gateEnabled = Boolean(enabled);
        if (!gateEnabled && ctx && noiseGateGain) {
          try {
            const now = ctx.currentTime;
            if (noiseGateGain.gain.cancelScheduledValues) {
              noiseGateGain.gain.cancelScheduledValues(now);
            }
            if (noiseGateGain.gain.setValueAtTime) {
              noiseGateGain.gain.setValueAtTime(noiseGateGain.gain.value, now);
            }
            if (noiseGateGain.gain.setTargetAtTime) {
              noiseGateGain.gain.setTargetAtTime(1.0, now, 0.01);
            } else if (noiseGateGain.gain.setValueAtTime) {
              noiseGateGain.gain.setValueAtTime(1.0, now);
            }
          } catch (e) {
            // Defensive: context may be closed or audio params destroyed
          }
        }
      },
      setNoiseGateThreshold: (thresholdDb) => {
        if (typeof thresholdDb === 'number' && Number.isFinite(thresholdDb)) {
          gateThreshold = thresholdDb;
        }
      },
      cleanup
    };
  } catch (err) {
    console.warn('Failed to build Web Audio denoise pipeline, falling back to raw stream:', err);
    if (gateIntervalId) clearInterval(gateIntervalId);
    if (ctx && ctx.state !== 'closed') {
      try { ctx.close().catch(() => {}); } catch (e) {}
    }
    return fallbackResult;
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
 * Pre-call hardware mic loopback test with delay node to avoid acoustic feedback.
 * @param {string|null} deviceId
 * @param {(level: number) => void} onLevel - Callback with normalized volume (0.0 - 1.0)
 * @returns {Promise<() => void>} Stop callback
 */
export async function createMicLoopbackTest(deviceId, onLevel) {
  let isRunning = true;
  let intervalId = null;
  let audioCtx = null;
  let stream = null;

  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) throw new Error('AudioContext not supported');

    audioCtx = new AudioCtxClass();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true
      },
      video: false
    });

    const source = audioCtx.createMediaStreamSource(stream);

    // Delay node (250ms) to prevent acoustic squeal and let user hear loopback
    const delay = audioCtx.createDelay();
    delay.delayTime.setValueAtTime(0.25, audioCtx.currentTime);

    // Gentle gain
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);

    // Analyser for live VU meter
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    source.connect(delay);
    delay.connect(gain);
    gain.connect(audioCtx.destination);
    source.connect(analyser);

    intervalId = setInterval(() => {
      if (!isRunning) return;
      try {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1, avg / 128);
        onLevel?.(normalized);
      } catch (e) {
        // Defensive: catch sampling/analyser/callback exceptions
      }
    }, 50);

  } catch (err) {
    console.warn('Loopback test setup failed:', err);
    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
    if (stream) stopMediaStream(stream);
    throw err;
  }

  return function stopLoopbackTest() {
    isRunning = false;
    if (intervalId) clearInterval(intervalId);
    if (stream) stopMediaStream(stream);
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
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
 * Completely stop all tracks on a MediaStream and cleanly tear down AudioContext and audio nodes
 * to prevent hardware microphone indicator light leaking or audio thread memory leaks.
 *
 * @param {MediaStream|null} stream
 * @param {AudioContext|null} [audioCtx]
 * @param {Object|Array|null} [nodes]
 */
export function stopMediaStream(stream, audioCtx = null, nodes = null) {
  // 1. Stop all tracks and disable them
  if (stream) {
    const safeStopTrack = (track) => {
      if (!track) return;
      try {
        if (typeof track.stop === 'function') {
          track.stop();
        }
      } catch (e) {
        console.warn('Error stopping track:', e);
      }
      try {
        track.enabled = false;
      } catch (e) {}
    };

    try {
      if (typeof stream.getTracks === 'function') {
        const tracks = stream.getTracks();
        if (Array.isArray(tracks)) {
          tracks.forEach(safeStopTrack);
        }
      }
    } catch (e) {
      console.warn('Error accessing stream.getTracks():', e);
    }

    try {
      if (typeof stream.getAudioTracks === 'function') {
        const audioTracks = stream.getAudioTracks();
        if (Array.isArray(audioTracks)) {
          audioTracks.forEach(safeStopTrack);
        }
      }
    } catch (e) {
      console.warn('Error accessing stream.getAudioTracks():', e);
    }
  }

  // 2. Disconnect nodes & invoke cleanup if present
  if (nodes) {
    if (typeof nodes.cleanup === 'function') {
      try {
        nodes.cleanup();
      } catch (e) {
        console.warn('Error calling nodes.cleanup():', e);
      }
    }
    try {
      const nodeList = Array.isArray(nodes) ? nodes : Object.values(nodes);
      nodeList.forEach(node => {
        if (node && typeof node.disconnect === 'function') {
          try {
            node.disconnect();
          } catch (e) {}
        }
      });
    } catch (e) {
      console.warn('Error disconnecting audio nodes:', e);
    }
  }

  // 3. Close AudioContext
  if (audioCtx && audioCtx.state !== 'closed') {
    try {
      if (typeof audioCtx.close === 'function') {
        audioCtx.close().catch(() => {});
      }
    } catch (e) {
      console.warn('Error closing AudioContext:', e);
    }
  }
}
