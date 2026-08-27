import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IceRestartManager } from '../utils/iceRestartManager';
import { createMockPeerConnection } from './iceRestart.test';

describe('IceRestartManager Circuit Breaker & Telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes in closed state with empty failure history', () => {
    const manager = new IceRestartManager();
    expect(manager.circuitBreakerState).toBe('closed');
    expect(manager.failureHistory).toHaveLength(0);
  });

  it('records failures and maintains history records with diagnostics', () => {
    const diagnosticEvents: Array<{ event: string; data: any }> = [];
    const manager = new IceRestartManager({
      onDiagnostic: (event, data) => diagnosticEvents.push({ event, data })
    });

    manager.recordFailure('Signaling timeout', new Error('Timeout 5000ms'), 1);

    expect(manager.failureHistory).toHaveLength(1);
    expect(manager.failureHistory[0].reason).toBe('Signaling timeout');
    expect(manager.failureHistory[0].attempt).toBe(1);
    expect(diagnosticEvents).toHaveLength(1);
    expect(diagnosticEvents[0].event).toBe('ice-restart-failure');
  });

  it('trips circuit breaker from closed to open when failure threshold is met', () => {
    const diagnosticEvents: Array<{ event: string; data: any }> = [];
    const manager = new IceRestartManager({
      circuitBreakerThreshold: 3,
      onDiagnostic: (event, data) => diagnosticEvents.push({ event, data })
    });

    manager.recordFailure('Fail 1');
    expect(manager.circuitBreakerState).toBe('closed');

    manager.recordFailure('Fail 2');
    expect(manager.circuitBreakerState).toBe('closed');

    manager.recordFailure('Fail 3');
    expect(manager.circuitBreakerState).toBe('open');

    const trippedEvent = diagnosticEvents.find(e => e.event === 'circuit-breaker-tripped');
    expect(trippedEvent).toBeDefined();
    expect(trippedEvent?.data.recentFailuresCount).toBe(3);
  });

  it('blocks reconnect attempts and emits diagnostic when circuit breaker is open', async () => {
    const diagnosticEvents: Array<{ event: string; data: any }> = [];
    const { pc } = createMockPeerConnection();
    const manager = new IceRestartManager({
      circuitBreakerThreshold: 2,
      circuitBreakerResetTime: 60000,
      onDiagnostic: (event, data) => diagnosticEvents.push({ event, data })
    });

    // Trip circuit breaker
    manager.recordFailure('Failure A');
    manager.recordFailure('Failure B');
    expect(manager.circuitBreakerState).toBe('open');

    // Attempt to start ICE restart while breaker is open
    await manager.startIceRestart(pc, true, 'Test Reconnect');

    const blockedEvent = diagnosticEvents.find(e => e.event === 'circuit-breaker-blocked');
    expect(blockedEvent).toBeDefined();
    expect(pc.createOffer).not.toHaveBeenCalled();
  });

  it('transitions to half-open after reset time has elapsed and probes reconnection', async () => {
    const diagnosticEvents: Array<{ event: string; data: any }> = [];
    const { pc } = createMockPeerConnection();
    const sendRenegotiation = vi.fn().mockResolvedValue(undefined);

    const manager = new IceRestartManager({
      circuitBreakerThreshold: 2,
      circuitBreakerResetTime: 30000,
      sendRenegotiation,
      onDiagnostic: (event, data) => diagnosticEvents.push({ event, data })
    });

    manager.recordFailure('Failure A');
    manager.recordFailure('Failure B');
    expect(manager.circuitBreakerState).toBe('open');

    // Advance past reset time (30s)
    vi.advanceTimersByTime(35000);

    // Trigger restart
    await manager.startIceRestart(pc, true, 'Probe Reconnect');

    expect(manager.circuitBreakerState).toBe('half-open');
    const halfOpenEvent = diagnosticEvents.find(e => e.event === 'circuit-breaker-half-open');
    expect(halfOpenEvent).toBeDefined();

    // Advance backoff timer for attempt 1 (1000ms)
    await vi.advanceTimersByTimeAsync(1100);
    expect(sendRenegotiation).toHaveBeenCalled();
  });

  it('recovers circuit breaker to closed on handleConnected', () => {
    const diagnosticEvents: Array<{ event: string; data: any }> = [];
    const manager = new IceRestartManager({
      circuitBreakerThreshold: 2,
      onDiagnostic: (event, data) => diagnosticEvents.push({ event, data })
    });

    manager.recordFailure('Fail 1');
    manager.recordFailure('Fail 2');
    expect(manager.circuitBreakerState).toBe('open');

    manager.handleConnected();

    expect(manager.circuitBreakerState).toBe('closed');
    expect(manager.failureHistory).toHaveLength(0);

    const resetEvent = diagnosticEvents.find(e => e.event === 'circuit-breaker-reset');
    expect(resetEvent).toBeDefined();
  });
});
