import { useEffect, useRef } from 'react';
import { StudioStage } from '../stage/StudioStage';
import { store } from '../core/store';
import { eventBus } from '../core/eventBus';

interface StageViewProps {
  onCollaborateTest: () => void;
}

export default function StageView({ onCollaborateTest }: StageViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StudioStage | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const stage = new StudioStage();
    stageRef.current = stage;
    stage.mount(containerRef.current);

    return () => {
      stage.destroy();
      stageRef.current = null;
    };
  }, []);

  const handleTestChat = () => {
    if (stageRef.current) {
      stageRef.current.collaborate(
        'writer',
        'critic',
        'Em vừa viết xong 3 hook cho bài kiệt sức mãn tính!',
        'Để tôi chấm điểm triết lý nhé... 9.3/10, duyệt!'
      );
    }
  };

  const handleOpenAgentSkill = (role: string) => {
    const ag = store.get().agents.find((a) => a.role === role);
    if (ag) {
      eventBus.emit('agent:select', ag);
    }
  };

  return (
    <div className="stage-wrapper">
      <div className="stage-container" ref={containerRef} />
      <div className="stage-overlay-bar">
        <div className="stage-info">
          <span className="live-indicator"></span>
          <span><b>10 AI Agents</b> đang trực chiến</span>
          <span className="stage-hint-tag">⚡ Bấm vào bất kỳ nhân vật nào để nạp kỹ năng</span>
        </div>
        <div className="stage-actions">
          <button className="btn-chip" onClick={handleTestChat} title="Mô phỏng 2 Agent trao đổi trực tiếp trên sân khấu">
            💬 Trò chuyện mẫu
          </button>
        </div>
      </div>
    </div>
  );
}
