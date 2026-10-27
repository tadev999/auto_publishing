import type { AgentStatus } from './types';

const STAGE_LABELS: Record<string, string> = {
  ingest: 'Đang nạp ý tưởng', planner: 'Đang lên lịch', writer: 'Đang viết',
  critic: 'Đang duyệt', qa: 'Đang kiểm định', producer: 'Đang sản xuất',
  voice: 'Đang tạo giọng', visual: 'Đang tạo hình', render: 'Đang dựng',
  upload: 'Đang tải lên', publisher: 'Đang phát hành', analytics: 'Đang phân tích',
};

export function agentIndicator(status: AgentStatus, stage?: string) {
  if (status === 'rejected') {
    return { label: 'Cần xử lý', color: 0xfbbf24, background: 0x342c1b, working: false };
  }
  if (['working', 'thinking', 'reviewing', 'assigned'].includes(status)) {
    const label = status === 'thinking' ? 'Đang chuẩn bị' : status === 'assigned' ? 'Đã nhận việc'
      : stage && STAGE_LABELS[stage] || (status === 'reviewing' ? 'Đang duyệt' : 'Đang làm');
    return { label, color: 0x7dd3fc, background: 0x19313b, working: true };
  }
  if (status === 'walking') {
    return { label: 'Đang di chuyển', color: 0xc9d1d9, background: 0x25282c, working: false };
  }
  return { label: 'Sẵn sàng', color: 0xc9d1d9, background: 0x25282c, working: false };
}
