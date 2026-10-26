import { useEffect, useRef } from 'react';
import { StudioStage } from '../stage/StudioStage';
import { store } from '../core/store';
import { eventBus } from '../core/eventBus';
import type { StudioAgent } from '../core/types';

interface StageViewProps {
  selectedAgent?: StudioAgent | null;
  onCloseAgentHud?: () => void;
  onOpenAgentSkills?: (ag: StudioAgent) => void;
}

export default function StageView({
  selectedAgent,
  onCloseAgentHud,
  onOpenAgentSkills,
}: StageViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StudioStage | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const stage = new StudioStage();
    stageRef.current = stage;
    stage.mount(containerRef.current);

    const unsubCollab = eventBus.on(
      'stage:collaborate',
      (fromId: string, toId: string, d1: string, d2: string) => {
        stageRef.current?.collaborate(fromId, toId, d1, d2);
      }
    );

    const unsubCoffee = eventBus.on('stage:coffee', (agentId?: string) => {
      stageRef.current?.takeCoffeeBreak(agentId);
    });

    return () => {
      unsubCollab();
      unsubCoffee();
      stage.destroy();
      stageRef.current = null;
    };
  }, []);

  const handleCoffeeForAgent = (id: string) => {
    if (stageRef.current) {
      stageRef.current.takeCoffeeBreak(id);
    }
  };

  const handleCollabForAgent = (role: string) => {
    if (!stageRef.current) return;
    if (role === 'writer') {
      stageRef.current.collaborate(
        'writer',
        'critic',
        'Em vừa hoàn thiện 3 hook và kịch bản 2.4 từ/giây, gửi anh thẩm định nhé!',
        'Để tôi chấm điểm triết lý... 9.2/10, đạt chuẩn Safe-zone 9:16, duyệt cho sản xuất!'
      );
    } else if (role === 'critic') {
      stageRef.current.collaborate(
        'critic',
        'producer',
        'Kịch bản này đạt chuẩn triết lý rồi, chuyển sang Studio sản xuất dựng video nhé!',
        'Nhận kịch bản! Tôi bật ElevenLabs sinh voice và render Remotion ngay!'
      );
    } else if (role === 'producer') {
      stageRef.current.collaborate(
        'producer',
        'publisher',
        'Video 9:16 đã render xong và QA pass, gửi bạn lịch phát hành tối nay!',
        'Đã nhận file MP4! Tôi lên lịch khung giờ vàng 19:30 trên TikTok & Reels.'
      );
    } else {
      stageRef.current.collaborate(
        'planner',
        'writer',
        'Hôm nay ưu tiên khai thác bài viết số #00026 về chủ đề Tự Sinh!',
        'Vâng anh, em bắt đầu lên dàn bài và 3 phương án hook ngay!'
      );
    }
  };

  return (
    <div className="stage-wrapper">
      <div className="stage-container" ref={containerRef} />

      {/* Floating Agent Contextual HUD Card (khi click vào nhân vật bất kỳ) */}
      {selectedAgent && (
        <div className="agent-hud-card" style={{ borderColor: `${selectedAgent.color}88` }}>
          <div className="hud-header">
            <div className="hud-avatar" style={{ backgroundColor: selectedAgent.color }}>
              <span>{selectedAgent.statusIcon || '👤'}</span>
            </div>
            <div className="hud-title-box">
              <div className="hud-name" style={{ color: selectedAgent.color }}>
                {selectedAgent.name}
              </div>
              <div className="hud-dept">{selectedAgent.department}</div>
            </div>
            {onCloseAgentHud && (
              <button className="hud-close-btn" onClick={onCloseAgentHud} title="Đóng bảng nhân sự">
                ✕
              </button>
            )}
          </div>

          <div className="hud-thought">
            <span className="quote-mark">“</span>
            <span>{selectedAgent.thought || 'Đang sẵn sàng phối hợp thực hiện xuất bản video.'}</span>
            <span className="quote-mark">”</span>
          </div>

          <div className="hud-actions">
            <button
              className="hud-action-btn"
              onClick={() => handleCoffeeForAgent(selectedAgent.id)}
              title="Mời nhân sự này ra Creative Lounge pha cà phê giải lao"
            >
              ☕ Uống Cà Phê
            </button>

            <button
              className="hud-action-btn"
              onClick={() => handleCollabForAgent(selectedAgent.role)}
              title="Cho nhân sự mang tài liệu sang bàn đồng nghiệp trao đổi"
            >
              💬 Trao Đổi
            </button>

            {onOpenAgentSkills && (
              <button
                className="hud-action-btn hud-action-primary"
                onClick={() => onOpenAgentSkills(selectedAgent)}
                title="Tùy biến kỹ năng, Prompt và Mô hình AI cho nhân sự này"
              >
                🎭 Kỹ Năng & Model
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
