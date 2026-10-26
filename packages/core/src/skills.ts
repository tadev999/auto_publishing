import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { ROOT } from './config.js';
import type { Ctx } from './context.js';

const SKILLS_DIR = path.join(ROOT, 'skills');
const cache = new Map<string, string>();

export interface SkillMeta {
  id: string;
  name: string;
  title: string;
  description: string;
  category: 'core' | 'writing' | 'formats' | 'retention' | 'quality' | 'production' | 'strategy' | 'distribution';
  icon: string;
  badge: string;
  targetRoles: string[]; // Các chức vụ được khuyến nghị dùng kỹ năng này
}

export interface AgentSkillProfile {
  id: string;
  name: string;
  title: string;
  role: string;
  responsibility: string;
  department: string; // Phòng ban trực thuộc
  avatarIcon: string;
  color: string;
  model: string;
  temperature: number;
  tone: 'philosophy' | 'viral' | 'satire' | 'practical' | 'strict';
  systemPromptExtra?: string;
  equippedSkills: string[];
  stats: {
    creativity: number;
    precision: number;
    empathy: number;
    velocity: number;
  };
}

export const SKILL_DEFINITIONS: Record<string, Omit<SkillMeta, 'id'>> = {
  // --- Kỹ năng Sáng Tác Kịch Bản (Biên Kịch) ---
  'hook-writing': {
    name: 'hook-writing',
    title: 'Kỹ Thuật 3 Hook Giữ Chân 2s',
    description: '6 công thức hook mở vòng tò mò: recognition, naming, reversal, question, permission, micro-moment.',
    category: 'writing',
    icon: '🪝',
    badge: 'HOOK MASTERY',
    targetRoles: ['writer'],
  },
  'viral-storytelling': {
    name: 'viral-storytelling',
    title: 'Nghệ Thuật Kể Chuyện Lan Tỏa',
    description: 'Chạm đúng điểm nhức nhối thầm kín, tạo nhịp cầu cảm xúc giải tỏa áp lực tâm lý.',
    category: 'writing',
    icon: '🔥',
    badge: 'VIRAL IMPACT',
    targetRoles: ['writer', 'publisher'],
  },
  'humor-satire': {
    name: 'humor-satire',
    title: 'Hài Hước & Châm Biếm Nhẹ',
    description: 'Tự trào tinh tế, dùng tiếng cười xoa dịu nghịch lý và áp lực thường nhật.',
    category: 'writing',
    icon: '✨',
    badge: 'WITTY & LIGHT',
    targetRoles: ['writer'],
  },
  'short-form-retention': {
    name: 'short-form-retention',
    title: 'Tối Ưu Retention Tổng Thể 9:16',
    description: 'Nhịp ngắt câu 2.4 từ/giây, visual pacing, looping câu kết giữ chân 100%.',
    category: 'retention',
    icon: '⚡',
    badge: 'MAX RETENTION',
    targetRoles: ['writer', 'producer', 'publisher', 'critic'],
  },

  // --- Kỹ năng Thẩm Định & Kiểm Soát (Tổng Biên Tập) ---
  'endogenism-guardrails': {
    name: 'endogenism-guardrails',
    title: 'Bảo Vệ Triết Lý & Luật Cứng',
    description: 'Bảo vệ giá trị cốt lõi: Cấm so sánh, cấm FOMO, cấm hứa hẹn suông, không dọa nạt người xem.',
    category: 'core',
    icon: '🛡️',
    badge: 'TRIẾT LÝ GỐC',
    targetRoles: ['critic', 'writer', 'planner'],
  },
  'hardcore-critique': {
    name: 'hardcore-critique',
    title: 'Phản Biện Thép & Soi Chi Tiết',
    description: 'Chấm điểm nghiêm ngặt gấp đôi, gọt bỏ mọi dấu hiệu sáo rỗng hoặc lý thuyết suông.',
    category: 'quality',
    icon: '🔍',
    badge: 'IRON CRITIC',
    targetRoles: ['critic'],
  },
  'compliance-qa': {
    name: 'compliance-qa',
    title: 'Kiểm Định Xuất Xưởng & Safe-Zone 9:16',
    description: 'Rà soát safe-zone 9:16, độ dài thời lượng, bản quyền âm thanh và độ rõ âm tiết.',
    category: 'quality',
    icon: '📐',
    badge: 'COMPLIANCE QA',
    targetRoles: ['critic'],
  },

  // --- Kỹ năng Sản Xuất Video (Kỹ Sư Sản Xuất) ---
  'endogenism-voice': {
    name: 'endogenism-voice',
    title: 'Giọng Văn Đồng Hành Sâu Lắng',
    description: 'Giọng đọc chân thành, ngang hàng, câu ngắn, giàu ẩn dụ đời thường như tri kỷ tâm sự.',
    category: 'core',
    icon: '🎙️',
    badge: 'SIGNATURE VOICE',
    targetRoles: ['producer', 'writer'],
  },
  'voice-emotional': {
    name: 'voice-emotional',
    title: 'Ngữ Điệu & Nhịp Thở Cảm Xúc',
    description: 'Căn chỉnh khoảng lặng 0.4s - 0.7s đắt giá, trầm ấm và rung động từng thanh âm.',
    category: 'production',
    icon: '🎧',
    badge: 'SOULFUL VOICE',
    targetRoles: ['producer'],
  },
  'visual-cinematic': {
    name: 'visual-cinematic',
    title: 'Thị Giác Điện Ảnh (Cinematic B-Roll)',
    description: 'Tuyển chọn B-roll có chiều sâu tâm trạng, tương phản ánh sáng ấm và chuyển cảnh êm.',
    category: 'production',
    icon: '🎬',
    badge: 'CINEMATIC LOOK',
    targetRoles: ['producer'],
  },
  'motion-typography': {
    name: 'motion-typography',
    title: 'Kinetic Motion Typography 9:16',
    description: 'Căn nhịp chữ xuất hiện theo từng từ ngữ, highlight từ khóa vàng theo giọng đọc.',
    category: 'production',
    icon: '⚡',
    badge: 'KINETIC TEXT',
    targetRoles: ['producer'],
  },

  // --- Kỹ năng Chiến Lược & Ý Tưởng (Trưởng Ban Nội Dung) ---
  'content-curation': {
    name: 'content-curation',
    title: 'Chắt Lọc Tinh Hoa Ý Tưởng',
    description: 'Đọc toàn văn 150 bài viết gốc, nhận diện câu trích dẫn đắt giá và ẩn dụ gốc.',
    category: 'strategy',
    icon: '📚',
    badge: 'CURATION',
    targetRoles: ['planner'],
  },
  'golden-hour-strategy': {
    name: 'golden-hour-strategy',
    title: 'Chiến Lược Khung Giờ Vàng',
    description: 'Điều phối 3-5 khung giờ vàng mỗi ngày (06:30, 11:30, 17:00, 20:00) theo nhịp sinh học.',
    category: 'strategy',
    icon: '🗓️',
    badge: 'GOLDEN SLOTS',
    targetRoles: ['planner'],
  },

  // --- Kỹ năng Phát Hành & Tăng Trưởng (Điều Phối Phát Hành) ---
  'algorithm-distribution': {
    name: 'algorithm-distribution',
    title: 'Tối Ưu Thuật Toán TikTok/Reels',
    description: 'Xuất bản đúng hẹn, caption chuẩn SEO video ngắn, kích hoạt Share to Feed.',
    category: 'distribution',
    icon: '🚀',
    badge: 'ALGORITHM',
    targetRoles: ['publisher'],
  },
  'retention-analytics': {
    name: 'retention-analytics',
    title: 'Phân Tích Biểu Đồ Giữ Chân Khán Giả',
    description: 'Đo lường tỷ lệ Save/View, Share/View và phản hồi ngược style hook cho Biên Kịch.',
    category: 'distribution',
    icon: '📊',
    badge: 'ANALYTICS',
    targetRoles: ['publisher'],
  },

  // --- 5 Formats Video Chuẩn ---
  'format-cau-hoi': {
    name: 'format-cau-hoi',
    title: 'Format: Câu Hỏi Phản Tư (15–20s)',
    description: 'Đặt câu hỏi xoáy sâu khiến người xem tự đối thoại với chính mình.',
    category: 'formats',
    icon: '❓',
    badge: 'FORMAT CÂU HỎI',
    targetRoles: ['writer', 'planner'],
  },
  'format-doc-cham': {
    name: 'format-doc-cham',
    title: 'Format: Đọc Chậm Chiêm Nghiệm (20–30s)',
    description: 'Khoảng lặng dài, câu chữ đắt giá, đánh thức sự bình yên nội tại.',
    category: 'formats',
    icon: '📖',
    badge: 'FORMAT ĐỌC CHẬM',
    targetRoles: ['writer', 'planner'],
  },
  'format-goi-ten': {
    name: 'format-goi-ten',
    title: 'Format: Gọi Tên Cảm Xúc (30–45s)',
    description: 'Định danh chính xác những cảm giác vô danh người xem đang gánh chịu.',
    category: 'formats',
    icon: '🏷️',
    badge: 'FORMAT GỌI TÊN',
    targetRoles: ['writer', 'planner'],
  },
  'format-ngo-nhan': {
    name: 'format-ngo-nhan',
    title: 'Format: Phá Vỡ Ngộ Nhận (30–40s)',
    description: 'Đảo ngược một niềm tin phổ biến gây kiệt sức để giải phóng tâm trí.',
    category: 'formats',
    icon: '💡',
    badge: 'FORMAT NGỘ NHẬN',
    targetRoles: ['writer', 'planner'],
  },
  'format-thuc-hanh': {
    name: 'format-thuc-hanh',
    title: 'Format: Bài Tập Thực Hành (40–60s)',
    description: 'Một hành động vi mô 30 giây để người xem áp dụng ngay lập tức.',
    category: 'formats',
    icon: '🧘',
    badge: 'FORMAT THỰC HÀNH',
    targetRoles: ['writer', 'planner'],
  },
};

