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
  category: 'core' | 'writing' | 'formats' | 'retention' | 'quality' | 'production';
  icon: string;
  badge: string;
}

export interface AgentSkillProfile {
  id: string;
  name: string;
  title: string;
  role: string;
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
  'endogenism-guardrails': {
    name: 'endogenism-guardrails',
    title: 'Bảo Vệ Triết Lý & Luật Cứng',
    description: 'Bảo vệ giá trị cốt lõi: Cấm so sánh, cấm FOMO, cấm hứa hẹn suông, không dọa nạt người xem.',
    category: 'core',
    icon: '🛡️',
    badge: 'CORE PHILOSOPHY',
  },
  'endogenism-voice': {
    name: 'endogenism-voice',
    title: 'Giọng Văn Đồng Hành Sâu Lắng',
    description: 'Giọng đọc chân thành, ngang hàng, câu ngắn, giàu ẩn dụ đời thường như tri kỷ tâm sự.',
    category: 'core',
    icon: '🎙️',
    badge: 'SIGNATURE VOICE',
  },
  'hook-writing': {
    name: 'hook-writing',
    title: 'Kỹ Thuật 3 Hook Giữ Chân 2s',
    description: '6 công thức hook mở vòng tò mò: recognition, naming, reversal, question, permission, micro-moment.',
    category: 'writing',
    icon: '🪝',
    badge: 'HOOK MASTERY',
  },
  'viral-storytelling': {
    name: 'viral-storytelling',
    title: 'Nghệ Thuật Kể Chuyện Lan Tỏa',
    description: 'Chạm đúng điểm nhức nhối thầm kín, tạo nhịp cầu cảm xúc giải tỏa áp lực tâm lý.',
    category: 'writing',
    icon: '🔥',
    badge: 'VIRAL IMPACT',
  },
  'humor-satire': {
    name: 'humor-satire',
    title: 'Hài Hước & Châm Biếm Nhẹ',
    description: 'Tự trào tinh tế, dùng tiếng cười xoa dịu nghịch lý và áp lực thường nhật.',
    category: 'writing',
    icon: '✨',
    badge: 'WITTY & LIGHT',
  },
  'short-form-retention': {
    name: 'short-form-retention',
    title: 'Tối Ưu Retention 9:16',
    description: 'Nhịp ngắt câu 2.4 từ/giây, kinetic visual captions, looping câu kết giữ chân 100%.',
    category: 'retention',
    icon: '⚡',
    badge: 'MAX RETENTION',
  },
  'hardcore-critique': {
    name: 'hardcore-critique',
    title: 'Phản Biện Thép & Soi Chi Tiết',
    description: 'Chấm điểm nghiêm ngặt gấp đôi, gọt bỏ mọi dấu hiệu sáo rỗng hoặc lý thuyết suông.',
    category: 'quality',
    icon: '🔍',
    badge: 'IRON CRITIC',
  },
  'visual-cinematic': {
    name: 'visual-cinematic',
    title: 'Thị Giác Điện Ảnh (Cinematic)',
    description: 'Tuyển chọn B-roll có chiều sâu tâm trạng, tương phản ánh sáng ấm và chuyển cảnh êm.',
    category: 'production',
    icon: '🎬',
    badge: 'CINEMATIC LOOK',
  },
  'voice-emotional': {
    name: 'voice-emotional',
    title: 'Ngữ Điệu & Nhịp Thở Cảm Xúc',
    description: 'Căn chỉnh khoảng lặng 0.4s - 0.7s đắt giá, trầm ấm và rung động từng thanh âm.',
    category: 'production',
    icon: '🎧',
    badge: 'SOULFUL VOICE',
  },
  'format-cau-hoi': {
    name: 'format-cau-hoi',
    title: 'Format: Câu Hỏi Phản Tư',
    description: 'Đặt câu hỏi xoáy sâu khiến người xem tự đối thoại với chính mình.',
    category: 'formats',
    icon: '❓',
    badge: 'FORMAT QUESTION',
  },
  'format-doc-cham': {
    name: 'format-doc-cham',
    title: 'Format: Đọc Chậm Chiêm Nghiệm',
    description: 'Khoảng lặng dài, câu chữ đắt giá, đánh thức sự bình yên nội tại.',
    category: 'formats',
    icon: '📖',
    badge: 'FORMAT SLOW READ',
  },
  'format-goi-ten': {
    name: 'format-goi-ten',
    title: 'Format: Gọi Tên Cảm Xúc',
    description: 'Định danh chính xác những cảm giác vô danh người xem đang gánh chịu.',
    category: 'formats',
    icon: '🏷️',
    badge: 'FORMAT NAMING',
  },
  'format-ngo-nhan': {
    name: 'format-ngo-nhan',
    title: 'Format: Phá Vỡ Ngộ Nhận',
    description: 'Đảo ngược một niềm tin phổ biến gây kiệt sức để giải phóng tâm trí.',
    category: 'formats',
    icon: '💡',
    badge: 'FORMAT REVERSAL',
  },
  'format-thuc-hanh': {
    name: 'format-thuc-hanh',
    title: 'Format: Bài Tập Thực Hành',
    description: 'Một hành động vi mô 30 giây để người xem áp dụng ngay lập tức.',
    category: 'formats',
    icon: '🧘',
    badge: 'FORMAT PRACTICE',
  },
};

