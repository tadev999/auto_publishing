import React from 'react';
import type { StudioAgent } from '../core/types';

interface AgentStatusStripProps {
  agents: StudioAgent[];
  onSelectAgent: (agent: StudioAgent) => void;
}

export default function AgentStatusStrip({ agents, onSelectAgent }: AgentStatusStripProps) {
  const workingAgent = agents.find((a) => a.status === 'working');
  const workingCount = agents.filter((a) => a.status === 'working').length;

  return (
    <div className="agent-status-strip">
      <div className="strip-header">
        <div className="strip-title-box">
          <span className="live-dot-beacon"></span>
          <span className="strip-label">TRẠNG THÁI 5 AGENT TRỰC CHIẾN</span>
        </div>
        <div className="strip-summary-tag">
          {workingCount > 0 ? (
            <span className="summary-working">
              ⚡ <b>{workingCount}</b> Agent đang làm việc
            </span>
          ) : (
            <span className="summary-idle">
              🟢 Toàn bộ <b>5</b> Agent đang rảnh rỗi
            </span>
          )}
        </div>
      </div>

      <div className="strip-agents-grid">
        {agents.map((ag) => {
          const isWorking = ag.status === 'working';
          const isRejected = ag.status === 'rejected';

          return (
            <div
              key={ag.id}
              className={`strip-agent-card ${isWorking ? 'is-working' : 'is-idle'}`}
              style={{
                borderColor: isWorking ? ag.color : undefined,
                boxShadow: isWorking ? `0 0 16px ${ag.color}33` : undefined,
              }}
              onClick={() => onSelectAgent(ag)}
              title={`Bấm để xem hồ sơ, kỹ năng & nhật ký của ${ag.name}`}
            >
              <div className="card-top">
                <div
                  className="agent-icon-box"
                  style={{
                    backgroundColor: isWorking ? `${ag.color}28` : 'rgba(255, 255, 255, 0.04)',
                    borderColor: isWorking ? ag.color : 'rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <span className="agent-emoji">{ag.statusIcon || (ag.role === 'writer' ? '✍️' : ag.role === 'critic' ? '⚖️' : ag.role === 'producer' ? '🎬' : ag.role === 'publisher' ? '🚀' : '📚')}</span>
                </div>

                <div className="agent-meta">
                  <div className="agent-role-name" style={{ color: isWorking ? '#ffffff' : 'var(--text-secondary)' }}>
                    {ag.name}
                  </div>
                  <div className="agent-dept">{ag.role.toUpperCase()}</div>
                </div>

                <div className="agent-status-badge">
                  {isWorking ? (
                    <span className="badge-working" style={{ color: ag.color, borderColor: `${ag.color}66` }}>
                      <span className="pulse-dot" style={{ backgroundColor: ag.color }}></span>
                      Đang xử lý
                    </span>
                  ) : isRejected ? (
                    <span className="badge-error">
                      ⚠️ Cần sửa
                    </span>
                  ) : (
                    <span className="badge-idle">
                      <span className="dot-green"></span>
                      Rảnh rỗi
                    </span>
                  )}
                </div>
              </div>

              <div className="card-bottom">
                <div className="action-text" title={ag.thought || ag.speech || ''}>
                  {isWorking ? (
                    <span className="text-active">
                      ⚡ <b>Nhiệm vụ:</b> {ag.thought || ag.speech || 'Đang thực thi quy trình...'}
                    </span>
                  ) : (
                    <span className="text-standby">
                      {ag.thought ? `“${ag.thought.slice(0, 48)}...”` : 'Sẵn sàng nhận nhiệm vụ tiếp theo'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
