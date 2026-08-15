import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import { generatePeerId } from '../utils/webrtc';
import { ICE_SERVERS, TIMINGS } from '../constants/config';

export function usePeer({ addLog, onIncomingCall, isInActiveCall }) {
  const [myId, setMyId] = useState('');
  const [status, setStatus] = useState('connecting'); // connecting, ready, reconnecting, error
  const peerRef = useRef(null);
  const peerIdRef = useRef(generatePeerId());
  const retryCountRef = useRef(0);
  const rateLimitMapRef = useRef({});
  const destroyedRef = useRef(false);

  const initPeer = useCallback((idToRegister) => {
    if (destroyedRef.current) return;

    if (peerRef.current && !peerRef.current.destroyed) {
      try { peerRef.current.destroy(); } catch (e) {}
    }

    setStatus('connecting');
    const peer = new Peer(idToRegister, {
      config: ICE_SERVERS,
      debug: 0
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      if (destroyedRef.current) return;
      retryCountRef.current = 0;
      setMyId(id);
      setStatus('ready');
      addLog?.(`Connected to signaling mesh. ID: ${id}`, 'ok');
    });

    peer.on('call', (incomingCall) => {
      if (destroyedRef.current) return;

      // Auto-reject if already busy in active call
      if (isInActiveCall && isInActiveCall()) {
        addLog?.(`Auto-declined incoming call from ${incomingCall.peer} (Line Busy)`, 'warn');
        try { incomingCall.close(); } catch (e) {}
        return;
      }

      // Rate limit check
      const now = Date.now();
      const lastCallTime = rateLimitMapRef.current[incomingCall.peer] || 0;
      if (now - lastCallTime < TIMINGS.RATE_LIMIT_WINDOW_MS) {
        addLog?.(`Rate-limited rapid call from ${incomingCall.peer}`, 'warn');
        try { incomingCall.close(); } catch (e) {}
        return;
      }
      rateLimitMapRef.current[incomingCall.peer] = now;

      onIncomingCall?.(incomingCall);
    });

    peer.on('error', (err) => {
      if (destroyedRef.current) return;

      if (err.type === 'unavailable-id' && retryCountRef.current < TIMINGS.MAX_RETRY_ATTEMPTS) {
        retryCountRef.current += 1;
        const newId = generatePeerId();
        peerIdRef.current = newId;
        addLog?.(`ID collision detected, retrying with new ID: ${newId}...`, 'info');
        setTimeout(() => initPeer(newId), 300 * retryCountRef.current);
      } else if (err.type === 'peer-unavailable') {
        addLog?.('Peer unavailable or not found. Check the ID.', 'error');
      } else {
        addLog?.(`PeerJS signaling error: ${err.type || err.message}`, 'error');
        setStatus('error');
      }
    });

    peer.on('disconnected', () => {
      if (destroyedRef.current) return;
      setStatus('reconnecting');
      addLog?.('Disconnected from signaling server. Attempting reconnect...', 'warn');
      try { peer.reconnect(); } catch (e) {}
    });
  }, [addLog, onIncomingCall, isInActiveCall]);

  useEffect(() => {
    destroyedRef.current = false;
    initPeer(peerIdRef.current);

    return () => {
      destroyedRef.current = true;
      if (peerRef.current && !peerRef.current.destroyed) {
        try { peerRef.current.destroy(); } catch (e) {}
      }
    };
  }, [initPeer]);

  return {
    peer: peerRef.current,
    myId,
    status,
    setStatus,
    reconnect: () => initPeer(generatePeerId())
  };
}
