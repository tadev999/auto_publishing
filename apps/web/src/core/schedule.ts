import type { ScheduleStatus } from '../../shared/api';
import { AGENT_ROLES } from '../../shared/activity';

export function blockedAgent(schedule: ScheduleStatus | null) {
  if (!schedule || !schedule.enabled || schedule.paused) return null;
  const automation = schedule.automation;
  const automationBlocked = automation?.enabled && automation.blocked;
  const message = schedule.lastError || (automationBlocked ? automation.lastError || automation.message : null);
  if (!message) return null;
  const stage = !schedule.lastError && automation?.stage || null;
  // Unattributed blocks go to the coordinator, who owns scheduling.
  return { role: stage && AGENT_ROLES[stage] || 'planner', stage, message };
}

export function nextRunLabel(schedule: ScheduleStatus | null, now: number, running: boolean): string | null {
  if (!schedule || running || blockedAgent(schedule)) return null;
  if (!schedule.enabled) return 'Tự động đang tắt';
  if (schedule.paused) return 'Đã tạm dừng · chờ lệnh chạy';
  const time = (iso: string) => {
    const date = new Date(iso);
    const pad = (value: number) => String(value).padStart(2, '0');
    const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return date.toDateString() === new Date(now).toDateString() ? clock
      : `${clock} · ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  };
  const next = schedule.nextPublication;
  if (next) {
    return Date.parse(next.slotAt) <= now ? `Video #${next.id} đã đến giờ đăng` : `Đăng video #${next.id} lúc ${time(next.slotAt)}`;
  }
  return schedule.nextCheckAt ? `Kiểm tra tiếp theo lúc ${time(schedule.nextCheckAt)}` : null;
}

export function scheduleSummary(schedule: ScheduleStatus, now: number, running: boolean) {
  if (running) return { kind: 'running', title: 'Đang xử lý tác vụ',
    detail: 'Agent phụ trách công đoạn hiện tại đang làm việc; các agent còn lại chờ đến lượt.' };
  if (!schedule.enabled) return { kind: 'warning', title: 'Tự động phát hành đang tắt',
    detail: 'Scheduler bị tắt trên server. Không có lần chạy tự động tiếp theo; cần bật scheduler hoặc chạy tác vụ thủ công.' };
  if (schedule.paused) return { kind: 'warning', title: 'Tự động phát hành đã tạm dừng',
    detail: 'Sau Dừng/Reset, agents không tự chạy lại. Chạy tác vụ trong Công cụ sẽ mở lại lịch tự động.' };
  if (schedule.lastError) return { kind: 'warning', title: 'Scheduler gặp lỗi',
    detail: schedule.lastError };
  if (schedule.automation?.enabled) {
    if (schedule.automation.blocked) return { kind: 'warning', title: 'Tự động vận hành cần kiểm tra',
      detail: schedule.automation.lastError || schedule.automation.message };
    return { kind: 'waiting', title: `Tự động vận hành · tối đa ${schedule.automation.dailyLimit} video/ngày`,
      detail: schedule.automation.message };
  }
  if (schedule.nextPublication) {
    if (Date.parse(schedule.nextPublication.slotAt) <= now) {
      return { kind: 'waiting', title: `${schedule.dueCount} video đã đến giờ phát hành`,
        detail: 'Chờ scheduler kiểm tra để chạy Phát hành. Đây không phải tác vụ sản xuất mới.' };
    }
    return { kind: 'waiting', title: `Chờ phát hành video #${schedule.nextPublication.id}`,
      detail: 'Agent Phát hành sẽ nhận việc khi tới lịch, ở lần kiểm tra scheduler kế tiếp nếu không có tác vụ khác.' };
  }
  if (schedule.pendingProduction > 0) return { kind: 'manual', title: `${schedule.pendingProduction} video chờ sản xuất / QA`,
    detail: 'Chưa có video sẵn sàng tự phát hành. Mở Công cụ → Sản xuất 1 Video để tiếp tục; bước này không tự chạy.' };
  return { kind: 'manual', title: 'Chưa có tác vụ tiếp theo',
    detail: 'Không có video chờ sản xuất hoặc phát hành. Mở Công cụ → Lên Lịch, sau đó Sản xuất để giao việc cho agents.' };
}

export function countdown(target: string, now: number) {
  const seconds = Math.ceil((Date.parse(target) - now) / 1000);
  if (seconds <= 0) return 'đang chờ cập nhật';
  if (seconds < 60) return `còn ${seconds}s`;
  if (seconds < 3600) return `còn ${Math.floor(seconds / 60)}p ${seconds % 60}s`;
  return `còn ${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}p`;
}
