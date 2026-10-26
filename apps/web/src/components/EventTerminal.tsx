import { useEffect, useRef } from 'react';
import type { StudioEvent } from '../core/types';
import { eventAgentMeta } from '../core/config';

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

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <div className="terminal-header-left">
          <span className="live-dot-pulse"></span>
          <span className="terminal-title">events.log</span>
          <span className="terminal-badge">{events.length} sự kiện</span>
        </div>
        {onClose && (
          <button className="btn-close-drawer" onClick={onClose} title="Đóng bảng sự kiện">
            ✕
          </button>
        )}
      </div>

      <div className="terminal-logs" ref={boxRef}>
        {events.length === 0 && liveLogs.length === 0 && (
          <div className="terminal-empty">Chưa có sự kiện. Nhật ký sẽ xuất hiện khi agent nhận tác vụ.</div>
        )}
        {liveLogs.map((log, i) => (
          <div key={`live-${i}`} className="terminal-row live-row">
            <span className="log-prefix">[Hệ thống]</span>
            <span className="log-text">{log}</span>
          </div>
        ))}

        {events.map((e, idx) => {
          const meta = eventAgentMeta(e.agent);
          return (
            <div key={idx} className="terminal-row">
              <span className="log-time">{e.ts ? e.ts.slice(11, 19) : ''}</span>
              <span className="log-agent" title={`Mã công đoạn: ${e.agent}`} style={{ color: meta.color }}>
                [{meta.name}]
              </span>
              <span className="log-task">{meta.task}</span>
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
