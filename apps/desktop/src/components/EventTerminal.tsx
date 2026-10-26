import { useEffect, useRef } from 'react';
import type { StudioEvent } from '../core/types';

interface EventTerminalProps {
  events: StudioEvent[];
  liveLogs: string[];
  onClose?: () => void;
}

export default function EventTerminal({ events, liveLogs, onClose }: EventTerminalProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [events, liveLogs]);

  const getAgentMeta = (agent: string) => {
    switch (agent.toLowerCase()) {
      case 'planner':
      case 'ingest':
        return { label: 'Trưởng Ban Nội Dung', color: '#06b6d4' };
      case 'writer':
        return { label: 'Biên Kịch', color: '#10b981' };
      case 'critic':
      case 'qa':
        return { label: 'Tổng Biên Tập', color: '#a855f7' };
      case 'producer':
      case 'render':
      case 'voice':
      case 'visual':
        return { label: 'Kỹ Sư Sản Xuất', color: '#eab308' };
      case 'publisher':
      case 'upload':
      case 'analytics':
        return { label: 'Điều Phối Phát Hành', color: '#22c55e' };
      default:
        return { label: agent, color: '#38bdf8' };
    }
  };

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <div className="terminal-header-left">
          <span className="live-dot-pulse"></span>
          <span className="terminal-title">LIVE EVENT AUDIT STREAM</span>
          <span className="terminal-badge">{events.length} sự kiện</span>
        </div>
        {onClose && (
          <button className="btn-close-drawer" onClick={onClose} title="Đóng bảng sự kiện">
            ✕
          </button>
        )}
      </div>

      <div className="terminal-logs" ref={boxRef}>
        {liveLogs.map((log, i) => (
          <div key={`live-${i}`} className="terminal-row live-row">
            <span className="log-prefix">⚡ [pipeline]</span>
            <span className="log-text">{log}</span>
          </div>
        ))}

        {events.map((e, idx) => {
          const meta = getAgentMeta(e.agent);
          return (
            <div key={idx} className="terminal-row">
              <span className="log-time">{e.ts ? e.ts.slice(11, 19) : ''}</span>
              <span className="log-agent" style={{ color: meta.color }}>
                [{meta.label}]
              </span>
              {e.video_id && <span className="log-vid">#{e.video_id}</span>}
              <span className={`log-text ${e.level === 'error' ? 'log-error' : ''}`}>
                {e.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
