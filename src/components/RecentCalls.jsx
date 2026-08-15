import React, { useState, useEffect, useCallback, memo } from 'react';
import { Phone, Trash2, Clock } from 'lucide-react';
import { sanitizePeerId } from '../utils/webrtc';

const RECENT_KEY = 'secure_voice_recent_calls';
const MAX_RECENTS = 10;

function RecentCallsComponent({ onSelectPeer, currentPeerId }) {
  const [recents, setRecents] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setRecents(parsed.filter(item => item && typeof item.id === 'string' && item.id.length <= 16));
        }
      }
    } catch (e) {
      console.warn('Failed to load recent calls:', e);
    }
  }, []);

  const saveRecents = useCallback((list) => {
    setRecents(list);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save recent calls:', e);
    }
  }, []);

  const removeCall = useCallback((id, e) => {
    e.stopPropagation();
    setRecents(prev => {
      const updated = prev.filter(r => r.id !== id);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)); } catch (err) {}
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
          {filteredRecents.map(item => (
            <div
              key={item.id}
              className="recent-item"
              onClick={() => onSelectPeer(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectPeer(item.id)}
            >
              <div className="recent-avatar">
                {item.id.substring(0, 2)}
              </div>
              <div className="recent-info">
                <span className="recent-id">{item.id}</span>
                <span className="recent-time">
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="recent-actions">
                <button
                  type="button"
                  className="icon-call-btn"
                  title={`Call ${item.id}`}
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
          ))}
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

export function saveCallHistory(peerId) {
  if (!peerId || typeof peerId !== 'string') return;
  const cleanId = sanitizePeerId(peerId);
  if (!cleanId) return;

  try {
    const saved = localStorage.getItem(RECENT_KEY);
    const list = saved ? JSON.parse(saved) : [];
    const filtered = Array.isArray(list) ? list.filter(r => r && r.id !== cleanId) : [];
    const updated = [{ id: cleanId, timestamp: Date.now() }, ...filtered.slice(0, MAX_RECENTS - 1)];
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save call history:', e);
  }
}