export const DEFAULT_AGENT_PROFILES: Record<string, AgentSkillProfile> = {
  // 1. TRƯỞNG BAN NỘI DUNG (Kế Hoạch & Đề Tài)
  planner: {
    id: 'planner',
    name: 'Trưởng Ban Nội Dung',
    title: 'Trưởng Ban Nội Dung',
    role: 'planner',
    responsibility: 'Đọc bài nguồn, tách các ý tưởng độc lập và ưu tiên đề tài phù hợp cho lịch sản xuất. Không tái sử dụng ý tưởng đã có video.',
    department: 'Team Nội Dung',
    avatarIcon: '📚',
    color: '#06b6d4',
    model: 'gpt-4o',
    temperature: 0.4,
    tone: 'philosophy',
    systemPromptExtra: 'Chỉ đề xuất nội dung có căn cứ từ bài nguồn. Mỗi góc nhìn phải có thông điệp riêng; không đổi tiêu đề để lặp ý cũ. Ưu tiên tính liên tục của hành trình nội dung, đa dạng format và giá trị thực hành. Chỉ chọn ID có trong danh sách được cung cấp; lịch, hạn mức và chống trùng do hệ thống kiểm soát.',
    equippedSkills: [
      'content-curation',
      'golden-hour-strategy',
      'endogenism-guardrails',
      'endogenism-voice',
    ],
    stats: { creativity: 90, precision: 95, empathy: 92, velocity: 92 },
  },

  // 2. BIÊN KỊCH (Sáng Tác Kịch Bản)
  writer: {
    id: 'writer',
    name: 'Biên Kịch',
    title: 'Biên Kịch',
    role: 'writer',
    responsibility: 'Chuyển một ý tưởng thành kịch bản video ngắn đúng format, gồm ba hook khác nhau và một thông điệp xuyên suốt.',
    department: 'Team Nội Dung',
    avatarIcon: '✍️',
    color: '#10b981',
    model: 'claude-3-7-sonnet',
    temperature: 0.85,
    tone: 'philosophy',
    systemPromptExtra: 'Viết tiếng Việt tự nhiên, ngắn gọn và dễ đọc thành tiếng. Mỗi video chỉ một ý chính; ba hook khác cách mở nhưng không hứa quá mức. Trích dẫn phải nguyên văn bài nguồn. Không bịa số liệu, không FOMO, không chẩn đoán hay cam kết chữa lành. Đề xuất hình ảnh phù hợp nội dung và tiếp thu phản hồi thẩm định.',
    equippedSkills: [
      'hook-writing',
      'viral-storytelling',
      'short-form-retention',
      'endogenism-voice',
      'endogenism-guardrails',
    ],
    stats: { creativity: 99, precision: 88, empathy: 96, velocity: 90 },
  },

  // 3. TỔNG BIÊN TẬP (Kiểm Duyệt 1 Cửa: Triết Lý + Safe-Zone)
  critic: {
    id: 'critic',
    name: 'Tổng Biên Tập',
    title: 'Tổng Biên Tập',
    role: 'critic',
    responsibility: 'Duyệt tính đúng đắn và chất lượng kịch bản; kiểm định hình ảnh video trước khi vào hàng đợi phát hành.',
    department: 'Team Nội Dung',
    avatarIcon: '⚖️',
    color: '#a855f7',
    model: 'gpt-4o',
    temperature: 0.2,
    tone: 'strict',
    systemPromptExtra: 'Đánh giá theo rubric, không nương điểm để lấp lịch. Kiểm tra một ý chính, độ trung thực với nguồn, lời hứa quá mức và tính rõ ràng. Ghi lỗi cụ thể kèm cách sửa. Với QA hình ảnh, kiểm tra khả năng đọc, safe-zone, tương phản và nội dung không phù hợp; không bỏ qua lỗi kỹ thuật bắt buộc.',
    equippedSkills: [
      'hardcore-critique',
      'compliance-qa',
      'endogenism-guardrails',
      'short-form-retention',
    ],
    stats: { creativity: 70, precision: 100, empathy: 75, velocity: 96 },
  },

  // 4. KỸ SƯ SẢN XUẤT (Voice + Visual + Remotion)
  producer: {
    id: 'producer',
    name: 'Kỹ Sư Sản Xuất',
    title: 'Kỹ Sư Sản Xuất',
    role: 'producer',
    responsibility: 'Lập hướng hình ảnh và âm thanh từ kịch bản đã duyệt; tạo giọng đọc, chuẩn bị tư liệu và dựng video bằng pipeline kỹ thuật.',
    department: 'Team Nội Dung',
    avatarIcon: '🎬',
    color: '#eab308',
    model: 'gpt-4o',
    temperature: 0.3,
    tone: 'practical',
    systemPromptExtra: 'Giữ nguyên lời thoại đã duyệt, không viết lại thông điệp khi sản xuất. Chọn từ khóa cảnh quay tiếng Anh cụ thể, dễ tìm và phù hợp không khí trầm tĩnh. Chọn nhạc trong danh sách cho phép, không tự tạo đường dẫn hay URL. Ưu tiên khả năng đọc phụ đề, nhịp nhẹ nhàng và khung hình dọc; không thay đổi thông số QA hay render bắt buộc.',
    equippedSkills: [
      'voice-emotional',
      'visual-cinematic',
      'motion-typography',
      'endogenism-voice',
      'short-form-retention',
    ],
    stats: { creativity: 92, precision: 98, empathy: 88, velocity: 96 },
  },

  // 5. ĐIỀU PHỐI PHÁT HÀNH (Phát Hành & Tăng Trưởng)
  publisher: {
    id: 'publisher',
    name: 'Điều Phối Phát Hành',
    title: 'Điều Phối Phát Hành',
    role: 'publisher',
    responsibility: 'Rà soát caption, hashtag và mức sẵn sàng của video trước phát hành; theo dõi kết quả mà không thay đổi lịch hay đăng lại bài đã hoàn tất.',
    department: 'Team Nội Dung',
    avatarIcon: '🚀',
    color: '#22c55e',
    model: 'gpt-4o',
    temperature: 0.4,
    tone: 'practical',
    systemPromptExtra: 'Chỉ duyệt metadata bám sát kịch bản, không giật tít hay thêm lời hứa. Caption ngắn, rõ và hashtag liên quan. Nếu chưa sẵn sàng, từ chối kèm lý do cụ thể; không âm thầm đăng. Không đổi tài khoản, nền tảng, giờ đăng, dry run hay trạng thái đối soát. Không suy diễn số liệu chưa thu thập được.',
    equippedSkills: [
      'algorithm-distribution',
      'retention-analytics',
      'endogenism-guardrails',
      'endogenism-voice',
    ],
    stats: { creativity: 88, precision: 96, empathy: 85, velocity: 99 },
  },
};

