import { z } from 'zod';

export const FORMATS = ['cau-hoi', 'goi-ten', 'ngo-nhan', 'thuc-hanh', 'doc-cham'] as const;
export type FormatId = (typeof FORMATS)[number];

export const HOOK_STYLES = [
  'recognition',
  'naming',
  'reversal',
  'question',
  'permission',
  'micro_moment',
] as const;
export type HookStyle = (typeof HOOK_STYLES)[number];

export const BEAT_ROLES = [
  'hook',
  'line',
  'myth',
  'truth',
  'step',
  'quote',
  'question',
  'close',
] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];

export enum VideoStatus {
  PLANNED = 'planned',
  SCRIPTED = 'scripted',
  APPROVED = 'approved',
  VOICED = 'voiced',
  RENDERED = 'rendered',
  QA_PASSED = 'qa_passed',
  QUEUED = 'queued',
  PUBLISHED = 'published',
  MEASURED = 'measured',
  FAILED = 'failed',
}

// --- Ingest ---
export const IdeaSeedSchema = z.object({
  angle: z.string().describe('Tên ngắn của góc khai thác, 3–8 chữ.'),
  insight: z.string().describe('Ý chính trong 1–2 câu, giọng tác giả.'),
  quotes: z.array(z.string()).describe('1–4 câu trích NGUYÊN VĂN từ bài, mỗi câu ≤ 35 chữ.'),
  metaphor: z.string().nullable().optional().describe('Ẩn dụ đắt giá trong bài liên quan tới ý này.'),
  practice: z.string().nullable().optional().describe('Thực hành nhỏ trong bài, nếu có.'),
  question: z.string().describe('Một câu hỏi phản tư người xem có thể mang theo.'),
  emotion: z.string().describe('Cảm xúc chính người xem đang có khi gặp ý này.'),
  hook_seed: z.string().describe('Một gợi ý hook ≤ 14 chữ.'),
  formats: z.array(z.enum(FORMATS)).describe('Các format phù hợp, xếp theo mức độ phù hợp giảm dần.'),
});
export type IdeaSeed = z.infer<typeof IdeaSeedSchema>;

export const IngestResultSchema = z.object({
  ideas: z.array(IdeaSeedSchema).describe('4–6 ý tưởng độc lập, mỗi ý đủ cho một video.'),
});
export type IngestResult = z.infer<typeof IngestResultSchema>;

// --- Writer ---
export const HookSchema = z.object({
  style: z.enum(HOOK_STYLES),
  text: z.string().describe('≤ 14 chữ.'),
});
export type Hook = z.infer<typeof HookSchema>;

export const BeatSchema = z.object({
  role: z.enum(BEAT_ROLES),
  text: z.string().describe('Một câu hoặc một cụm câu ngắn, đọc thành tiếng được.'),
  emphasis: z.array(z.string()).default([]).describe('1–2 từ/cụm từ trong text cần làm nổi.'),
});
export type Beat = z.infer<typeof BeatSchema>;

export const ScriptSchema = z.object({
  hooks: z.array(HookSchema).length(3).describe('Đúng 3 hook, 3 style khác nhau.'),
  beats: z.array(BeatSchema).describe('Phần thân, KHÔNG gồm hook. Theo đúng cấu trúc của format.'),
  caption: z.string().describe('Dòng 1: câu bổ sung ≤ 90 ký tự. Dòng 2: câu hỏi mời bình luận.'),
  hashtags: z.array(z.string()).describe('3–5 hashtag, bắt đầu bằng #.'),
  visual_keywords: z
    .array(z.string())
    .describe('3–5 từ khóa TIẾNG ANH mô tả cảnh quay chậm, tĩnh lặng để tìm stock footage.'),
  self_check: z.string().describe('1–2 câu tự kiểm tra script đã đúng luật cứng chưa.'),
});
export type Script = z.infer<typeof ScriptSchema>;

// --- Critic ---
export const CriticScoresSchema = z.object({
  hook: z.number().min(0).max(10),
  philosophy: z.number().min(0).max(10),
  single_idea: z.number().min(0).max(10),
  voice: z.number().min(0).max(10),
  ending: z.number().min(0).max(10),
  readability: z.number().min(0).max(10),
});
export type CriticScores = z.infer<typeof CriticScoresSchema>;

export const CriticReportSchema = z.object({
  best_hook_index: z.number().int().min(0).max(2),
  scores: CriticScoresSchema.describe('Điểm cho script khi dùng hook tốt nhất.'),
  violations: z.array(z.string()).default([]).describe('Luật cứng bị vi phạm (trích câu cụ thể).'),
  feedback: z.array(z.string()).describe('Góp ý sửa cụ thể, có thể hành động được.'),
});
export type CriticReport = z.infer<typeof CriticReportSchema>;

// --- QA ---
export const QAReportSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()).default([]),
});
export type QAReport = z.infer<typeof QAReportSchema>;