export const DEFAULT_AGENT_PROFILES: Record<string, AgentSkillProfile> = {
  writer: {
    id: 'writer',
    name: 'Vũ',
    title: 'Biên Kịch (Claude 3.7)',
    role: 'writer',
    avatarIcon: '✍️',
    color: '#10b981',
    model: 'claude-3-7-sonnet',
    temperature: 0.85,
    tone: 'philosophy',
    systemPromptExtra: '',
    equippedSkills: [
      'endogenism-guardrails',
      'endogenism-voice',
      'hook-writing',
      'short-form-retention',
      'viral-storytelling',
    ],
    stats: {
      creativity: 96,
      precision: 85,
      empathy: 94,
      velocity: 88,
    },
  },
  critic: {
    id: 'critic',
    name: 'Triết',
    title: 'Giám Khảo (GPT-4o)',
    role: 'critic',
    avatarIcon: '🔍',
    color: '#a855f7',
    model: 'gpt-4o',
    temperature: 0.3,
    tone: 'strict',
    systemPromptExtra: '',
    equippedSkills: [
      'endogenism-guardrails',
      'short-form-retention',
      'hardcore-critique',
    ],
    stats: {
      creativity: 72,
      precision: 99,
      empathy: 78,
      velocity: 90,
    },
  },
  planner: {
    id: 'planner',
    name: 'Bình',
    title: 'Trưởng Ban Kế Hoạch',
    role: 'planner',
    avatarIcon: '🗓️',
    color: '#3b82f6',
    model: 'gpt-4o',
    temperature: 0.4,
    tone: 'practical',
    systemPromptExtra: '',
    equippedSkills: ['endogenism-guardrails', 'short-form-retention'],
    stats: {
      creativity: 82,
      precision: 95,
      empathy: 80,
      velocity: 94,
    },
  },
  voice: {
    id: 'voice',
    name: 'Thanh',
    title: 'Kỹ Sư Voice (ElevenLabs)',
    role: 'voice',
    avatarIcon: '🎙️',
    color: '#eab308',
    model: 'elevenlabs-v2',
    temperature: 0.6,
    tone: 'philosophy',
    systemPromptExtra: '',
    equippedSkills: ['endogenism-voice', 'voice-emotional'],
    stats: {
      creativity: 88,
      precision: 92,
      empathy: 98,
      velocity: 91,
    },
  },
  visual: {
    id: 'visual',
    name: 'Quang',
    title: 'Đạo Diễn Visual (Pexels)',
    role: 'visual',
    avatarIcon: '🖼️',
    color: '#0ea5e9',
    model: 'pexels-curator',
    temperature: 0.7,
    tone: 'viral',
    systemPromptExtra: '',
    equippedSkills: ['visual-cinematic', 'short-form-retention'],
    stats: {
      creativity: 94,
      precision: 86,
      empathy: 88,
      velocity: 89,
    },
  },
  render: {
    id: 'render',
    name: 'Dựng',
    title: 'Kỹ Thuật Render (Remotion)',
    role: 'render',
    avatarIcon: '🎬',
    color: '#6366f1',
    model: 'remotion-engine',
    temperature: 0.2,
    tone: 'practical',
    systemPromptExtra: '',
    equippedSkills: ['short-form-retention'],
    stats: {
      creativity: 80,
      precision: 100,
      empathy: 70,
      velocity: 98,
    },
  },
  qa: {
    id: 'qa',
    name: 'Minh',
    title: 'Kiểm Định Chất Lượng',
    role: 'qa',
    avatarIcon: '📐',
    color: '#ec4899',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    tone: 'strict',
    systemPromptExtra: '',
    equippedSkills: ['endogenism-guardrails', 'hardcore-critique'],
    stats: {
      creativity: 65,
      precision: 100,
      empathy: 72,
      velocity: 96,
    },
  },
  publisher: {
    id: 'publisher',
    name: 'Phát',
    title: 'Điều Phối Phát Hành',
    role: 'publisher',
    avatarIcon: '🚀',
    color: '#22c55e',
    model: 'social-pub-v1',
    temperature: 0.5,
    tone: 'viral',
    systemPromptExtra: '',
    equippedSkills: ['short-form-retention', 'viral-storytelling'],
    stats: {
      creativity: 86,
      precision: 94,
      empathy: 85,
      velocity: 99,
    },
  },
  analytics: {
    id: 'analytics',
    name: 'Số',
    title: 'Chuyên Viên Tăng Trưởng',
    role: 'analytics',
    avatarIcon: '📊',
    color: '#f59e0b',
    model: 'gpt-4o',
    temperature: 0.3,
    tone: 'practical',
    systemPromptExtra: '',
    equippedSkills: ['short-form-retention'],
    stats: {
      creativity: 76,
      precision: 98,
      empathy: 72,
      velocity: 93,
    },
  },
  ingest: {
    id: 'ingest',
    name: 'Chi',
    title: 'Biên Tập Viên Thu Nhận',
    role: 'ingest',
    avatarIcon: '📚',
    color: '#06b6d4',
    model: 'claude-3-5-sonnet',
    temperature: 0.5,
    tone: 'philosophy',
    systemPromptExtra: '',
    equippedSkills: ['endogenism-guardrails', 'endogenism-voice'],
    stats: {
      creativity: 90,
      precision: 92,
      empathy: 94,
      velocity: 90,
    },
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

export function getAgentProfile(ctx: Ctx, role: string): AgentSkillProfile {
  const all = ctx.db.getKv<Record<string, AgentSkillProfile>>('agent_skills') || {};
  if (all[role]) {
    return {
      ...DEFAULT_AGENT_PROFILES[role],
      ...all[role],
    };
  }
  return DEFAULT_AGENT_PROFILES[role] || {
    id: role,
    name: role,
    title: role,
    role,
    avatarIcon: '🤖',
    color: '#3b82f6',
    model: 'gpt-4o',
    temperature: 0.7,
    tone: 'practical',
    equippedSkills: ['endogenism-guardrails'],
    stats: { creativity: 80, precision: 80, empathy: 80, velocity: 80 },
  };
}

export function getAllAgentProfiles(ctx: Ctx): Record<string, AgentSkillProfile> {
  const saved = ctx.db.getKv<Record<string, AgentSkillProfile>>('agent_skills') || {};
  const merged: Record<string, AgentSkillProfile> = { ...DEFAULT_AGENT_PROFILES };
  for (const [k, v] of Object.entries(saved)) {
    merged[k] = { ...merged[k], ...v };
  }
  return merged;
}

export function saveAgentProfile(ctx: Ctx, profile: AgentSkillProfile): void {
  const all = ctx.db.getKv<Record<string, AgentSkillProfile>>('agent_skills') || {};
  all[profile.id] = profile;
  ctx.db.setKv('agent_skills', all);
}
