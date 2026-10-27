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
    color: '#0e7490',
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
    color: '#059669',
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
    color: '#9333ea',
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
    color: '#b45309',
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
    color: '#db2777',
    status: 'idle',
    statusIcon: '🚀',
    thought: 'Rà soát metadata và phát hành theo nền tảng, giờ đăng đã cấu hình.',
  },
];

// Cả team dùng chung một phòng, ba bàn phía trên và hai bàn phía dưới.
export const DESKS: Desk[] = [
  { id: 'desk-planner', label: 'Điều phối nội dung', role: 'planner', tx: 3, ty: 6, color: 0x0e7490 },
  { id: 'desk-writer', label: 'Biên kịch', role: 'writer', tx: 10, ty: 6, color: 0x059669 },
  { id: 'desk-critic', label: 'Biên tập', role: 'critic', tx: 17, ty: 6, color: 0x9333ea },
  { id: 'desk-producer', label: 'Sản xuất', role: 'producer', tx: 7, ty: 12, color: 0xb45309 },
  { id: 'desk-publisher', label: 'Phát hành', role: 'publisher', tx: 13, ty: 12, color: 0xdb2777 },
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
  const desk = DESKS.find((item) => item.role === AGENT_ROLES[key]);
  return {
    name: desk?.label || member?.name || 'Hệ thống',
    task: EVENT_TASKS[key] || agent,
    color: member ? `var(--agent-${member.role})` : 'var(--accent-blue)',
  };
}
