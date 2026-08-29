import { useState, useRef, useCallback, useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  unlockAudioContext,
  createDenoisePipeline,
  playRingtone,
  stopMediaStream
} from '../utils/audio';
import { transformOpusSdp, getQualityRating, generateSafetyCode, applySenderBitrate } from '../utils/webrtc';
import { NetworkTelemetryMonitor, AdaptiveBitrateController, evaluateCodecCrossover } from '../utils/networkAdaptation';
import { IceRestartManager } from '../utils/iceRestartManager';
import { JitterBufferController } from '../utils/jitterBufferController';
import { PacketPacer } from '../utils/packetPacer';
import { TurnRelayManager } from '../utils/turnManager';
import { saveCallHistory } from '../components/RecentCalls';
import {
  setAudioOutputMode,
  requestAudioFocus,
  abandonAudioFocus,
  addAudioFocusListener
} from '../utils/audioRouting';
import { TIMINGS, LADDER_TIERS, STORAGE_KEYS, LYRA_CONFIG, CODEC_CROSSOVER_CONFIG } from '../constants/config';
import { audioResourceManager } from '../utils/resourceManager';
import { structuredLogger } from '../utils/structuredLogger';
import { auditoryFeedback } from '../utils/auditoryFeedback';
import { lyraManager, lyraTransformController, lyraWasmLoader } from '../utils/lyra';
import { CodecType, CodecPreference, LyraBitrate } from '../types';

/**
 * Main call session hook managing call lifecycle, audio streams, and WebRTC state
 * @param {Object} options
 * @param {Function} options.addLog - Logging callback
 * @param {Function} options.onStatusChange - Status change callback
 * @param {string} options.selectedInputId - Preferred microphone device ID
 * @returns {Object} Call session controls and state
 */
