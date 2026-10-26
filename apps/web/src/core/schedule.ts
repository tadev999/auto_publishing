import type { ScheduleStatus } from '../../shared/api';

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
