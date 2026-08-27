import { describe, it, expect, beforeEach } from 'vitest';
import { StructuredLogger } from '../utils/structuredLogger';

describe('StructuredLogger (Diagnostics & Zero-Server Logging)', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger({ maxEntries: 10 });
  });

  it('records logs across all levels with timestamp and unique IDs', () => {
    const entry1 = logger.info('webrtc-init', { sdpSemantics: 'unified-plan' }, 'WebRTC initialized');
    const entry2 = logger.warn('packet-loss', { loss: 0.15 }, 'High loss detected');
    const entry3 = logger.error('ice-fail', { reason: 'turn unreachable' }, 'ICE Failed');
    const entry4 = logger.ok('call-connected', { peer: 'PEER-123' }, 'Connected');
    const entry5 = logger.debug('jitter-adjust', { targetDelay: 40 });

    expect(entry1.level).toBe('info');
    expect(entry2.level).toBe('warn');
    expect(entry3.level).toBe('error');
    expect(entry4.level).toBe('ok');
    expect(entry5.level).toBe('debug');

    expect(logger.getLogs()).toHaveLength(5);
  });

  it('sets and correlates session and peer identifiers', () => {
    logger.setSession('call_abc123', 'PEER_REMOTE_999');
    const entry = logger.info('media-acquired', { audioTracks: 1 });

    expect(entry.sessionId).toBe('call_abc123');
    expect(entry.peerId).toBe('PEER_REMOTE_999');
  });

  it('filters logs by level and event', () => {
    logger.info('ice-connected', { rtt: 50 });
    logger.warn('packet-loss', { loss: 0.1 });
    logger.error('ice-failed', { reason: 'timeout' });

    const warnLogs = logger.getLogs({ level: 'warn' });
    expect(warnLogs).toHaveLength(1);
    expect(warnLogs[0].event).toBe('packet-loss');

    const iceLogs = logger.getLogs({ event: 'ice' });
    expect(iceLogs).toHaveLength(2);
  });

  it('enforces circular buffer maximum entry limit', () => {
    const smallLogger = new StructuredLogger({ maxEntries: 3 });

    smallLogger.info('event-1');
    smallLogger.info('event-2');
    smallLogger.info('event-3');
    smallLogger.info('event-4');
    smallLogger.info('event-5');

    const logs = smallLogger.getLogs();
    expect(logs).toHaveLength(3);
    expect(logs[0].event).toBe('event-3');
    expect(logs[2].event).toBe('event-5');
  });

  it('redacts sensitive credentials during exportLogs', () => {
    logger.info('turn-allocated', {
      server: 'turn:openrelay.metered.ca',
      username: 'openrelayproject',
      credential: 'secret_turn_password_123',
      authKey: 'private_key_abc',
      password: 'mypassword',
      privateKey: 'dtls_key_data'
    });

    const exported = logger.exportLogs();
    const parsed = JSON.parse(exported);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].data.server).toBe('turn:openrelay.metered.ca');
    expect(parsed[0].data.username).toBeUndefined();
    expect(parsed[0].data.credential).toBeUndefined();
    expect(parsed[0].data.authKey).toBeUndefined();
    expect(parsed[0].data.password).toBeUndefined();
    expect(parsed[0].data.privateKey).toBeUndefined();
  });

  it('clears logs properly', () => {
    logger.info('event-1');
    logger.info('event-2');
    expect(logger.getLogs()).toHaveLength(2);

    logger.clearLogs();
    expect(logger.getLogs()).toHaveLength(0);
  });
});
