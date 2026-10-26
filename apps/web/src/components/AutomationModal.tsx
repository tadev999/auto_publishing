import { studioAPI } from '../core/api';
import { useEffect, useRef, useState } from 'react';
import type { ScheduleStatus } from '../../shared/api';
import { automationPlatforms, automationSchema, type AutomationConfig } from '@endo/core/automationConfig';

const platformNames = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };

export default function AutomationModal({ schedule, running, onClose, onSaved }: {
  schedule: ScheduleStatus | null; running: boolean; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const automatic = schedule?.automation;
  const [limit, setLimit] = useState(String(automatic?.dailyLimit ?? 3));
  const [horizon, setHorizon] = useState(String(automatic?.horizonHours ?? 24));
  const [interval, setInterval] = useState(String(automatic?.checkIntervalSeconds ?? 60));
  const [platforms, setPlatforms] = useState(automatic?.platforms ?? []);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  const active = Boolean(automatic?.enabled && !schedule?.paused && !automatic.blocked);
  const supported = automatic?.checkIntervalSeconds !== undefined;
  const draft = automationSchema.safeParse({
    enabled: automatic?.enabled ?? false, dailyLimit: Number(limit), horizonHours: Number(horizon),
    checkIntervalSeconds: Number(interval), platforms,
  });
  const persist = async (config: AutomationConfig, action: 'apply' | 'save') => {
    setSaving(true);
    setError('');
    try {
      if (!await studioAPI.saveAutomation({ ...config, action })) throw new Error('Server chưa xác nhận cấu hình.');
      await onSaved();
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  return (
    <div className="modal-backdrop" onClick={() => { if (!saving) onClose(); }}>
      <section className="modal-card automation-modal" role="dialog" aria-modal="true" aria-labelledby="automation-title"
        ref={dialog} tabIndex={-1} onKeyDown={(event) => {
          if (event.key === 'Escape' && !saving) { event.stopPropagation(); onClose(); }
          if (event.key !== 'Tab') return;
          const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary');
          if (!controls?.length) return;
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }}
        onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div><h2 id="automation-title">Tự động vận hành</h2><p className="modal-subtitle">Cấu hình luồng sản xuất trên server</p></div>
          <button className="admin-button automation-close" disabled={saving} onClick={onClose} aria-label="Đóng cấu hình tự động">×</button>
        </header>
        <div className="modal-body">
          {!automatic || !supported ? <p role="alert">Server chưa hỗ trợ cấu hình tự động mới. Cần khởi động lại server sau khi cập nhật.</p> : (
            <>
              <div className="automation-overview">
                <span className={`automation-status ${active ? 'is-active' : ''}`}>
                  {automatic.blocked ? 'Cần kiểm tra' : active ? 'Đang bật' : 'Đang tắt / tạm dừng'}
                </span>
                <p>Nạp ý tưởng → Lên lịch → Sản xuất & QA → Phát hành</p>
              </div>
              <div className="automation-fields">
                <label>Chuẩn bị trước
                  <div className="automation-number"><input aria-label="Chuẩn bị trước" type="number" min="1" max="168" step="1"
                    value={horizon} disabled={saving} onChange={(event) => setHorizon(event.target.value)} /><span>giờ</span></div>
                  <small>1–168 giờ · không dời lịch cũ</small>
                </label>
                <label>Chu kỳ kiểm tra
                  <div className="automation-number"><input aria-label="Chu kỳ kiểm tra" type="number" min="30" max="3600" step="1"
                    value={interval} disabled={saving} onChange={(event) => setInterval(event.target.value)} /><span>giây</span></div>
                  <small>30–3600 giây · khi server rảnh</small>
                </label>
              </div>
              <fieldset className="automation-platforms" disabled={saving}>
                <legend>Nền tảng tự động phát hành</legend>
                <div>{automationPlatforms.map((platform) => <label key={platform}>
                  <input type="checkbox" checked={platforms.includes(platform)}
                    onChange={(event) => setPlatforms((current) => event.target.checked
                      ? [...current, platform] : current.filter((value) => value !== platform))} />
                  {platformNames[platform]}
                </label>)}</div>
                <small>Chọn ít nhất một. Áp dụng cả video chờ đăng; không đăng lại video đã hoàn tất. Không đổi cấu hình phát hành thủ công.</small>
              </fieldset>
              <label className="automation-limit"><span><strong>Giới hạn mỗi ngày</strong>
                <small>Video/ngày · từ 1 đến 20</small></span>
                <input aria-label="Giới hạn mỗi ngày" type="number" min="1" max="20" step="1" value={limit} disabled={saving}
                  onChange={(event) => setLimit(event.target.value)} />
              </label>
              {!draft.success && <p className="admin-error" role="status">Nhập số nguyên trong khoảng cho phép và chọn ít nhất một nền tảng để lưu.</p>}
              <div className="automation-mode"><strong>{automatic.dryRun === true ? 'DRY RUN · Không đăng thật' : automatic.dryRun === false
                ? `ĐĂNG THẬT · ${platforms.join(', ') || 'Chưa chọn nền tảng'}` : 'Chưa xác định chế độ đăng'}</strong>
                <p>API, giọng đọc và render vẫn có thể phát sinh chi phí, kể cả dry run.</p>
              </div>
              <details className="automation-rules">
                <summary>Giới hạn & cơ chế an toàn</summary>
                <div>
                  <p>Tính ngày theo {automatic.timezone || 'múi giờ server'}. Giới hạn số lịch và lượt bắt đầu sản xuất; lần lỗi cũng tính. Số bài nguồn nạp/ngày không vượt giới hạn này.</p>
                  <p>Một bài nguồn có thể có nhiều góc nhìn khác nhau. Không dùng lại ý tưởng đã có video, kể cả video lỗi; không remake. So sánh góc nhìn/insight và thân kịch bản trước tạo giọng đọc/phát hành. Nội dung cùng nghĩa nhưng diễn đạt hoàn toàn khác vẫn cần kiểm tra biên tập.</p>
                  <p>Gặp lỗi hoặc kết quả đăng không rõ, hệ thống chặn chu kỳ mới. Kiểm tra rồi bật lại. Cấu hình được giữ khi restart; ngắt giữa chu kỳ sẽ yêu cầu đối soát. Không cần giữ trình duyệt mở.</p>
                  <p>Lưu áp dụng cho chu kỳ tiếp theo, không tự bật hay bỏ chặn lỗi. Đổi nền tảng không thay đổi chế độ dry run/đăng thật; cần cấu hình API tương ứng. TikTok ở chế độ inbox vẫn cần đăng trong ứng dụng.</p>
                </div>
              </details>
              {!schedule?.enabled && <p className="admin-error" role="status">Lịch tự động đang tắt trên server. Cần bật scheduler trước khi sử dụng.</p>}
              {running && <p className="automation-hint" role="status">Chờ tác vụ hiện tại kết thúc để bật hoặc lưu cấu hình. Bạn vẫn có thể tạm dừng tự động.</p>}
              {!active && <label className="automation-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                Tôi đồng ý để server tự gọi API, sản xuất và phát hành theo cấu hình/giới hạn trên.</label>}
              {automatic.lastError && <p className="admin-error" role="alert">{automatic.lastError}</p>}
            </>
          )}
          {error && <p className="admin-error" role="alert">{error}</p>}
        </div>
        <footer className="modal-footer">
          <button className="admin-button" disabled={saving} onClick={onClose}>Đóng</button>
          {automatic?.enabled && supported && <button className="admin-button admin-danger" disabled={saving}
            onClick={() => void persist({ enabled: false, dailyLimit: automatic.dailyLimit, horizonHours: automatic.horizonHours,
              checkIntervalSeconds: automatic.checkIntervalSeconds, platforms: automatic.platforms }, 'apply')}>
            Tạm dừng tự động</button>}
          <button className={`admin-button ${active ? 'admin-primary' : ''}`}
            disabled={saving || !supported || !draft.success || running}
            onClick={() => { if (draft.success) void persist(draft.data, 'save'); }}>
            {saving ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
          {!active && <button className="admin-button admin-primary"
            disabled={saving || !supported || !draft.success || !schedule?.enabled || running || !confirmed}
            onClick={() => { if (draft.success) void persist({ ...draft.data, enabled: true }, 'apply'); }}>
            Bật tự động vận hành</button>}
        </footer>
      </section>
    </div>
  );
}
