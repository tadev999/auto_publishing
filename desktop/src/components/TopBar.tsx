import { useState } from 'react';
import { store } from '../core/store';

interface TopBarProps {
  onOpenDoctor: () => void;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
  onRunWalkthrough: () => void;
  onRunProduce: () => void;
  onRunPlan: () => void;
}

export default function TopBar({
  onOpenDoctor,
  onOpenSettings,
  onOpenSkills,
  onRunWalkthrough,
  onRunProduce,
  onRunPlan,
}: TopBarProps) {
  const [loading, setLoading] = useState(false);
  const stats = store.get().stats;

  const handleOpenRemotion = async () => {
    if (window.studioAPI) {
      await window.studioAPI.openRemotionStudio();
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <span className="brand-dot"></span>
          <span className="brand-title">ENDOGENISM STUDIO</span>
          <span className="brand-badge">MULTI-AGENT AI</span>
        </div>

        <div className="stats-strip">
          <div className="stat-pill">
            <span className="dot dot-blue"></span>
            <span>Lên lịch: <b>{stats.planned}</b></span>
          </div>
          <div className="stat-pill">
            <span className="dot dot-yellow"></span>
            <span>Duyệt: <b>{stats.approved}</b></span>
          </div>
          <div className="stat-pill">
            <span className="dot dot-purple"></span>
            <span>Đã dựng: <b>{stats.rendered}</b></span>
          </div>
          <div className="stat-pill">
            <span className="dot dot-green"></span>
            <span>Đã xuất bản: <b>{stats.published}</b></span>
          </div>
        </div>
      </div>

      <div className="topbar-right">
        <button
          className="btn btn-primary btn-glow"
          onClick={onRunWalkthrough}
          title="Chạy thử mô phỏng toàn bộ quy trình Offline"
        >
          🚀 Chạy Demo Offline
        </button>

        <button
          className="btn btn-secondary"
          onClick={onRunProduce}
          title="Sản xuất video theo kịch bản"
        >
          ⚡ Sản xuất (1)
        </button>

        <button
          className="btn btn-secondary"
          onClick={onRunPlan}
          title="Lên lịch tuần tự 7 ngày"
        >
          🗓️ Lên lịch
        </button>

        <button
          className="btn btn-secondary"
          onClick={handleOpenRemotion}
          title="Mở Remotion Studio để xem video template"
        >
          🎬 Remotion
        </button>

        <button
          className="btn btn-secondary btn-glow-purple"
          onClick={onOpenSkills}
          title="Tùy biến kỹ năng, Prompt và Mô hình AI cho từng nhân vật"
        >
          🎭 Kỹ Năng Agent
        </button>

        <button className="btn btn-ghost" onClick={onOpenDoctor} title="Kiểm tra công cụ & API keys">
          🩺 Doctor
        </button>

        <button className="btn btn-ghost" onClick={onOpenSettings} title="Cấu hình API Keys">
          ⚙️ Cài đặt
        </button>
      </div>
    </header>
  );
}
