import React, { useState, useEffect, useCallback, memo } from 'react';
import { Phone, PhoneMissed, Trash2, Clock } from 'lucide-react';
import { sanitizePeerId, formatTimestamp } from '../utils/formatters';
import { STORAGE_KEYS, TIMINGS } from '../constants/config';

const EVENT_RECENT_CALLS_UPDATED = 'securevoice:recent_calls_updated';

function RecentCallsComponent({ onSelectPeer, currentPeerId }) {
  const [recents, setRecents] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  const loadRecents = useCallback(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEYS.RECENT_CALLS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setRecents(parsed.filter(item => item && typeof item.id === 'string' && item.id.length <= 16));
        }
      } else {
        setRecents([]);
      }
    } catch (e) {
      console.warn('Failed to load recent calls:', e);
    }
  }, []);

  useEffect(() => {
    loadRecents();
    window.addEventListener(EVENT_RECENT_CALLS_UPDATED, loadRecents);
    return () => {
      window.removeEventListener(EVENT_RECENT_CALLS_UPDATED, loadRecents);
    };
  }, [loadRecents]);

  const saveRecents = useCallback((list) => {
    setRecents(list);
    try {
      sessionStorage.setItem(STORAGE_KEYS.RECENT_CALLS, JSON.stringify(list));
      window.dispatchEvent(new Event(EVENT_RECENT_CALLS_UPDATED));
    } catch (e) {
      console.warn('Failed to save recent calls:', e);
    }
  }, []);

  const removeCall = useCallback((id, e) => {
    e.stopPropagation();
    setRecents(prev => {
      const updated = prev.filter(r => r.id !== id);
      try {
        sessionStorage.setItem(STORAGE_KEYS.RECENT_CALLS, JSON.stringify(updated));
        window.dispatchEvent(new Event(EVENT_RECENT_CALLS_UPDATED));
      } catch (err) {}
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    saveRecents([]);
  }, [saveRecents]);

  const filteredRecents = recents.filter(item => item.id !== currentPeerId);

  if (filteredRecents.length === 0) return null;

  return (
    <div className="card recents-card">
      <div
        className="recents-header"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsOpen(!isOpen)}
      >
        <div className="recents-title">
          <Clock className="w-4 h-4 text-blue" />
          <span>Recent Contacts</span>
          <span className="recents-badge">{filteredRecents.length}</span>
        </div>
        <span className="recents-toggle">{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div className="recents-body">
          {filteredRecents.map(item => {
            const isMissed = item.type === 'missed';
            return (
              <div
                key={item.id}
                className={`recent-item ${isMissed ? 'missed' : ''}`}
                onClick={() => onSelectPeer(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectPeer(item.id)}
              >
                <div className={`recent-avatar ${isMissed ? 'missed' : ''}`}>
                  {item.id.substring(0, 2)}
                </div>
                <div className="recent-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="recent-id">{item.id}</span>
                    {isMissed && (
                      <span className="recent-tag-missed">
                        <PhoneMissed className="w-3 h-3" />
                        Missed
                      </span>
                    )}
                  </div>
                  <span className="recent-time">
                    {formatTimestamp(item.timestamp) || new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="recent-actions">
                  <button
                    type="button"
                    className={`icon-call-btn ${isMissed ? 'icon-call-btn-missed' : ''}`}
                    title={`Call back ${item.id}`}
                    aria-label={`Call ${item.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPeer(item.id);
                    }}
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="icon-delete-btn"
                    title="Remove from recents"
                    aria-label={`Remove ${item.id} from recents`}
                    onClick={(e) => removeCall(item.id, e)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="recents-footer">
            <button type="button" className="clear-recents-btn" onClick={clearAll}>
              Clear History
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const RecentCalls = memo(RecentCallsComponent);
export default RecentCalls;

/**
 * Persist call history record into sessionStorage.
 * @param {string} peerId
 * @param {'connected' | 'missed'} [type='connected']
 */
export function saveCallHistory(peerId, type = 'connected') {
  if (!peerId || typeof peerId !== 'string') return;
  const cleanId = sanitizePeerId(peerId);
  if (!cleanId) return;

  try {
    const saved = sessionStorage.getItem(STORAGE_KEYS.RECENT_CALLS);
    const list = saved ? JSON.parse(saved) : [];
    const filtered = Array.isArray(list) ? list.filter(r => r && r.id !== cleanId) : [];
    const updated = [
      { id: cleanId, timestamp: Date.now(), type },
      ...filtered.slice(0, TIMINGS.MAX_RECENT_CALLS - 1)
    ];
    sessionStorage.setItem(STORAGE_KEYS.RECENT_CALLS, JSON.stringify(updated));
    window.dispatchEvent(new Event(EVENT_RECENT_CALLS_UPDATED));
  } catch (e) {
    console.warn('Failed to save call history:', e);
  }
}
