import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import { generatePeerId } from '../utils/webrtc';
import { ICE_SERVERS, TIMINGS } from '../constants/config';
import { saveCallHistory } from '../components/RecentCalls';

/**
 * PeerJS signaling hook managing peer connectivity and incoming calls
 * @param {Object} options
 * @param {Function} options.addLog - Logging callback
 * @param {Function} options.onIncomingCall - Incoming call handler
 * @param {Function} options.isInActiveCall - Check if currently in a call
 * @param {Function} options.onRateLimitHit - Rate limit handler
 * @param {Function} options.onMissedCall - Missed call handler
 * @returns {Object} Peer instance and control methods
 */
export function usePeer({ addLog, onIncomingCall, isInActiveCall, onRateLimitHit, onMissedCall }) {
  const [myId, setMyId] = useState('');
  const [status, setStatus] = useState('connecting'); // connecting, ready, reconnecting, error
  const peerRef = useRef(null);
  const peerIdRef = useRef((() => {
    let id = localStorage.getItem('securevoice_my_id');
    if (!id) {
      id = generatePeerId();
      localStorage.setItem('securevoice_my_id', id);
    }
    return id;
  })());
  const retryCountRef = useRef(0);
  const lastIncomingCallTimeRef = useRef(0);
  const destroyedRef = useRef(false);

  // Store callbacks in a ref to avoid infinite re-initialization loops
  const callbacksRef = useRef({ addLog, onIncomingCall, isInActiveCall, onRateLimitHit, onMissedCall });
  useEffect(() => {
    callbacksRef.current = { addLog, onIncomingCall, isInActiveCall, onRateLimitHit, onMissedCall };
  }, [addLog, onIncomingCall, isInActiveCall, onRateLimitHit, onMissedCall]);

  /**
   * Initialize PeerJS connection with ICE servers
   */
  const initPeer = useCallback((idToRegister) => {
    if (destroyedRef.current) return;

    // Clean up existing peer
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
      callbacksRef.current.addLog?.(`Connected to signaling mesh. ID: ${id}`, 'ok');
    });

    peer.on('call', (incomingCall) => {
      if (destroyedRef.current) return;

      // Validate incoming call object
      if (!incomingCall || !incomingCall.peer) {
        callbacksRef.current.addLog?.('Invalid incoming call (missing peer ID)', 'error');
        try { incomingCall?.close(); } catch (e) {}
        return;
      }

      // Auto-reject Blocked Callers
      try {
        const blocked = JSON.parse(localStorage.getItem('securevoice_blocked') || '[]');
        if (blocked.includes(incomingCall.peer)) {
          callbacksRef.current.addLog?.(`Auto-rejected blocked caller: ${incomingCall.peer}`, 'warn');
          try { incomingCall.close(); } catch (e) {}
          return;
        }
      } catch(e) {}

      // Auto-reject if already busy in active call & record as Missed Call
      if (callbacksRef.current.isInActiveCall && callbacksRef.current.isInActiveCall()) {
        const callerPeer = incomingCall.peer;
        saveCallHistory(callerPeer, 'missed');
        callbacksRef.current.addLog?.(`Missed call from ${callerPeer} (Line Busy - Call Rejected)`, 'warn');
        callbacksRef.current.onMissedCall?.(callerPeer);
        try { incomingCall.close(); } catch (e) {}
        return;
      }

      // Global Rate limit check (mitigates ID spoofing & spam)
      const now = Date.now();
      if (now - lastIncomingCallTimeRef.current < TIMINGS.RATE_LIMIT_WINDOW_MS) {
        callbacksRef.current.addLog?.(`Global rate limit hit. Rejected spam call from ${incomingCall.peer}`, 'warn');
        try { incomingCall.close(); } catch (e) {}
        callbacksRef.current.onRateLimitHit?.();
        return;
      }
      lastIncomingCallTimeRef.current = now;

      callbacksRef.current.onIncomingCall?.(incomingCall);
    });

    peer.on('error', (err) => {
      if (destroyedRef.current) return;

      if (err.type === 'unavailable-id' && retryCountRef.current < TIMINGS.MAX_RETRY_ATTEMPTS) {
        retryCountRef.current += 1;
        const newId = generatePeerId();
        peerIdRef.current = newId;
        callbacksRef.current.addLog?.(`ID collision detected, retrying with new ID: ${newId}...`, 'info');
        setTimeout(() => initPeer(newId), 300 * retryCountRef.current);
      } else if (err.type === 'peer-unavailable') {
        callbacksRef.current.addLog?.('Peer unavailable or not found. Check the ID.', 'error');
        setStatus('error');
      } else {
        const errorMsg = err.type || err.message || 'Unknown PeerJS error';
        callbacksRef.current.addLog?.(`PeerJS signaling error: ${errorMsg}`, 'error');
        setStatus('error');
      }
    });

    peer.on('disconnected', () => {
      if (destroyedRef.current) return;
      setStatus('reconnecting');
      callbacksRef.current.addLog?.('Disconnected from signaling server. Attempting reconnect...', 'warn');
      try { peer.reconnect(); } catch (e) {}
    });

    peer.on('close', () => {
      if (destroyedRef.current) return;
      callbacksRef.current.addLog?.('PeerJS connection closed', 'warn');
      setStatus('error');
    });
  }, []);

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
