import type { Desk, StudioAgent } from './types';
import { AGENT_ROLES } from '../../shared/activity';

export const INITIAL_AGENTS: StudioAgent[] = [
  {
    id: 'planner',
    name: 'Trưởng Ban Nội Dung',
    role: 'planner',
    title: 'Trưởng Ban Nội Dung',
    department: 'Team Nội Dung',
    deskId: 'desk-planner',
    color: '#06b6d4',
    status: 'idle',
    statusIcon: '📚',
    thought: 'Tách ý tưởng độc lập và ưu tiên đề tài cho lịch sản xuất.',
  },

  {
    id: 'writer',
    name: 'Biên Kịch',
    role: 'writer',
    title: 'Biên Kịch',
    department: 'Team Nội Dung',
    deskId: 'desk-writer',
    color: '#10b981',
    status: 'idle',
    statusIcon: '✍️',
    thought: 'Viết ba hook và kịch bản bám sát một ý tưởng từ bài nguồn.',
  },

  {
    id: 'critic',
    name: 'Tổng Biên Tập',
    role: 'critic',
    title: 'Tổng Biên Tập',
    department: 'Team Nội Dung',
    deskId: 'desk-critic',
    color: '#a855f7',
    status: 'idle',
    statusIcon: '⚖️',
    thought: 'Duyệt kịch bản và kiểm định hình ảnh trước khi phát hành.',
  },

  {
    id: 'producer',
    name: 'Kỹ Sư Sản Xuất',
    role: 'producer',
    title: 'Kỹ Sư Sản Xuất',
    department: 'Team Nội Dung',
    deskId: 'desk-producer',
    color: '#eab308',
    status: 'idle',
    statusIcon: '🎬',
    thought: 'Chọn hướng hình ảnh, nhạc nền và dựng video từ kịch bản đã duyệt.',
  },

  {
    id: 'publisher',
    name: 'Điều Phối Phát Hành',
    role: 'publisher',
    title: 'Điều Phối Phát Hành',
    department: 'Team Nội Dung',
    deskId: 'desk-publisher',
    color: '#22c55e',
    status: 'idle',
    statusIcon: '🚀',
    thought: 'Rà soát metadata và phát hành theo nền tảng, giờ đăng đã cấu hình.',
  },
];

// Cả team dùng chung một phòng, ba bàn phía trên và hai bàn phía dưới.
export const DESKS: Desk[] = [
  { id: 'desk-planner', label: INITIAL_AGENTS[0].name, role: 'planner', tx: 4, ty: 6, color: 0x06b6d4 },
  { id: 'desk-writer', label: INITIAL_AGENTS[1].name, role: 'writer', tx: 11, ty: 6, color: 0x10b981 },
  { id: 'desk-critic', label: INITIAL_AGENTS[2].name, role: 'critic', tx: 18, ty: 6, color: 0xa855f7 },
  { id: 'desk-producer', label: INITIAL_AGENTS[3].name, role: 'producer', tx: 7, ty: 11, color: 0xeab308 },
  { id: 'desk-publisher', label: INITIAL_AGENTS[4].name, role: 'publisher', tx: 14, ty: 11, color: 0x22c55e },
];

const EVENT_TASKS: Record<string, string> = {
  ingest: 'Nạp ý tưởng', planner: 'Lên lịch', writer: 'Viết kịch bản',
  critic: 'Duyệt kịch bản', qa: 'Kiểm định video', producer: 'Sản xuất video',
  voice: 'Tạo giọng đọc', visual: 'Chuẩn bị hình ảnh', render: 'Dựng video',
  upload: 'Tải video lên', publisher: 'Phát hành', analytics: 'Phân tích hiệu quả',
  automation: 'Tự động vận hành',
};

export function eventAgentMeta(agent: string) {
  const key = agent.toLowerCase();
  const member = INITIAL_AGENTS.find((item) => item.role === AGENT_ROLES[key]);
  return {
    name: member?.name || 'Hệ thống',
    task: EVENT_TASKS[key] || agent,
    color: member?.color || '#38bdf8',
  };
}
