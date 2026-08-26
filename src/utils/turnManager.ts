/**
 * TurnRelayManager — Adaptive TURN relay selection & proactive failover.
 *
 * Pings configured TURN servers using lightweight ephemeral RTCPeerConnections
 * to measure candidate gathering latency (RTT proxy). Fastest TURN servers
 * are prioritized in iceServers to expedite relay establishment.
 *
 * Tracks consecutive P2P failures and provides forced relay fallback
 * (iceTransportPolicy: 'relay') to bypass symmetric NAT or UDP blockage.
 */

import { ICE_SERVERS } from '../constants/config';

export class TurnRelayManager {
  iceServers: any[];
  onLog?: (msg: string, level?: string) => void;
  pingTimeoutMs: number;
  preferRelayOnFailCount: number;
  consecutiveP2PFailures: number;
  rankedTurnServers: any[] | null;
  lastRankTime: number;

  constructor(iceServerConfigs?: any[], options: any = {}) {
    this.iceServers = Array.isArray(iceServerConfigs)
      ? iceServerConfigs
      : (ICE_SERVERS?.iceServers || []);
    this.onLog = options.onLog;
    this.pingTimeoutMs = options.pingTimeoutMs || 4000;
    this.preferRelayOnFailCount = options.preferRelayOnFailCount || 2;

    this.consecutiveP2PFailures = 0;
    this.rankedTurnServers = null;
    this.lastRankTime = 0;
  }

  /**
   * Probe a single TURN server config to measure relay candidate discovery latency
   * @param {Object} serverConfig
   * @returns {Promise<{server: Object, latencyMs: number}>}
   */
  async probeTurnServer(serverConfig) {
    if (typeof RTCPeerConnection === 'undefined' || !serverConfig?.username || !serverConfig?.credential) {
      return { server: serverConfig, latencyMs: 100 };
    }

    const startTime = Date.now();
    return new Promise((resolve) => {
      let pc = null;
      let resolved = false;

      const finish = (latency: any) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        if (pc) {
          try {
            pc.onicecandidate = null;
            pc.onicegatheringstatechange = null;
            pc.close();
          } catch (e) {}
        }
        resolve({ server: serverConfig, latencyMs: latency });
      };

      const timer = setTimeout(() => {
        finish(Infinity);
      }, this.pingTimeoutMs);

      try {
        pc = new RTCPeerConnection({
          iceServers: [serverConfig],
          iceTransportPolicy: 'relay'
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const type = event.candidate.type;
            const candStr = event.candidate.candidate || '';
            if (type === 'relay' || candStr.includes('typ relay')) {
              finish(Date.now() - startTime);
            }
          }
        };

        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete' && !resolved) {
            finish(Infinity);
          }
        };

        pc.createDataChannel('probe');
        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .catch(() => finish(Infinity));
      } catch (err) {
        finish(Infinity);
      }
    });
  }

  /**
   * Rank all configured TURN servers by measured candidate gathering latency
   * @returns {Promise<Array<{server: Object, latencyMs: number}>>}
   */
  async rankServers() {
    const stunServers = [];
    const turnServers = [];

    for (const server of this.iceServers) {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls || ''];
      const isTurn = urls.some(u => typeof u === 'string' && (u.startsWith('turn:') || u.startsWith('turns:')));
      if (isTurn) {
        if (server.username && server.credential) {
          turnServers.push(server);
        }
      } else {
        stunServers.push(server);
      }
    }

    if (turnServers.length === 0) {
      return stunServers.map(s => ({ server: s, latencyMs: 0 }));
    }

    try {
      const probePromises = turnServers.map(s => this.probeTurnServer(s));
      const results: any = await Promise.all(probePromises);

      // Sort TURN servers by lowest latency
      results.sort((a: any, b: any) => a.latencyMs - b.latencyMs);
      this.rankedTurnServers = results.map((r: any) => r.server);
      this.lastRankTime = Date.now();

      const fastest = results[0];
      if (fastest && Number.isFinite(fastest.latencyMs)) {
        this.onLog?.(`TURN relay ping: selected fastest relay (${fastest.latencyMs}ms)`, 'info');
      }

      return [
        ...stunServers.map(s => ({ server: s, latencyMs: 0 })),
        ...results
      ];
    } catch (e) {
      return this.iceServers.map(s => ({ server: s, latencyMs: 0 }));
    }
  }

  /**
   * Get optimized RTCConfiguration with prioritized ICE servers
   * @param {boolean} [forceRelay=false]
   * @returns {Promise<{iceServers: Array<Object>, iceTransportPolicy: string}>}
   */
  async getBestIceConfig(forceRelay = false) {
    const shouldRelay = forceRelay || this.shouldForceRelay();
    const stunServers = [];
    const turnServers = [];

    for (const server of this.iceServers) {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls || ''];
      const isTurn = urls.some(u => typeof u === 'string' && (u.startsWith('turn:') || u.startsWith('turns:')));
      if (isTurn) {
        if (server.username && server.credential) {
          turnServers.push(server);
        }
      } else {
        stunServers.push(server);
      }
    }

    let orderedTurnServers = this.rankedTurnServers || turnServers;

    // Refresh ranking if not ranked yet
    if (!this.rankedTurnServers && turnServers.length > 1) {
      try {
        await this.rankServers();
        if (this.rankedTurnServers) {
          orderedTurnServers = this.rankedTurnServers;
        }
      } catch (e) {}
    }

    const mergedIceServers = shouldRelay
      ? [...orderedTurnServers]
      : [...stunServers, ...orderedTurnServers];

    return {
      iceServers: mergedIceServers,
      iceTransportPolicy: shouldRelay ? 'relay' : 'all'
    };
  }

  /**
   * Record a failed P2P connection attempt
   */
  recordP2PFailure() {
    this.consecutiveP2PFailures += 1;
    if (this.consecutiveP2PFailures >= this.preferRelayOnFailCount) {
      this.onLog?.(`P2P failed ${this.consecutiveP2PFailures} times. Forcing TURN relay mode.`, 'warn');
    }
  }

  /**
   * Record a successful P2P connection
   */
  recordP2PSuccess() {
    this.consecutiveP2PFailures = 0;
  }

  /**
   * Check if relay should be forced
   * @returns {boolean}
   */
  shouldForceRelay() {
    return this.consecutiveP2PFailures >= this.preferRelayOnFailCount;
  }

  /**
   * Reset failure counter
   */
  reset() {
    this.recordP2PSuccess();
  }
}
