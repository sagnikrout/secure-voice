import React, { useState, useEffect } from 'react';
import { Activity, X, Wifi, Shield, Cpu, Zap, Radio } from 'lucide-react';
import { OPUS_CONFIG } from '../constants/config';

/**
 * Real-time In-App WebRTC Diagnostic & Stats Inspector Overlay
 */
export default function WebRtcStatsOverlay({ isOpen, onClose, callSession }) {
  const [statsData, setStatsData] = useState({
    rttMs: 0,
    packetsLost: 0,
    packetsReceived: 0,
    lossPercentage: 0,
    currentBitrateKbps: 16,
    candidateType: 'host (Direct UDP)',
    audioLevel: 0,
    codec: 'Opus 48kHz Mono',
    ptime: `${OPUS_CONFIG.PTIME || 40}ms`,
    fec: OPUS_CONFIG.USE_INBAND_FEC === '1' ? 'Enabled (10%)' : 'Disabled'
  });

  useEffect(() => {
    if (!isOpen || !callSession?.isInCall) return;

    let intervalId = setInterval(async () => {
      // If we can read from the remote audio or callSession active peer connection
      const pc = window.__SECUREVOICE_ACTIVE_PC__;
      if (!pc || typeof pc.getStats !== 'function') return;

      try {
        const stats = await pc.getStats();
        let rtt = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let candidateType = 'Direct P2P';
        let audioLevel = 0;

        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = Math.round((report.currentRoundTripTime || 0) * 1000);
          }
          if (report.type === 'remote-candidate' || report.type === 'local-candidate') {
            if (report.candidateType) {
              candidateType = `${report.candidateType.toUpperCase()} (${report.protocol?.toUpperCase() || 'UDP'})`;
            }
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            packetsLost = report.packetsLost || 0;
            packetsReceived = report.packetsReceived || 0;
            audioLevel = report.audioLevel ? Math.round(report.audioLevel * 100) : 0;
          }
        });

        const total = packetsLost + packetsReceived;
        const lossPercentage = total > 0 ? ((packetsLost / total) * 100).toFixed(1) : 0;

        setStatsData(prev => ({
          ...prev,
          rttMs: rtt,
          packetsLost,
          packetsReceived,
          lossPercentage,
          candidateType,
          audioLevel
        }));
      } catch (e) {}
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isOpen, callSession?.isInCall]);

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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          <div style={{ background: 'var(--bg)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Latency (RTT)</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: statsData.rttMs > 250 ? 'var(--red)' : 'var(--green)' }}>
              {statsData.rttMs} <span style={{ fontSize: '12px' }}>ms</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Packet Loss</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: Number(statsData.lossPercentage) > 5 ? 'var(--red)' : 'var(--green)' }}>
              {statsData.lossPercentage} <span style={{ fontSize: '12px' }}>%</span>
            </div>
          </div>
        </div>

        <div className="info-list" style={{ fontSize: '13px' }}>
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
            Real-time diagnostics active · Updates every 1000ms
          </span>
        </div>
      </div>
    </div>
  );
}
