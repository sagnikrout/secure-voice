import React, { useState, useEffect } from 'react';
import { Phone, Trash2, Clock, Star, UserPlus } from 'lucide-react';

const RECENT_KEY = 'secure_voice_recent_calls';

export default function RecentCalls({ onSelectPeer, currentPeerId }) {
  const [recents, setRecents] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_KEY);
      if (saved) setRecents(JSON.parse(saved));
    } catch (e) {}
  }, []);

  const saveRecents = (list) => {
    setRecents(list);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) {}
  };

  const addCallToHistory = (peerId, name = '') => {
    if (!peerId) return;
    const existingIndex = recents.findIndex(r => r.id === peerId);
    let updated;
    if (existingIndex >= 0) {
      updated = [...recents];
      updated[existingIndex].timestamp = Date.now();
      if (name) updated[existingIndex].name = name;
    } else {
      updated = [
        { id: peerId, name: name || peerId, timestamp: Date.now() },
        ...recents.slice(0, 9)
      ];
    }
    saveRecents(updated);
  };

  const removeCall = (id, e) => {
    e.stopPropagation();
    saveRecents(recents.filter(r => r.id !== id));
  };

  const clearAll = () => {
    saveRecents([]);
  };

  if (recents.length === 0) return null;

  return (
    <div className="card recents-card">
      <div className="recents-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="recents-title">
          <Clock className="w-4 h-4 text-blue" />
          <span>Recent Contacts</span>
          <span className="recents-badge">{recents.length}</span>
        </div>
        <button className="recents-toggle">{isOpen ? '▲' : '▼'}</button>
      </div>

      {isOpen && (
        <div className="recents-body">
          {recents.map(item => (
            <div
              key={item.id}
              className="recent-item"
              onClick={() => onSelectPeer(item.id)}
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
                  className="icon-call-btn"
                  title={`Call ${item.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPeer(item.id);
                  }}
                >
                  <Phone className="w-3.5 h-3.5" />
                </button>
                <button
                  className="icon-delete-btn"
                  title="Remove from recents"
                  onClick={(e) => removeCall(item.id, e)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          <div className="recents-footer">
            <button className="clear-recents-btn" onClick={clearAll}>
              Clear History
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function saveCallHistory(peerId) {
  try {
    const saved = localStorage.getItem(RECENT_KEY);
    const list = saved ? JSON.parse(saved) : [];
    const filtered = list.filter(r => r.id !== peerId);
    const updated = [{ id: peerId, timestamp: Date.now() }, ...filtered.slice(0, 9)];
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch (e) {}
}