export function useCallSession({ addLog, onStatusChange, selectedInputId }) {
  // Active Streams & Refs
  const rawStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const pipelineNodesRef = useRef(null);
  const pipelineCleanupRef = useRef(null);
  const callRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioFocusListenerRef = useRef(null);

  // Telemetry monitor, bitrate controller, ICE restart, jitter buffer, packet pacer, and TURN manager refs
  const telemetryMonitorRef = useRef(null);
  const bitrateControllerRef = useRef(new AdaptiveBitrateController());
  const iceRestartManagerRef = useRef(null);
  const jitterControllerRef = useRef(new JitterBufferController({ onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level) }));
  const packetPacerRef = useRef(new PacketPacer({ onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level) }));
  const turnRelayManagerRef = useRef(new TurnRelayManager(null, { onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level) }));

  // Timers & Stats Tracking
  const dialTimeoutRef = useRef(null);
  const incomingTimeoutRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const currentBitrateRef = useRef(LADDER_TIERS[0].maxBitrateBps);

  // Call States
  const [isInCall, setIsInCall] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [connectedPeer, setConnectedPeer] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [activeOutputId, setActiveOutputId] = useState('speaker');
  const [quality, setQuality] = useState('good');
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null);
  const [safetyCode, setSafetyCode] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [activeTier, setActiveTier] = useState(LADDER_TIERS[0]);
  const [liveTelemetry, setLiveTelemetry] = useState(null);

  // Neural Codec & Dynamic Crossover State
  const [preferredCodec, setPreferredCodecState] = useState<CodecPreference>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.PREFERRED_CODEC);
        if (saved === 'auto' || saved === 'opus' || saved === 'lyra') return saved as CodecPreference;
      } catch (e: any) {}
    }
    return lyraWasmLoader.checkCompatibility().simd ? 'auto' : 'opus';
  });
  const [activeCodec, setActiveCodec] = useState<CodecType>('opus');
  const crossoverHealthyTicksRef = useRef(0);

  const setPreferredCodec = useCallback((codec: CodecPreference) => {
    setPreferredCodecState(codec);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEYS.PREFERRED_CODEC, codec);
      } catch (e: any) {}
    }
    const label = codec === 'auto'
      ? 'Smart Auto Crossover (Lyra v2 <14k, Opus ≥14k)'
      : (codec === 'lyra' ? 'Google Lyra v2 Neural (3.2 kbps)' : 'Standard Opus');
    callbacksRef.current.addLog?.(`Preferred voice codec set to: ${label}`, 'info');
  }, []);

  // Ringtone player cleanup ref
  const stopRingtoneRef = useRef(null);

  // Store callbacks in a ref to prevent infinite re-renders & stale closures
  const callbacksRef = useRef({ addLog, onStatusChange });
  useEffect(() => {
    callbacksRef.current = { addLog, onStatusChange };
  }, [addLog, onStatusChange]);

  const selectedInputIdRef = useRef(selectedInputId);
  useEffect(() => {
    selectedInputIdRef.current = selectedInputId;
  }, [selectedInputId]);

  // Timer controls
  const startTimer = useCallback(() => {
    setCallDuration(0);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  /**
   * Complete teardown of call session and hardware release
   */
  const endCall = useCallback(() => {
    // 1. Abandon Native Audio Focus
    abandonAudioFocus();
    if (audioFocusListenerRef.current?.remove) {
      audioFocusListenerRef.current.remove();
      audioFocusListenerRef.current = null;
    }

    // 2. Stop Telemetry Monitor, Reset Bitrate Controller and ICE Restart Manager
    if (telemetryMonitorRef.current) {
      telemetryMonitorRef.current.stop();
      telemetryMonitorRef.current = null;
    }
    if (iceRestartManagerRef.current) {
      iceRestartManagerRef.current.reset();
      iceRestartManagerRef.current = null;
    }
    if (bitrateControllerRef.current) {
      bitrateControllerRef.current.reset();
    }

    // 3. Close PeerJS call
    if (callRef.current) {
      try { callRef.current.close(); } catch (e: any) {}
      callRef.current = null;
    }
    if (typeof window !== 'undefined') {
      window.__SECUREVOICE_ACTIVE_PC__ = null;
    }

    // 4. Clear remote audio
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    // 5. Clean audio pipeline & stop all media tracks explicitly
    if (pipelineCleanupRef.current) {
      try { pipelineCleanupRef.current(); } catch (e: any) {}
      pipelineCleanupRef.current = null;
    }
    stopMediaStream(rawStreamRef.current);
    stopMediaStream(processedStreamRef.current, audioCtxRef.current, pipelineNodesRef.current);
    audioResourceManager.cleanupAll();
    rawStreamRef.current = null;
    processedStreamRef.current = null;
    audioCtxRef.current = null;
    pipelineNodesRef.current = null;

    // 6. Clear all timeouts and intervals
    if (dialTimeoutRef.current) { clearTimeout(dialTimeoutRef.current); dialTimeoutRef.current = null; }
    if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }

    // 7. Stop Ringtone and clean oscillators
    if (stopRingtoneRef.current) {
      stopRingtoneRef.current();
      stopRingtoneRef.current = null;
    }

    // 8. Clean Lyra neural codec state
    lyraManager.reset();
    lyraTransformController.reset();
    setActiveCodec('opus');

    // 9. Reset states
    stopTimer();
    setIsInCall(prevInCall => {
      if (prevInCall) {
        auditoryFeedback.notifyDisconnected();
      }
      return false;
    });
    setIsCalling(false);
    setConnectedPeer('');
    setIsMuted(false);
    setQuality('good');
    setIncomingCall(null);
    try { LocalNotifications.cancel({ notifications: [{ id: 1122 }] }).catch(() => {}); } catch(e) {}
    setSafetyCode(null);
    setIsVerified(false);
    setActiveTier(LADDER_TIERS[0]);
    setLiveTelemetry(null);
    currentBitrateRef.current = LADDER_TIERS[0].maxBitrateBps;
    callbacksRef.current.onStatusChange?.('ready');
    callbacksRef.current.addLog?.('Call terminated and audio pipeline cleanly released', 'info');
  }, [stopTimer]);

  /**
   * Request & build microphone stream with Web Audio processing
   */
  const acquireMicrophone = useCallback(async () => {
    if (processedStreamRef.current && processedStreamRef.current.active) {
      return processedStreamRef.current;
    }

    await unlockAudioContext();
    callbacksRef.current.addLog?.('Requesting hardware microphone access...', 'info');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputIdRef.current ? { exact: selectedInputIdRef.current } : undefined,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      rawStreamRef.current = stream;
      callbacksRef.current.addLog?.('Microphone access granted', 'ok');

      const { processedStream, audioCtx, nodes, cleanup } = createDenoisePipeline(stream);
      processedStreamRef.current = processedStream;
      audioCtxRef.current = audioCtx;
      pipelineNodesRef.current = nodes;
      pipelineCleanupRef.current = cleanup;

      if (audioCtx) {
        callbacksRef.current.addLog?.('Web Audio 6-stage filter & noise gate active', 'ok');
      }

      // Initialize Google Lyra v2 Neural Codec if preferred (or in Smart Auto Crossover mode)
      if ((preferredCodec === 'auto' || preferredCodec === 'lyra') && lyraWasmLoader.checkCompatibility().simd) {
        try {
          const lyraReady = await lyraManager.init({ audioCtx: audioCtx || undefined });
          if (lyraReady) {
            setActiveCodec('lyra');
            callbacksRef.current.addLog?.('Google Lyra v2 Neural Codec active (3.2 kbps wideband speech)', 'ok');
          } else {
            setActiveCodec('opus');
            callbacksRef.current.addLog?.('Opus SILK codec active (fallback)', 'info');
          }
        } catch (e: any) {
          setActiveCodec('opus');
        }
      } else {
        setActiveCodec('opus');
      }

      return processedStream;
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        callbacksRef.current.addLog?.(`Microphone error: ${err.message}`, 'error');
      }
      throw err;
    }
  }, []);

  /**
   * Attach WebRTC call event listeners and setup monitoring
   */
  const bindCallEvents = useCallback((call) => {
    callRef.current = call;
    let streamAttached = false;
    let pcInitialized = false;

    // Request native audio focus on active connection
    requestAudioFocus();
    audioFocusListenerRef.current = addAudioFocusListener((event) => {
      if (event?.state === 'loss_transient' || event?.state === 'loss') {
        callbacksRef.current.addLog?.('Audio focus interrupted (cellular call or system alarm)', 'warn');
        if (rawStreamRef.current) {
          rawStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
      } else if (event?.state === 'gain') {
        callbacksRef.current.addLog?.('Audio focus restored', 'ok');
        if (rawStreamRef.current && !isMuted) {
          rawStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
        }
      }
    });

    const setupPeerConnection = () => {
      const pc = call.peerConnection || (call as any)._peerConnection;
      if (!pc) return;

      if (typeof window !== 'undefined') {
        window.__SECUREVOICE_ACTIVE_PC__ = pc;
      }

      // Direct DataChannel creation for instantaneous Safety Code synchronization
      try {
        if (!(pc as any)._safetyChannel) {
          const dc = pc.createDataChannel('securevoice_security_sync', { negotiated: true, id: 0 });
          (pc as any)._safetyChannel = dc;
          dc.onmessage = (event: any) => {
            try {
              const data = JSON.parse(event.data);
              if (data && data.type === 'safety_code' && data.code) {
                setSafetyCode(prev => prev || data.code);
              }
            } catch (e: any) {}
          };
        }
      } catch (e: any) {}

      // Generate MITM Safety Code from DTLS Fingerprints with multi-event settlement checks
      const computeAndSetSafetyCode = async () => {
        const localSdp = pc.currentLocalDescription?.sdp || pc.localDescription?.sdp;
        const remoteSdp = pc.currentRemoteDescription?.sdp || pc.remoteDescription?.sdp;
        if (localSdp && remoteSdp) {
          try {
            const code = await generateSafetyCode(localSdp, remoteSdp);
            if (code) {
              setSafetyCode(code);
              const dc = (pc as any)._safetyChannel;
              if (dc && dc.readyState === 'open') {
                try { dc.send(JSON.stringify({ type: 'safety_code', code })); } catch (e: any) {}
              } else if (dc) {
                dc.onopen = () => {
                  try { dc.send(JSON.stringify({ type: 'safety_code', code })); } catch (e: any) {}
                };
              }
            }
          } catch (err: any) {
            callbacksRef.current.addLog?.(`Safety code generation failed: ${err.message}`, 'warn');
          }
        }
      };

      // Try immediately and on continuous interval during handshake
      computeAndSetSafetyCode();
      const safetyInterval = setInterval(computeAndSetSafetyCode, 250);
      setTimeout(() => clearInterval(safetyInterval), 8000);

      if (pcInitialized) return;
      pcInitialized = true;

      const isCaller = Boolean(call.options && call.options._isCaller);

      // Instantiate IceRestartManager
      const iceManager = new IceRestartManager({
        onStatusChange: (status) => {
          if (status === 'in-call') {
            setIsInCall(true);
          } else if (status === 'reconnecting') {
            auditoryFeedback.notifyReconnecting();
          }
          callbacksRef.current.onStatusChange?.(status);
        },
        onLog: (msg, level) => callbacksRef.current.addLog?.(msg, level),
        onDiagnostic: (event, data) => {
          const level = event.includes('fail') || event.includes('tripped') ? 'warn' : 'info';
          structuredLogger.log(level, event, data);
        },
        onFatalDisconnect: () => {
          callbacksRef.current.addLog?.('Connection recovery failed after 5 attempts. Terminating call.', 'error');
          endCall();
        },
        sendRenegotiation: async (msg) => {
          if (call.dataChannel && call.dataChannel.readyState === 'open') {
            try {
              call.dataChannel.send(JSON.stringify(msg));
            } catch (e: any) {}
          }
        },
        sdpTransform: (sdp) => {
          const currentTier = bitrateControllerRef.current.getCurrentTier();
          return transformOpusSdp(sdp, {
            bitrate: currentTier.maxBitrateBps,
            bandwidthCapKbps: currentTier.bandwidthCapKbps,
            ptime: currentTier.ptimeMs,
            maxptime: currentTier.maxPtimeMs,
            packetLossPerc: currentTier.fecPacketLossPerc,
            maxPlaybackRate: currentTier.maxPlaybackRate
          });
        }
      });
      iceRestartManagerRef.current = iceManager;

      pc.onsignalingstatechange = () => {
        computeAndSetSafetyCode();
      };

      pc.onconnectionstatechange = () => {
        computeAndSetSafetyCode();
        iceManager.handleStateChange(pc.connectionState, pc.iceConnectionState, pc, isCaller);
        if (pc.connectionState === 'connected') {
          turnRelayManagerRef.current.recordP2PSuccess();
        } else if (pc.connectionState === 'failed') {
          turnRelayManagerRef.current.recordP2PFailure();
        }
        if (pc.connectionState === 'closed') {
          endCall();
        }
      };

      pc.oniceconnectionstatechange = () => {
        computeAndSetSafetyCode();
        iceManager.handleStateChange(pc.connectionState, pc.iceConnectionState, pc, isCaller);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          turnRelayManagerRef.current.recordP2PSuccess();
        } else if (pc.iceConnectionState === 'failed') {
          turnRelayManagerRef.current.recordP2PFailure();
        }
      };

      // Instantiate NetworkTelemetryMonitor & wire to AdaptiveBitrateController
      if (telemetryMonitorRef.current) {
        telemetryMonitorRef.current.stop();
        telemetryMonitorRef.current = null;
      }

      const monitor = new NetworkTelemetryMonitor(pc, async (snapshot) => {
        setLiveTelemetry(snapshot);
        if (snapshot && snapshot.rttMs !== null && snapshot.rttMs !== undefined) {
          setQuality(getQualityRating(snapshot.rttSeconds));
        }

        // Dynamic Adaptive Headroom Scaling for Packet Pacer
        if (snapshot) {
          packetPacerRef.current.updateHeadroom({
            bufferOccupancy: snapshot.avgJitterBufferDelayMs ? Math.min(100, Math.round(snapshot.avgJitterBufferDelayMs / 2)) : undefined,
            loss: snapshot.effectiveLossRate,
            jitter: snapshot.jitterMs,
            rtt: snapshot.rttMs ?? undefined
          });
        }

        // Adaptive Bitrate & Jitter Buffer & Packet Pacing Evaluation
        const evaluation = bitrateControllerRef.current.evaluate(snapshot);
        if (evaluation.tierChanged) {
          setActiveTier(evaluation.currentTier);
          currentBitrateRef.current = evaluation.targetBitrateBps;
          const audioSender = pc.getSenders?.()?.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            await applySenderBitrate(audioSender, evaluation.targetBitrateBps);
            callbacksRef.current.addLog?.(evaluation.reason, 'info');
          }

          // 1. Dynamic Jitter Buffer Target Adjustment (NetEQ margin tuning)
          jitterControllerRef.current.applyForTier(evaluation.currentTier.name, pc);

          // 2. Packet Pacing & Traffic Shaping (router queue overflow prevention)
          await packetPacerRef.current.applyForTierObject(evaluation.currentTier, pc);
        }

          // 3. Dynamic 14 kbps Acoustic Quality Crossover Evaluation
          if (preferredCodec === 'auto') {
            const crossover = evaluateCodecCrossover({
              snapshot,
              currentCodec: activeCodec,
              consecutiveHealthyTicks: crossoverHealthyTicksRef.current,
              simdSupported: lyraWasmLoader.checkCompatibility().simd
            });
            crossoverHealthyTicksRef.current = crossover.consecutiveHealthyTicks;
            if (crossover.codecChanged) {
              lyraManager.setActiveCodec(crossover.targetCodec);
              setActiveCodec(crossover.targetCodec);
              callbacksRef.current.addLog?.(crossover.reason, 'info');
            }

            // Dynamic Lyra Bitrate Scaling (3.2 kbps to 9.2 kbps)
            if ((!crossover.codecChanged ? activeCodec : crossover.targetCodec) === 'lyra' && snapshot && snapshot.availableOutgoingBitrate) {
              const bps = snapshot.availableOutgoingBitrate;
              let targetLyraBitrate: LyraBitrate = 3200;
              if (bps >= 9200) targetLyraBitrate = 9200;
              else if (bps >= 6000) targetLyraBitrate = 6000;
              else targetLyraBitrate = 3200;
              
              const currentStats = lyraManager.getStats();
              if (currentStats && currentStats.bitrateBps !== targetLyraBitrate) {
                lyraManager.setBitrate(targetLyraBitrate);
                callbacksRef.current.addLog?.(`Lyra v2 dynamic scaled to ${targetLyraBitrate} bps`, 'info');
              }
            }
          }
      }, { intervalMs: TIMINGS.STATS_POLL_INTERVAL_MS || 1000 });

      monitor.start();
      telemetryMonitorRef.current = monitor;

      // Attach Lyra neural transform streams to audio senders and receivers
      try {
        const audioSenders = pc.getSenders?.()?.filter(s => s.track && s.track.kind === 'audio');
        if (audioSenders && audioSenders.length > 0) {
          audioSenders.forEach(s => lyraTransformController.attachSender(s));
        }
        const audioReceivers = pc.getReceivers?.()?.filter(r => r.track && r.track.kind === 'audio');
        if (audioReceivers && audioReceivers.length > 0) {
          audioReceivers.forEach(r => lyraTransformController.attachReceiver(r));
        }
      } catch (e: any) {
        console.warn('Lyra transform attachment notice:', e);
      }

      // Enforce constant-latency jitter buffer target and traffic pacing on startup
      const initialTier = bitrateControllerRef.current.getCurrentTier();
      jitterControllerRef.current.applyForTier(initialTier.name, pc);
      packetPacerRef.current.applyForTierObject(initialTier, pc).catch(() => {});
    };

    // Initialize immediately if peer connection already exists on call object
    setupPeerConnection();
    setTimeout(setupPeerConnection, 100);
    setTimeout(setupPeerConnection, 500);

    call.on('stream', (remoteStream) => {
      streamAttached = true;
      if (dialTimeoutRef.current) { clearTimeout(dialTimeoutRef.current); dialTimeoutRef.current = null; }

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(err => {
          console.warn('Playback error:', err);
        });
      }

      // Attach track ended listeners for instant hangup detection
      if (remoteStream && typeof remoteStream.getAudioTracks === 'function') {
        remoteStream.getAudioTracks().forEach(track => {
          track.onended = () => {
            callbacksRef.current.addLog?.('Remote audio track ended (Peer hung up)', 'info');
            endCall();
          };
        });
      }

      setIsInCall(true);
      setIsCalling(false);
      setConnectedPeer(call.peer);
      callbacksRef.current.onStatusChange?.('in-call');
      auditoryFeedback.notifyConnected();
      startTimer();
      saveCallHistory(call.peer);
      callbacksRef.current.addLog?.(`P2P encrypted audio stream connected with ${call.peer}`, 'ok');

      setupPeerConnection();
    });

    call.on('close', () => {
      if (!streamAttached) {
        auditoryFeedback.notifyBusy();
        callbacksRef.current.addLog?.(`Peer ${call.peer} is busy on another call or unavailable`, 'warn');
        callbacksRef.current.onStatusChange?.('busy');
        setTimeout(() => callbacksRef.current.onStatusChange?.('ready'), 3500);
      } else {
        callbacksRef.current.addLog?.(`Call ended by remote peer (${call.peer})`, 'info');
      }
      endCall();
    });

    call.on('error', (err) => {
      callbacksRef.current.addLog?.(`Call error: ${err?.message || err}`, 'error');
      endCall();
    });
  }, [endCall, isMuted, startTimer]);

  // Outgoing Call
  const startCall = useCallback(async (targetPeerId, peerInstance, myPeerId) => {
    if (!peerInstance || !targetPeerId || targetPeerId === myPeerId) return;

    try {
      setIsCalling(true);
      callbacksRef.current.onStatusChange?.('calling');
      callbacksRef.current.addLog?.(`Dialing encrypted call to ${targetPeerId}...`, 'info');
      structuredLogger.setSession(`call_${Date.now().toString(36)}`, targetPeerId);
      structuredLogger.info('call-dialing', { targetPeer: targetPeerId, initiator: myPeerId });

      const stream = await acquireMicrophone();
      const call = peerInstance.call(targetPeerId, stream, {
        sdpTransform: transformOpusSdp
      });

      if (!call) {
        throw new Error('Failed to initiate PeerJS call object');
      }

      call.options = { ...call.options, _isCaller: true };
      bindCallEvents(call);

      dialTimeoutRef.current = setTimeout(() => {
        callbacksRef.current.addLog?.(`No answer from ${targetPeerId} (timeout)`, 'warn');
        endCall();
      }, TIMINGS.OUTGOING_CALL_TIMEOUT_MS);
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        callbacksRef.current.addLog?.(`Could not initiate call: ${err.message}`, 'error');
      }
      setIsCalling(false);
      callbacksRef.current.onStatusChange?.('ready');
    }
  }, [acquireMicrophone, bindCallEvents, endCall]);

  // Incoming Call Handler
  const handleIncomingCall = useCallback((call) => {
    setIncomingCall(call);
    callbacksRef.current.addLog?.(`Incoming call from ${call.peer}`, 'warn');
    structuredLogger.setSession(`call_${Date.now().toString(36)}`, call?.peer);
    structuredLogger.info('call-incoming', { callerPeer: call?.peer });

    try {
      LocalNotifications.schedule({
        notifications: [{
          title: 'Incoming Encrypted Call',
          body: `Call from ${call.peer}`,
          id: 1122,
          autoCancel: true
        }]
      }).catch(() => {});
    } catch (e) {}

    stopRingtoneRef.current = playRingtone();

    incomingTimeoutRef.current = setTimeout(() => {
      callbacksRef.current.addLog?.(`Incoming call from ${call.peer} timed out`, 'info');
      try { call.close(); } catch (e: any) {}
      if (stopRingtoneRef.current) {
        stopRingtoneRef.current();
        stopRingtoneRef.current = null;
      }
      setIncomingCall(null);
      try { LocalNotifications.cancel({ notifications: [{ id: 1122 }] }).catch(() => {}); } catch(e) {}
    }, TIMINGS.INCOMING_CALL_TIMEOUT_MS);
  }, []);

  // Answer Incoming Call
  const answerCall = useCallback(async () => {
    const call = incomingCall;
    if (!call) return;

    if (stopRingtoneRef.current) {
      stopRingtoneRef.current();
      stopRingtoneRef.current = null;
    }
    setIncomingCall(null);
    try { LocalNotifications.cancel({ notifications: [{ id: 1122 }] }).catch(() => {}); } catch(e) {}
    if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }

    try {
      callbacksRef.current.addLog?.(`Answering call from ${call.peer}...`, 'info');
      const stream = await acquireMicrophone();
      call.options = { ...call.options, _isCaller: false };
      call.answer(stream, {
        sdpTransform: transformOpusSdp
      });
      setIsInCall(true);
      setIsCalling(false);
      setConnectedPeer(call.peer);
      callbacksRef.current.onStatusChange?.('in-call');
      startTimer();
      saveCallHistory(call.peer);
      bindCallEvents(call);
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        callbacksRef.current.addLog?.(`Failed to answer call: ${err.message}`, 'error');
      }
      endCall();
    }
  }, [incomingCall, acquireMicrophone, bindCallEvents, endCall]);

  // Decline Incoming Call
  const declineCall = useCallback(() => {
    if (incomingCall) {
      callbacksRef.current.addLog?.(`Declined incoming call from ${incomingCall.peer}`, 'info');
      if (stopRingtoneRef.current) {
        stopRingtoneRef.current();
        stopRingtoneRef.current = null;
      }
      if (incomingTimeoutRef.current) { clearTimeout(incomingTimeoutRef.current); incomingTimeoutRef.current = null; }
      try { incomingCall.close(); } catch (e: any) {}
      setIncomingCall(null);
      try { LocalNotifications.cancel({ notifications: [{ id: 1122 }] }).catch(() => {}); } catch(e) {}
    }
  }, [incomingCall]);

  // Cancel Outgoing Call
  const cancelCall = useCallback(() => {
    callbacksRef.current.addLog?.('Outgoing call cancelled by user', 'info');
    endCall();
  }, [endCall]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    const nextState = !isMuted;
    if (rawStreamRef.current) {
      rawStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !nextState; });
    }
    if (processedStreamRef.current) {
      processedStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !nextState; });
    }
    setIsMuted(nextState);
    callbacksRef.current.addLog?.(nextState ? 'Microphone muted' : 'Microphone unmuted', 'info');
  }, [isMuted]);

  const toggleSpeaker = useCallback(async (forcedMode) => {
    let mode;
    if (typeof forcedMode === 'string') {
      mode = forcedMode;
      setIsSpeakerOn(mode === 'speaker');
      setActiveOutputId(mode);
    } else if (typeof forcedMode === 'boolean') {
      mode = forcedMode ? 'speaker' : 'earpiece';
      setIsSpeakerOn(forcedMode);
      setActiveOutputId(mode);
    } else {
      const nextSpeakerState = !isSpeakerOn;
      setIsSpeakerOn(nextSpeakerState);
      mode = nextSpeakerState ? 'speaker' : 'earpiece';
      setActiveOutputId(mode);
    }

    const result = await setAudioOutputMode(mode, remoteAudioRef.current);
    if (result.success) {
      callbacksRef.current.addLog?.(`Audio output set to: ${mode}`, 'info');
    } else {
      callbacksRef.current.addLog?.(`Audio routing note: ${result.error || 'Default output retained'}`, 'warn');
    }
  }, [isSpeakerOn]);

  /**
   * Non-destructive microphone switching with automatic rollback on failure
   */
  const switchMicrophone = useCallback(async (newDeviceId) => {
    if (!callRef.current || !callRef.current.peerConnection) return false;

    let newStream = null;
    let newAudioCtx = null;

    try {
      callbacksRef.current.addLog?.('Acquiring replacement microphone track...', 'info');

      newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: newDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) throw new Error('No audio track obtained from new device');

      // Build new denoise pipeline with isolated AudioContext
      const { processedStream, audioCtx, nodes, cleanup } = createDenoisePipeline(newStream);
      newAudioCtx = audioCtx;
      const processedTrack = processedStream.getAudioTracks()[0];

      // Continuity of active mute state
      if (isMuted) {
        newStream.getAudioTracks().forEach(t => { t.enabled = false; });
        processedStream.getAudioTracks().forEach(t => { t.enabled = false; });
      }

      const pc = callRef.current.peerConnection;
      const audioSender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');

      if (!audioSender) {
        if (cleanup) {
          try { cleanup(); } catch (e: any) {}
        }
        stopMediaStream(newStream, newAudioCtx, nodes);
        throw new Error('No active audio sender found on RTCPeerConnection');
      }

      // Atomically swap track without SDP renegotiation
      await audioSender.replaceTrack(processedTrack);

      // SUCCESS: Clean up old stream, pipeline timers, and context now that new track is transmitting
      if (pipelineCleanupRef.current) {
        try { pipelineCleanupRef.current(); } catch (e: any) {}
      }
      stopMediaStream(rawStreamRef.current);
      stopMediaStream(processedStreamRef.current, audioCtxRef.current, pipelineNodesRef.current);

      rawStreamRef.current = newStream;
      processedStreamRef.current = processedStream;
      audioCtxRef.current = newAudioCtx;
      pipelineNodesRef.current = nodes;
      pipelineCleanupRef.current = cleanup;

      callbacksRef.current.addLog?.('Microphone switched seamlessly without renegotiation', 'ok');
      return true;

    } catch (err: any) {
      // ROLLBACK: Clean up the aborted attempt, keeping existing active call tracks intact
      if (newStream) stopMediaStream(newStream, newAudioCtx);

      callbacksRef.current.addLog?.(`Microphone switch aborted (retaining current mic): ${err.message}`, 'error');
      return false;
    }
  }, [isMuted]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  return {
    remoteAudioRef,
    activeStream: processedStreamRef.current || rawStreamRef.current,
    isInCall,
    isCalling,
    connectedPeer,
    isMuted,
    isSpeakerOn,
    activeOutputId,
    quality,
    callDuration,
    incomingCall,
    safetyCode,
    isVerified,
    setIsVerified,
    activeTier,
    liveTelemetry,
    activeCodec,
    preferredCodec,
    setPreferredCodec,
    lyraStats: lyraManager.getStats(),
    startCall,
    cancelCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    switchMicrophone,
    handleIncomingCall
  };
}
