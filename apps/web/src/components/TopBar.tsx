import { useState, useRef, useEffect } from 'react';
import { store } from '../core/store';

interface TopBarProps {
  onOpenDoctor: () => void;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
  onOpenAutomation: () => void;
  onRunWalkthrough: () => void;
  onRunProduce: () => void;
  onRunPlan: () => void;
  onRunPublish?: () => void;
  onOpenReset: () => void;
  onStopAll?: () => void;
  busy: boolean;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
}

export default function TopBar(props: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const stats = store.get().stats;
  const closeMenu = () => { setMenuOpen(false); triggerRef.current?.focus(); };

  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  const groups: { title: string; items: {
    title: string; description: string; action?: () => void; disabled?: boolean; danger?: boolean;
  }[] }[] = [
    { title: 'Vận hành', items: [
      { title: 'Tự động vận hành', description: 'Bật/tạm dừng, giới hạn video/ngày và chống trùng ý tưởng.', action: props.onOpenAutomation },
      { title: 'Lên lịch nội dung', description: 'Xếp lịch từ các ý tưởng có sẵn.', action: props.onRunPlan, disabled: props.busy },
      { title: 'Sản xuất 1 video', description: 'Tiếp tục sản xuất; tự nạp ý tưởng và lên lịch khi cần.', action: props.onRunProduce, disabled: props.busy },
      { title: 'Phát hành đến lịch', description: 'Đăng các video đủ điều kiện đã tới giờ.', action: props.onRunPublish, disabled: props.busy },
      { title: 'Dừng tác vụ', description: 'Dừng agents và tạm dừng tự động phát hành. Không xóa dữ liệu.', action: props.onStopAll, disabled: !props.busy, danger: true },
    ] },
    { title: 'Cấu hình', items: [
      { title: 'Agent & kỹ năng', description: 'Model, chỉ dẫn và kỹ năng theo từng agent.', action: props.onOpenSkills },
      { title: 'Kết nối & API keys', description: 'Cấu hình nhà cung cấp và dịch vụ bên ngoài.', action: props.onOpenSettings },
    ] },
    { title: 'Hệ thống', items: [
      { title: 'Chẩn đoán hệ thống', description: 'Kiểm tra môi trường, kết nối và công cụ dựng video.', action: props.onOpenDoctor },
      { title: 'Reset dữ liệu…', description: 'Thao tác nguy hiểm. Cần xác nhận trước khi xóa.', action: props.onOpenReset, danger: true },
    ] },
  ];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">&gt;_</span>
          <span className="brand-title">endogenism<span className="brand-path"> / studio</span></span>
          <span className="brand-badge">workspace</span>
        </div>
        <div className="ambient-heartbeat">
          <span><b>{stats.planned}</b> lên lịch</span><span>·</span>
          <span><b>{stats.rendered}</b> đã dựng</span><span>·</span>
          <span><b>{stats.published}</b> đã xuất bản</span>
        </div>
      </div>
      <div className="topbar-right">
        {props.onToggleTerminal && (
          <button className={`btn btn-secondary ${props.terminalOpen ? 'active' : ''}`}
            onClick={props.onToggleTerminal} aria-expanded={props.terminalOpen}>
            Logs <span aria-hidden="true">{props.terminalOpen ? '−' : '+'}</span>
          </button>
        )}
        <button className="btn btn-hero" onClick={props.onRunWalkthrough} disabled={props.busy}
          title={props.busy ? 'Chờ tác vụ hiện tại hoàn tất hoặc dừng trong Công cụ.' : 'Mô phỏng quy trình; không đăng lên mạng xã hội.'}>
          <span aria-hidden="true">▷</span> Chạy demo
        </button>
        <div className="tools-dropdown-wrapper" ref={menuRef}>
          <button ref={triggerRef} className={`btn btn-secondary ${menuOpen ? 'active' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="studio-tools">
            Công cụ <span aria-hidden="true">{menuOpen ? '▴' : '▾'}</span>
          </button>
          {menuOpen && (
            <div className="tools-dropdown-popover admin-tools" id="studio-tools" aria-label="Công cụ quản trị">
              <div className="admin-tools-header">
                <strong>Quản trị workspace</strong>
                <span className={props.busy ? 'admin-busy' : ''}>{props.busy ? 'Có tác vụ đang chạy' : 'Sẵn sàng nhận tác vụ'}</span>
              </div>
              {groups.map((group) => (
                <section key={group.title} aria-label={group.title}>
                  <h2 className="dropdown-group-title">{group.title}</h2>
                  {group.items.filter((item) => item.action).map((item) => (
                    <button key={item.title} className={`dropdown-item ${item.danger ? 'admin-danger' : ''}`}
                      disabled={item.disabled} onClick={() => { closeMenu(); item.action?.(); }}>
                      <span className="item-info">
                        <span className="item-title">{item.title}</span>
                        <span className="item-desc">{item.description}</span>
                      </span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
