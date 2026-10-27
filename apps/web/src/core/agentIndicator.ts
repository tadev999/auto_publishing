import type { AgentStatus } from './types';
import { currentTheme, type Theme } from './theme';

const COLORS = {
  light: { rejected: [0x9a6700, 0xfff8c5], working: [0x0969da, 0xddf4ff], idle: [0x57606a, 0xeaeef2] },
  dark: { rejected: [0xfbbf24, 0x342c1b], working: [0x7dd3fc, 0x19313b], idle: [0xc9d1d9, 0x25282c] },
} as const;

const STAGE_LABELS: Record<string, string> = {
  ingest: 'Đang nạp ý tưởng', planner: 'Đang lên lịch', writer: 'Đang viết',
  critic: 'Đang duyệt', qa: 'Đang kiểm định', producer: 'Đang sản xuất',
  voice: 'Đang tạo giọng', visual: 'Đang tạo hình', render: 'Đang dựng',
  upload: 'Đang tải lên', publisher: 'Đang phát hành', analytics: 'Đang phân tích',
};

export function agentIndicator(status: AgentStatus, stage?: string, theme: Theme = currentTheme()) {
  const palette = COLORS[theme];
  if (status === 'rejected') {
    return { label: 'Cần xử lý', color: palette.rejected[0], background: palette.rejected[1], working: false };
  }
  if (['working', 'thinking', 'reviewing', 'assigned'].includes(status)) {
    const label = status === 'thinking' ? 'Đang chuẩn bị' : status === 'assigned' ? 'Đã nhận việc'
      : stage && STAGE_LABELS[stage] || (status === 'reviewing' ? 'Đang duyệt' : 'Đang làm');
    return { label, color: palette.working[0], background: palette.working[1], working: true };
  }
  if (status === 'walking') {
    return { label: 'Đang di chuyển', color: palette.idle[0], background: palette.idle[1], working: false };
  }
  return { label: 'Sẵn sàng', color: palette.idle[0], background: palette.idle[1], working: false };
}
