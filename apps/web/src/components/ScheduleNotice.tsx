import { useEffect, useState } from 'react';
import type { ScheduleStatus } from '../../shared/api';
import { countdown, scheduleSummary } from '../core/schedule';

interface Props {
  schedule: ScheduleStatus | null;
  fetchedAt: number;
  error: string | null;
  running: boolean;
  onOpenAutomation?: () => void;
}

export default function ScheduleNotice({ schedule, fetchedAt, error, running, onOpenAutomation }: Props) {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!schedule) return (
    <section className="schedule-notice schedule-loading" aria-label="Lịch hoạt động agent" role="status">
      {error ? `Không tải được lịch hoạt động: ${error}` : 'Đang tải lịch hoạt động…'}
    </section>
  );
  const now = Date.parse(schedule.serverTime) + Math.max(0, clock - fetchedAt);
  const stale = Boolean(error) || clock - fetchedAt > 15000;
  const summary = scheduleSummary(schedule, now, running);
  const active = schedule.enabled && !schedule.paused && !schedule.automation?.blocked;
  const automatic = schedule.automation;
  const mode = !schedule.enabled ? 'Lịch tự động tắt' : schedule.paused ? 'Đã tạm dừng'
    : automatic?.enabled ? 'Tự động vận hành' : 'Chỉ phát hành theo lịch';
  const status = stale ? 'Mất kết nối' : summary.kind === 'warning' ? 'Cần kiểm tra'
    : running ? 'Đang xử lý' : automatic?.enabled ? 'Đã bật' : 'Sẵn sàng';
  const dateTime = (value: string) => new Date(value).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <section className={`schedule-notice schedule-${stale ? 'warning' : summary.kind}`} aria-label="Lịch hoạt động agent">
      <div className="schedule-toolbar">
        <div className="schedule-identity" role="status">
          <span className="schedule-dot" aria-hidden="true" />
          <strong>{mode}</strong>
          <span className="schedule-state">{status}</span>
        </div>
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
        {onOpenAutomation && <button className="admin-button schedule-configure" onClick={onOpenAutomation}
          aria-label="Cấu hình tự động vận hành">Cấu hình</button>}
      </div>
      {(stale || summary.kind === 'warning') && <p className="schedule-alert" role="status">
        {stale ? error || 'Mất cập nhật từ server; chưa thể xác nhận lần chạy tiếp theo.' : summary.detail}
      </p>}
      <details className="schedule-details">
        <summary>Chi tiết hoạt động</summary>
        <div className="schedule-detail-body">
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
        </div>
      </details>
    </section>
  );
}
