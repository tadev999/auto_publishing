import { useEffect, useId, useRef, useState } from 'react';
import type { ScheduleStatus } from '../../shared/api';
import { countdown, scheduleSummary } from '../core/schedule';

interface Props {
  variant?: 'status' | 'alert';
  schedule: ScheduleStatus | null;
  fetchedAt: number;
  error: string | null;
  running: boolean;
  onOpenAutomation?: () => void;
}

export default function ScheduleNotice({ schedule, fetchedAt, error, running, onOpenAutomation, variant = 'status' }: Props) {
  const [clock, setClock] = useState(Date.now());
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const panelId = useId();
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (variant !== 'status') return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && detailsRef.current && !detailsRef.current.contains(event.target)) {
        detailsRef.current.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
        detailsRef.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [variant]);

  if (!schedule) {
    if (variant === 'alert') return error ? <div className="automation-alert" role="status">{error}</div> : null;
    return <span className={`automation-status ${error ? 'schedule-warning' : ''}`} role="status">
      <span className="schedule-dot" aria-hidden="true" />{error ? 'Mất kết nối' : 'Đang kết nối'}
    </span>;
  }
  const now = Date.parse(schedule.serverTime) + Math.max(0, clock - fetchedAt);
  const stale = Boolean(error) || clock - fetchedAt > 15000;
  const summary = scheduleSummary(schedule, now, running);
  const automatic = schedule.automation;
  const active = schedule.enabled && !schedule.paused && !schedule.lastError && !(automatic?.enabled && automatic.blocked);
  const mode = !schedule.enabled ? 'Lịch tự động tắt' : schedule.paused ? 'Đã tạm dừng'
    : automatic?.enabled ? 'Tự động vận hành' : 'Chỉ phát hành theo lịch';
  const blocked = schedule.enabled && !schedule.paused && Boolean(schedule.lastError || (automatic?.enabled && automatic.blocked));
  const warning = stale ? error || 'Mất cập nhật từ server; chưa thể xác nhận lần chạy tiếp theo.'
    : blocked ? schedule.lastError || automatic?.lastError || automatic?.message : null;
  const commands: Record<string, string> = {
    produce: 'Đang sản xuất', publish: 'Đang phát hành', plan: 'Đang lên lịch', walkthrough: 'Đang chạy demo',
  };
  const status = stale ? 'Mất kết nối' : blocked ? 'Cần cấu hình'
    : running ? commands[schedule.activeCommand || ''] || 'Đang xử lý'
    : !schedule.enabled ? 'Tự động tắt' : schedule.paused ? 'Đã tạm dừng'
    : automatic?.enabled ? 'Tự động bật' : 'Chỉ phát hành';
  const tone = warning ? 'warning' : running ? 'running' : active ? 'waiting' : 'neutral';
  const dateTime = (value: string) => new Date(value).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  if (variant === 'alert') return warning ? (
    <div className="automation-alert" role="status">
      <span>{warning}</span>
      {onOpenAutomation && <button type="button" onClick={onOpenAutomation}>Kiểm tra cấu hình</button>}
    </div>
  ) : null;

  return (
    <details ref={detailsRef} className={`automation-status schedule-${tone}`}>
      <summary className="automation-trigger" aria-label={`Tự động vận hành: ${status}`} aria-controls={panelId}>
        <span className="schedule-dot" aria-hidden="true" />
        <span>{status}</span>
      </summary>
      <div className="schedule-detail-body" id={panelId} role="region" aria-label="Lịch hoạt động agent">
        <strong>{mode}</strong>
        <div className="schedule-meta">
          {automatic?.enabled && <span>{automatic.dailyLimit} video/ngày</span>}
          {automatic?.dryRun === true && <span className="schedule-badge">DRY RUN</span>}
          {automatic?.dryRun === false && <span className="schedule-badge schedule-live">Đăng thật</span>}
          {active && schedule.nextCheckAt && !stale && (
            <span className="schedule-countdown" title={running ? 'Bỏ qua lần kiểm tra nếu tác vụ còn chạy'
              : `Kiểm tra mỗi ${automatic?.enabled ? automatic.checkIntervalSeconds : 60} giây`}>
              Kiểm tra {countdown(schedule.nextCheckAt, now)}
            </span>
          )}
        </div>
        {warning && <p className="schedule-alert">{warning}</p>}
          <p><strong>{summary.title}</strong> · {summary.detail}</p>
          {schedule.nextPublication && <p>
            Video #{schedule.nextPublication.id} · <time dateTime={schedule.nextPublication.slotAt}>{dateTime(schedule.nextPublication.slotAt)}</time>
            {active && !stale && !running && ` · ${Date.parse(schedule.nextPublication.slotAt) <= now ? 'Đã tới giờ' : countdown(schedule.nextPublication.slotAt, now)}`}
          </p>}
          {active && schedule.nextCheckAt && !stale && <p>
            Kiểm tra tiếp theo · <time dateTime={schedule.nextCheckAt}>{dateTime(schedule.nextCheckAt)}</time>
            {running && ' · bỏ qua nếu tác vụ còn chạy'}
          </p>}
          <p>{automatic?.enabled ? `Tự bổ sung lịch ${automatic.horizonHours} giờ, nạp ý tưởng, sản xuất và phát hành lên ${automatic.platforms.join(', ')}.`
            : 'Chưa bật tự tạo việc; chỉ tự phát hành video đã QA / xếp hàng.'}
            {' Giờ thiết bị: '}{Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
        {onOpenAutomation && <button type="button" className="admin-button schedule-configure" onClick={() => {
          if (detailsRef.current) detailsRef.current.open = false;
          onOpenAutomation();
        }} aria-label="Cấu hình tự động vận hành">Cấu hình tự động</button>}
      </div>
    </details>
  );
}