export function loadSkill(name: string): string {
  if (cache.has(name)) return cache.get(name)!;

  const skillPath = path.join(SKILLS_DIR, name, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return `<!-- Skill ${name} not found -->`;
  }

  const raw = fs.readFileSync(skillPath, 'utf8');
  const content = matter(raw).content.trim();
  cache.set(name, content);
  return content;
}

export function listAllSkills(): SkillMeta[] {
  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills: SkillMeta[] = [];

  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const meta = SKILL_DEFINITIONS[d.name] || {
      name: d.name,
      title: d.name,
      description: 'Kỹ năng nâng cao cho AI Agent',
      category: 'writing' as const,
      icon: '⚡',
      badge: 'CUSTOM SKILL',
      targetRoles: [],
    };
    skills.push({
      id: d.name,
      ...meta,
    });
  }

  return skills;
}

export function bundle(...names: string[]): string {
  return names
    .filter(Boolean)
    .map((n) => `<skill name="${n}">\n${loadSkill(n)}\n</skill>`)
    .join('\n\n---\n\n');
}

export function getAgentProfile(ctx: Pick<Ctx, 'db'>, role: string): AgentSkillProfile {
  const profile = getAllAgentProfiles(ctx)[role];
  if (!profile) throw new Error(`Unknown agent role: ${role}`);
  return profile;
}

