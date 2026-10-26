import type { Desk, StudioAgent } from './types';

export const INITIAL_AGENTS: StudioAgent[] = [
  // 1. PHÒNG KẾ HOẠCH & ĐỀ TÀI (gộp ingest + planner)
  {
    id: 'planner',
    name: 'Trưởng Ban Nội Dung',
    role: 'planner',
    title: 'Trưởng Ban Nội Dung & Chiến Lược',
    department: 'Phòng Kế Hoạch & Đề Tài',
    deskId: 'desk-planner',
    color: '#06b6d4',
    status: 'idle',
    statusIcon: '📚',
    thought: 'Chọn bài viết tinh hoa & xếp 3-5 khung giờ vàng/ngày',
  },

  // 2. PHÒNG SÁNG TÁC KỊCH BẢN
  {
    id: 'writer',
    name: 'Biên Kịch',
    role: 'writer',
    title: 'Biên Kịch Trưởng (Claude 3.7)',
    department: 'Phòng Sáng Tác Kịch Bản',
    deskId: 'desk-writer',
    color: '#10b981',
    status: 'idle',
    statusIcon: '✍️',
    thought: 'Sáng tác 3 hook đỉnh cao & kịch bản 2.4 từ/giây',
  },

  // 3. BAN KIỂM DUYỆT CHẤT LƯỢNG (gộp critic + qa)
  {
    id: 'critic',
    name: 'Tổng Biên Tập',
    role: 'critic',
    title: 'Tổng Biên Tập & Thẩm Định QA (GPT-4o)',
    department: 'Ban Kiểm Duyệt Chất Lượng',
    deskId: 'desk-critic',
    color: '#a855f7',
    status: 'idle',
    statusIcon: '⚖️',
    thought: 'Một cửa thẩm định: Triết lý gốc + Safe-zone 9:16',
  },

  // 4. STUDIO SẢN XUẤT AUDIO & VISUAL (gộp voice + visual + render)
  {
    id: 'producer',
    name: 'Kỹ Sư Sản Xuất',
    role: 'producer',
    title: 'Kỹ Sư Sản Xuất (Voice + Visual + Remotion)',
    department: 'Studio Sản Xuất Audio & Visual',
    deskId: 'desk-producer',
    color: '#eab308',
    status: 'idle',
    statusIcon: '🎬',
    thought: 'Dựng video hoàn chỉnh: Voice ElevenLabs + B-roll Pexels',
  },

  // 5. TRUNG TÂM PHÁT HÀNH & TĂNG TRƯỞNG (gộp publisher + analytics)
  {
    id: 'publisher',
    name: 'Điều Phối Phát Hành',
    role: 'publisher',
    title: 'Điều Phối Phát Hành & Tăng Trưởng',
    department: 'Trung Tâm Phát Hành & Tăng Trưởng',
    deskId: 'desk-publisher',
    color: '#22c55e',
    status: 'idle',
    statusIcon: '🚀',
    thought: 'Phát hành TikTok/Reels & tối ưu hóa tỷ lệ giữ chân',
  },
];

// 5 Cụm Bàn Executive Suites phân bố thông thoáng, sang trọng
export const DESKS: Desk[] = [
  // 1. Trưởng Ban Nội Dung (Khu Kế Hoạch - Trái Trên: ROOM-101)
  { id: 'desk-planner', label: 'TRƯỞNG BAN NỘI DUNG', role: 'planner', tx: 3, ty: 3, color: 0x06b6d4 },

  // 2. Biên Kịch (Khu Sáng Tác - Giữa Trên: ROOM-102)
  { id: 'desk-writer', label: 'BIÊN KỊCH TRƯỞNG', role: 'writer', tx: 11, ty: 3, color: 0x10b981 },

  // 3. Tổng Biên Tập (Khu Thẩm Định & QA - Phải Trên: ROOM-103)
  { id: 'desk-critic', label: 'TỔNG BIÊN TẬP', role: 'critic', tx: 20, ty: 3, color: 0xa855f7 },

  // 4. Kỹ Sư Sản Xuất (Khu Production Suite - Trái Dưới: STUDIO-A)
  { id: 'desk-producer', label: 'KỸ SƯ SẢN XUẤT', role: 'producer', tx: 3, ty: 12, color: 0xeab308 },

  // 5. Điều Phối Phát Hành (Khu Broadcast & Growth - Giữa Dưới: HUB-201)
  { id: 'desk-publisher', label: 'ĐIỀU PHỐI PHÁT HÀNH', role: 'publisher', tx: 11, ty: 12, color: 0x22c55e },
];
