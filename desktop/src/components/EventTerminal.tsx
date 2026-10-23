import { useEffect, useRef } from 'react';
import type { StudioEvent } from '../core/types';

interface EventTerminalProps {
  events: StudioEvent[];
  liveLogs: string[];
}

export default function EventTerminal({ events, liveLogs }: EventTerminalProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [events, liveLogs]);

  const getAgentColor = (agent: string) => {
    switch (agent.toLowerCase()) {
      case 'writer':
        return '#10b981';
      case 'critic':
        return '#a855f7';
      case 'voice':
        return '#eab308';
      case 'visual':
        return '#0ea5e9';
      case 'render':
        return '#6366f1';
      case 'qa':
        return '#ec4899';
      case 'publisher':
        return '#22c55e';
      default:
        return '#38bdf8';
    }
  };

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="terminal-title">LIVE EVENT AUDIT STREAM</span>
        <span className="terminal-badge">{events.length} sự kiện</span>
      </div>

      <div className="terminal-logs" ref={boxRef}>
        {liveLogs.map((log, i) => (
          <div key={`live-${i}`} className="terminal-row live-row">
            <span className="log-prefix">⚡ [pipeline]</span>
            <span className="log-text">{log}</span>
          </div>
        ))}

        {events.map((e, idx) => {
          const color = getAgentColor(e.agent);
          return (
            <div key={idx} className="terminal-row">
              <span className="log-time">{e.ts ? e.ts.slice(11, 19) : ''}</span>
              <span className="log-agent" style={{ color }}>
                [{e.agent}]
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
