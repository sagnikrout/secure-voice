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
  const peerRef = useRef<any>(null);
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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in a ref to avoid infinite re-initialization loops
  const callbacksRef = useRef({ addLog, onIncomingCall, isInActiveCall, onRateLimitHit, onMissedCall });
  useEffect(() => {
    callbacksRef.current = { addLog, onIncomingCall, isInActiveCall, onRateLimitHit, onMissedCall };
  }, [addLog, onIncomingCall, isInActiveCall, onRateLimitHit, onMissedCall]);

  /**
   * Safely dismantle an existing peer instance without triggering false state events
   */
  const dismantlePeer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (peerRef.current) {
      const oldPeer = peerRef.current;
      peerRef.current = null;
      try {
        oldPeer.removeAllListeners?.();
      } catch (e) {}
      try {
        if (!oldPeer.destroyed) {
          oldPeer.destroy();
        }
      } catch (e) {}
    }
  }, []);

  /**
   * Initialize PeerJS connection with ICE servers
   */
  const initPeer = useCallback((idToRegister: string) => {
    if (destroyedRef.current) return;

    // Completely silence and tear down any previous instance
    dismantlePeer();

    setStatus('connecting');
    const peer = new Peer(idToRegister, {
      config: ICE_SERVERS,
      debug: 0
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      if (destroyedRef.current || peerRef.current !== peer) return;
      retryCountRef.current = 0;
      setMyId(id);
      peerIdRef.current = id;
      localStorage.setItem('securevoice_my_id', id);
      setStatus('ready');
      callbacksRef.current.addLog?.(`Connected to signaling mesh. ID: ${id}`, 'ok');
    });

    peer.on('call', (incomingCall) => {
      if (destroyedRef.current || peerRef.current !== peer) return;

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

    peer.on('error', (err: any) => {
      if (destroyedRef.current || peerRef.current !== peer) return;

      if (err.type === 'unavailable-id') {
        // Handle ghost connections on reload/restart
        const maxRetries = 5;
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current += 1;
          const delays = [3000, 5000, 7000, 10000, 12000];
          const delay = delays[retryCountRef.current - 1] || 5000;
          callbacksRef.current.addLog?.(
            `ID is temporarily locked on server (ghost connection). Retrying ID: ${peerIdRef.current} in ${delay / 1000}s (attempt ${retryCountRef.current}/${maxRetries})...`,
            'info'
          );
          setStatus('connecting');
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (destroyedRef.current) return;
            initPeer(peerIdRef.current);
          }, delay);
        } else {
          // If 5 attempts spanning ~37s fail, the ID is truly occupied by another active device
          callbacksRef.current.addLog?.('ID permanently collision-locked. Generating new permanent ID...', 'warn');
          retryCountRef.current = 0;
          const newId = generatePeerId();
          peerIdRef.current = newId;
          localStorage.setItem('securevoice_my_id', newId);
          initPeer(newId);
        }
        return;
      }

      if (err.type === 'peer-unavailable') {
        callbacksRef.current.addLog?.('Peer unavailable or not found. Check the ID.', 'error');
        setStatus('error');
        return;
      }

      const errorMsg = err.type || err.message || 'Unknown PeerJS error';
      callbacksRef.current.addLog?.(`PeerJS signaling error: ${errorMsg}`, 'error');
      setStatus('error');
    });

    peer.on('disconnected', () => {
      if (destroyedRef.current || peerRef.current !== peer) return;
      setStatus('reconnecting');
      callbacksRef.current.addLog?.('Disconnected from signaling server. Attempting reconnect...', 'warn');

      // Controlled debounce reconnect, avoiding tight error loops
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (destroyedRef.current || peerRef.current !== peer) return;
        if (!peer.destroyed && peer.disconnected) {
          try {
            peer.reconnect();
          } catch (e) {
            initPeer(peerIdRef.current);
          }
        }
      }, 2500);
    });

    peer.on('close', () => {
      if (destroyedRef.current || peerRef.current !== peer) return;
      callbacksRef.current.addLog?.('PeerJS connection closed', 'warn');
      setStatus('error');
    });
  }, [dismantlePeer]);

  useEffect(() => {
    destroyedRef.current = false;
    initPeer(peerIdRef.current);

    const handleBeforeUnload = () => {
      dismantlePeer();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !destroyedRef.current) {
        // App returned to foreground: if peer is disconnected, probe clean reconnection
        if (peerRef.current && peerRef.current.disconnected && !peerRef.current.destroyed) {
          try {
            peerRef.current.reconnect();
          } catch (e) {
            initPeer(peerIdRef.current);
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      destroyedRef.current = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      dismantlePeer();
    };
  }, [initPeer, dismantlePeer]);

  return {
    peer: peerRef.current,
    myId,
    status,
    setStatus,
    reconnect: () => {
      retryCountRef.current = 0;
      initPeer(peerIdRef.current);
    }
  };
}
