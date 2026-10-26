import { useState, useRef, useEffect } from 'react';
import { store } from '../core/store';

interface TopBarProps {
  onOpenDoctor: () => void;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
  onRunWalkthrough: () => void;
  onRunProduce: () => void;
  onRunPlan: () => void;
  onRunPublish?: () => void;
  onCoffeeBreak?: () => void;
  onOpenReset: () => void;
  onStopAll?: () => void;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
}

export default function TopBar({
  onOpenDoctor,
  onOpenSettings,
  onOpenSkills,
  onRunWalkthrough,
  onRunProduce,
  onRunPlan,
  onRunPublish,
  onCoffeeBreak,
  onOpenReset,
  onStopAll,
  terminalOpen,
  onToggleTerminal,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const stats = store.get().stats;

  // Đóng menu khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleOpenRemotion = async () => {
    setMenuOpen(false);
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

        {/* Nhịp Tim Hệ Thống (Ambient Heartbeat Summary) */}
        <div className="ambient-heartbeat">
          <span className="live-dot-pulse"></span>
          <span className="heartbeat-text">
            <b>5 Siêu AI</b> đang trực chiến
          </span>
          <span className="heartbeat-sep">•</span>
          <span className="heartbeat-item"><b>{stats.planned}</b> lên lịch</span>
          <span className="heartbeat-sep">•</span>
          <span className="heartbeat-item"><b>{stats.rendered}</b> đã dựng</span>
          <span className="heartbeat-sep">•</span>
          <span className="heartbeat-item highlight-green"><b>{stats.published}</b> đã xuất bản</span>
        </div>
      </div>

      <div className="topbar-right">
        {/* Nút Toggle Live Event Stream song song sân khấu */}
        {onToggleTerminal && (
          <button
            className={`btn btn-secondary ${terminalOpen ? 'active' : ''}`}
            onClick={onToggleTerminal}
            title={terminalOpen ? 'Thu gọn bảng Live Event' : 'Mở bảng Live Event song song với văn phòng Agent'}
            style={{
              borderColor: terminalOpen ? '#38bdf8' : undefined,
              background: terminalOpen ? 'rgba(56, 189, 248, 0.15)' : undefined,
            }}
          >
            <span className="live-dot-pulse" style={{ width: 6, height: 6 }}></span>
            <span>Live Event</span>
            <span style={{ fontSize: 10, opacity: 0.8 }}>{terminalOpen ? '◂ Thu gọn' : '▸ Mở'}</span>
          </button>
        )}

        {/* Nút Hero Action Chính Duy Nhất */}
        <button
          className="btn btn-hero btn-glow"
          onClick={onRunWalkthrough}
          title="Chạy mô phỏng toàn bộ quy trình: Lên bài -> Kịch bản -> Thẩm định -> Remotion -> Phát hành"
        >
          <span className="btn-icon">⚡</span>
          <span>Chạy Tự Động (Auto-Pilot)</span>
        </button>

        {/* Menu Công Cụ & Cài Đặt Tinh Gọn */}
        <div className="tools-dropdown-wrapper" ref={menuRef}>
          <button
            className={`btn btn-secondary ${menuOpen ? 'active' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            title="Mở bảng điều khiển tác vụ & cài đặt hệ thống"
          >
            <span>⚙️ Công cụ</span>
            <span className="dropdown-arrow">{menuOpen ? '▴' : '▾'}</span>
          </button>

          {menuOpen && (
            <div className="tools-dropdown-popover">
              <div className="dropdown-group-title">QUY TRÌNH SẢN XUẤT</div>
              <button
                className="dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  onRunProduce();
                }}
              >
                <span className="item-icon">🎬</span>
                <div className="item-info">
                  <div className="item-title">Sản xuất 1 Video</div>
                  <div className="item-desc">Dựng video theo kịch bản chờ duyệt</div>
                </div>
              </button>

              <button
                className="dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  onRunPlan();
                }}
              >
                <span className="item-icon">🗓️</span>
                <div className="item-info">
                  <div className="item-title">Lên Lịch Tuần Tự (Plan)</div>
                  <div className="item-desc">Xếp lịch các khung giờ vàng 7 ngày</div>
                </div>
              </button>

              {onRunPublish && (
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onRunPublish();
                  }}
                >
                  <span className="item-icon">🚀</span>
                  <div className="item-info">
                    <div className="item-title">Xuất Bản Video (Publish)</div>
                    <div className="item-desc">Đăng các video đã dựng lên YouTube</div>
                  </div>
                </button>
              )}

              <button className="dropdown-item" onClick={handleOpenRemotion}>
                <span className="item-icon">🎥</span>
                <div className="item-info">
                  <div className="item-title">Mở Remotion Studio</div>
                  <div className="item-desc">Xem preview animation & template video</div>
                </div>
              </button>

              <button
                className="dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSkills();
                }}
              >
                <span className="item-icon">🎭</span>
                <div className="item-info">
                  <div className="item-title">Hồ Sơ & Kỹ Năng Agent</div>
                  <div className="item-desc">Tùy biến Prompt & Model AI</div>
                </div>
              </button>

              <div className="dropdown-divider"></div>
              <div className="dropdown-group-title">HỆ THỐNG</div>

              {onCoffeeBreak && (
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onCoffeeBreak();
                  }}
                >
                  <span className="item-icon">☕</span>
                  <div className="item-info">
                    <div className="item-title">Mời Studio Uống Cà Phê</div>
                    <div className="item-desc">Cho 1 nhân sự rảnh rỗi ra lounge thư giãn</div>
                  </div>
                </button>
              )}

              <button
                className="dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenDoctor();
                }}
              >
                <span className="item-icon">🩺</span>
                <div className="item-info">
                  <div className="item-title">Doctor Chẩn Đoán</div>
                  <div className="item-desc">Kiểm tra kết nối API & Remotion</div>
                </div>
              </button>

              <button
                className="dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings();
                }}
              >
                <span className="item-icon">⚙️</span>
                <div className="item-info">
                  <div className="item-title">Cài Đặt API Keys</div>
                  <div className="item-desc">OpenAI, Anthropic, ElevenLabs, TikTok</div>
                </div>
              </button>

              <div className="dropdown-divider"></div>
              <div className="dropdown-group-title" style={{ color: '#f87171' }}>QUẢN TRỊ & NGUY HIỂM</div>

              {onStopAll && (
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onStopAll();
                  }}
                >
                  <span className="item-icon">⏹</span>
                  <div className="item-info">
                    <div className="item-title" style={{ color: '#fca5a5' }}>Dừng Tất Cả Agent</div>
                    <div className="item-desc">Dừng tiến trình ngầm và giải phóng lock</div>
                  </div>
                </button>
              )}

              <button
                className="dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenReset();
                }}
              >
                <span className="item-icon">🛑</span>
                <div className="item-info">
                  <div className="item-title" style={{ color: '#ef4444', fontWeight: 600 }}>Dừng & Xoá DB (Reset)</div>
                  <div className="item-desc">Xoá toàn bộ dữ liệu để chạy lại từ đầu</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Nút Dừng & Reset Trực Tiếp */}
        <button
          className="btn btn-secondary"
          onClick={onOpenReset}
          title="Dừng các Agent và xoá database để chạy lại từ đầu"
          style={{
            borderColor: 'rgba(239, 68, 68, 0.4)',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#fca5a5',
          }}
        >
          <span style={{ fontSize: 13 }}>🛑</span>
          <span>Dừng & Reset DB</span>
        </button>
      </div>
    </header>
  );
}