export function getAllAgentProfiles(ctx: Pick<Ctx, 'db'>): Record<string, AgentSkillProfile> {
  if (ctx.db.getKv('agent_profiles_version') !== 2) {
    ctx.db.tx(() => {
      if (ctx.db.getKv('agent_profiles_version') === 2) return;
      const previous = ctx.db.getKv('agent_skills', {});
      ctx.db.setKv('agent_profiles_before_v2', previous);
      ctx.db.setKv('agent_skills', DEFAULT_AGENT_PROFILES);
      ctx.db.setKv('agent_profiles_version', 2);
      ctx.db.log('system', 'Đồng bộ 5 hồ sơ team v2; giữ bản sao cấu hình trước nâng cấp.');
    });
  }
  const saved = ctx.db.getKv<Record<string, AgentSkillProfile>>('agent_skills') || {};
  const merged: Record<string, AgentSkillProfile> = { ...DEFAULT_AGENT_PROFILES };
  for (const [k, v] of Object.entries(saved)) {
    merged[k] = { ...merged[k], ...v };
  }

  return merged;
}

export function agentSystemPrompt(ctx: Pick<Ctx, 'db'>, role: string, task: string, extraSkills: string[] = []): string {
  const profile = getAgentProfile(ctx, role);
  const skills = [...new Set(['endogenism-guardrails', ...profile.equippedSkills, ...extraSkills])];
  for (const skill of skills) {
    if (!fs.existsSync(path.join(SKILLS_DIR, skill, 'SKILL.md'))) throw new Error(`Không tìm thấy kỹ năng: ${skill}`);
  }
  return [
    `CHỨC DANH: ${profile.name}\nVAI TRÒ: ${profile.responsibility}\nPHONG CÁCH: ${profile.tone}`,
    bundle(...skills),
    `CHỈ DẪN BỔ SUNG:\n${profile.systemPromptExtra || '(không có)'}`,
    `NHIỆM VỤ VÀ RÀNG BUỘC BẮT BUỘC (không được ghi đè bởi chỉ dẫn bổ sung):\n${task}`,
  ].join('\n\n');
}

export function saveAgentProfile(ctx: Ctx, profile: AgentSkillProfile): void {
  getAllAgentProfiles(ctx);
  const all = ctx.db.getKv<Record<string, AgentSkillProfile>>('agent_skills') || {};
  all[profile.id] = profile;
  ctx.db.setKv('agent_skills', all);
}
