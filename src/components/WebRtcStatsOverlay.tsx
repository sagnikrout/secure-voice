import React, { useState, useEffect } from 'react';
import { Activity, X, Wifi, Shield, Cpu, Zap, Radio, Layers, Gauge } from 'lucide-react';
import { OPUS_CONFIG, LADDER_TIERS } from '../constants/config';

/**
 * Real-time In-App WebRTC Diagnostic & Stats Inspector Overlay
 */
export default function WebRtcStatsOverlay({ isOpen, onClose, callSession }) {
  const [statsData, setStatsData] = useState({
    rttMs: 0,
    packetsLost: 0,
    packetsReceived: 0,
    downlinkLossPct: '0.0',
    uplinkLossPct: '0.0',
    lossPercentage: '0.0',
    jitterMs: 0,
    jitterBufferDelayMs: 0,
    concealmentPct: '0.0',
    tierName: 'HQ',
    tierBitrateKbps: 8,
    candidateType: 'HOST (UDP)',
    audioLevel: 0,
    codec: 'Opus 8kHz SILK Mono (CBR)',
    ptime: `${OPUS_CONFIG.PTIME || 80}ms`,
    fec: OPUS_CONFIG.USE_INBAND_FEC === '1' ? 'Enabled' : 'Disabled',
    red: OPUS_CONFIG.ENABLE_RED ? 'Active (RFC 2198)' : 'Disabled'
  });

  useEffect(() => {
    if (!isOpen || !callSession?.isInCall) return;

    // Synchronize directly from callSession if telemetry is available
    if (callSession.liveTelemetry) {
      const tel = callSession.liveTelemetry;
      const tier = callSession.activeTier || LADDER_TIERS[0];
      setStatsData(prev => ({
        ...prev,
        rttMs: tel.rttMs || 0,
        packetsLost: tel.totalPacketsLost || 0,
        packetsReceived: tel.totalPacketsReceived || 0,
        downlinkLossPct: ((tel.inboundLossRate || 0) * 100).toFixed(1),
        uplinkLossPct: ((tel.outboundLossRate || 0) * 100).toFixed(1),
        lossPercentage: (((tel.effectiveLossRate || tel.inboundLossRate || 0)) * 100).toFixed(1),
        jitterMs: tel.jitterMs || 0,
        jitterBufferDelayMs: tel.avgJitterBufferDelayMs || 0,
        concealmentPct: ((tel.concealmentRatio || 0) * 100).toFixed(1),
        tierName: tier.name || 'STD',
        tierBitrateKbps: Math.round((tier.maxBitrateBps || 14000) / 1000),
        candidateType: `${(tel.candidateType || 'host').toUpperCase()} (${(tel.protocol || 'udp').toUpperCase()})`,
        audioLevel: tel.audioLevel ? Math.round(tel.audioLevel * 100) : 0,
        ptime: `${tier.ptimeMs || OPUS_CONFIG.PTIME || 40}ms`
      }));
    }

    const intervalId = setInterval(async () => {
      const pc = window.__SECUREVOICE_ACTIVE_PC__;
      if (!pc || typeof pc.getStats !== 'function') return;

      try {
        const stats = await pc.getStats();
        let rtt = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let candidateType = 'HOST (UDP)';
        let audioLevel = 0;
        let jitterMs = 0;
        let jitterBufferDelayMs = 0;
        let concealedSamples = 0;
        let totalSamplesReceived = 0;
        let outboundFractionLost = 0;

        stats.forEach(report => {
          if (!report) return;
          if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated)) {
            if (report.currentRoundTripTime !== undefined) {
              rtt = Math.round(report.currentRoundTripTime * 1000);
            }
          }
          if (report.type === 'remote-candidate' || report.type === 'local-candidate') {
            if (report.candidateType) {
              candidateType = `${report.candidateType.toUpperCase()} (${(report.protocol || 'UDP').toUpperCase()})`;
            }
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            packetsLost = Number(report.packetsLost) || 0;
            packetsReceived = Number(report.packetsReceived) || 0;
            audioLevel = report.audioLevel ? Math.round(report.audioLevel * 100) : 0;
            if (report.jitter !== undefined) {
              jitterMs = Math.round(report.jitter * 1000);
            }
            if (report.jitterBufferDelay && report.jitterBufferEmittedCount) {
              jitterBufferDelayMs = Math.round((report.jitterBufferDelay / report.jitterBufferEmittedCount) * 1000);
            }
            concealedSamples = Number(report.concealedSamples) || 0;
            totalSamplesReceived = Number(report.totalSamplesReceived) || 0;
          }
          if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
            if (report.fractionLost !== undefined) {
              outboundFractionLost = (report.fractionLost / 256) * 100;
            }
          }
        });

        const total = packetsLost + packetsReceived;
        const downlinkLoss = total > 0 ? ((packetsLost / total) * 100).toFixed(1) : '0.0';
        const concealmentRatio = totalSamplesReceived > 0 ? ((concealedSamples / totalSamplesReceived) * 100).toFixed(1) : '0.0';

        const tier = callSession.activeTier || LADDER_TIERS[0];

        setStatsData(prev => ({
          ...prev,
          rttMs: rtt || prev.rttMs,
          packetsLost: packetsLost || prev.packetsLost,
          packetsReceived: packetsReceived || prev.packetsReceived,
          downlinkLossPct: downlinkLoss,
          uplinkLossPct: outboundFractionLost.toFixed(1),
          lossPercentage: downlinkLoss,
          jitterMs: jitterMs || prev.jitterMs,
          jitterBufferDelayMs: jitterBufferDelayMs || prev.jitterBufferDelayMs,
          concealmentPct: concealmentRatio,
          tierName: tier.name || prev.tierName,
          tierBitrateKbps: Math.round((tier.maxBitrateBps || 14000) / 1000),
          candidateType,
          audioLevel
        }));
      } catch (e) {}
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isOpen, callSession?.isInCall, callSession?.liveTelemetry, callSession?.activeTier]);

  if (!isOpen) return null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="stats-overlay-title" onClick={onClose}>
      <div className="overlay-card modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div className="modal-title-box">
            <Activity className="w-5 h-5 text-blue" />
            <span id="stats-overlay-title" className="modal-title">Live WebRTC Telemetry</span>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Close diagnostics"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          <div style={{ background: 'var(--bg)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Tier</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
              {statsData.tierName} <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({statsData.tierBitrateKbps}k)</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Latency (RTT)</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: statsData.rttMs > 250 ? 'var(--red)' : 'var(--green)' }}>
              {statsData.rttMs} <span style={{ fontSize: '11px' }}>ms</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Down / Up Loss</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: Number(statsData.downlinkLossPct) > 5 ? 'var(--red)' : 'var(--green)' }}>
              {statsData.downlinkLossPct}% <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/ {statsData.uplinkLossPct}%</span>
            </div>
          </div>
        </div>

        {/* Detailed Metrics List */}
        <div className="info-list" style={{ fontSize: '13px' }}>
          <div className="info-row">
            <div className="info-key-box">
              <Layers className="w-3.5 h-3.5 text-muted" />
              <span className="info-key">Jitter / Jitter Buffer</span>
            </div>
            <span className="info-val">{statsData.jitterMs} ms / {statsData.jitterBufferDelayMs} ms</span>
          </div>

          <div className="info-row">
            <div className="info-key-box">
              <Gauge className="w-3.5 h-3.5 text-muted" />
              <span className="info-key">Concealment Ratio</span>
            </div>
            <span className="info-val">{statsData.concealmentPct} %</span>
          </div>

          <div className="info-row">
            <div className="info-key-box">
              <Radio className="w-3.5 h-3.5 text-muted" />
              <span className="info-key">Transport Route</span>
            </div>
            <span className="info-val" style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{statsData.candidateType}</span>
          </div>

          <div className="info-row">
            <div className="info-key-box">
              <Zap className="w-3.5 h-3.5 text-muted" />
              <span className="info-key">Packetization (ptime)</span>
            </div>
            <span className="info-val">{statsData.ptime}</span>
          </div>

          <div className="info-row">
            <div className="info-key-box">
              <Shield className="w-3.5 h-3.5 text-muted" />
              <span className="info-key">Opus In-band FEC</span>
            </div>
            <span className="info-val">{statsData.fec}</span>
          </div>

          <div className="info-row">
            <div className="info-key-box">
              <Shield className="w-3.5 h-3.5 text-muted" />
              <span className="info-key">Redundant Audio (RED)</span>
            </div>
            <span className="info-val">{statsData.red}</span>
          </div>

          <div className="info-row">
            <div className="info-key-box">
              <Cpu className="w-3.5 h-3.5 text-muted" />
              <span className="info-key">Audio Codec</span>
            </div>
            <span className="info-val">{statsData.codec}</span>
          </div>

          <div className="info-row">
            <div className="info-key-box">
              <Wifi className="w-3.5 h-3.5 text-muted" />
              <span className="info-key">Bandwidth Target</span>
            </div>
            <span className="info-val">{OPUS_CONFIG.BANDWIDTH_CAP_KBPS} kbps (b=AS)</span>
          </div>
        </div>

        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Real-time diagnostics active · Polling every 1000ms
          </span>
        </div>
      </div>
    </div>
  );
}
