import { articleBody } from '../content.js';
import { Ctx } from '../context.js';
import { VideoStatus } from '../db.js';
import { LLM } from '../llm.js';
import { Script, ScriptSchema } from '../schemas.js';

export const AGENT = 'writer';
export const WORDS_PER_SECOND = 2.4;

export const ROLE = `Bạn là người viết kịch bản video ngắn (Reels/TikTok) cho dự án Endogenism, viết bằng giọng của chính tác giả.
Bạn nhận một ý tưởng đã được tách từ bài viết gốc, cùng toàn văn bài viết.

Yêu cầu bắt buộc:
- Tuân thủ tuyệt đối LUẬT CỨNG của Endogenism.
- Viết đúng cấu trúc beats của format được giao. \`beats\` KHÔNG chứa hook (hook nằm riêng trong \`hooks\`).
- Đúng 3 hook, 3 style khác nhau. Phần thân phải nối tự nhiên với bất kỳ hook nào.
- Ưu tiên dùng câu chữ, ẩn dụ của bài gốc. Không bịa số liệu, nghiên cứu hay trích dẫn.
- Viết để ĐỌC THÀNH TIẾNG: câu ngắn, không ký hiệu, không emoji, không viết tắt.
- Độ dài tổng (hook + beats) nằm trong khoảng số từ mục tiêu.
- caption và hashtags theo skill short-form-retention.`;

export function targetWords(duration: [number, number]): [number, number] {
  return [
    Math.round(duration[0] * WORDS_PER_SECOND),
    Math.round(duration[1] * WORDS_PER_SECOND),
  ];
}

export function userPrompt(
  ctx: Ctx,
  video: any,
  idea: any,
  sourceBody: string
): string {
  const fmt = ctx.settings.formats[video.format];
  const [lo, hi] = targetWords(fmt.duration);
  const quotes = idea.quotes ? JSON.parse(idea.quotes) : [];
  const ideaView = {
    angle: idea.angle,
    insight: idea.insight,
    quotes,
    metaphor: idea.metaphor,
    practice: idea.practice,
    question: idea.question,
    emotion: idea.emotion,
    hook_seed: idea.hook_seed,
  };

  const parts = [
    `FORMAT: ${video.format} — ${fmt.label} — ${fmt.duration[0]}–${fmt.duration[1]} giây ≈ ${lo}–${hi} từ.`,
    `Ý TƯỞNG:\n${JSON.stringify(ideaView, null, 2)}`,
  ];

  const weights = ctx.db.getKv<Record<string, number>>('hook_style_weights') || {};
  const weightEntries = Object.entries(weights);
  if (weightEntries.length > 0) {
    const best = weightEntries.sort((a, b) => b[1] - a[1]).slice(0, 2).map((e) => e[0]);
    parts.push(
      `Dữ liệu thực tế: các style hook đang được khán giả lưu/chia sẻ nhiều nhất: ${best.join(', ')}. ` +
      'Nên có ít nhất một hook thuộc các style này.'
    );
  }

  if (video.remake_of) {
    const oldRow = ctx.db.video(video.remake_of);
    const oldScript = oldRow?.script ? JSON.parse(oldRow.script) : {};
    const oldHooks = (oldScript.hooks || []).map((h: any) => h.text);
    parts.push(
      'ĐÂY LÀ BẢN LÀM LẠI của một video được yêu thích. Giữ tinh thần, nhưng hook và cách triển khai phải MỚI. ' +
      `Không lặp lại các hook cũ: ${JSON.stringify(oldHooks)}`
    );
  }

  const review = video.critic ? JSON.parse(video.critic) : {};
  if (review.feedback || review.violations) {
    const issues = [...(review.violations || []), ...(review.feedback || [])];
    parts.push(
      'BẢN TRƯỚC CHƯA ĐẠT. Sửa theo góp ý sau:\n' +
      issues.map((x: string) => `- ${x}`).join('\n')
    );
  }

  parts.push(`BÀI VIẾT GỐC:\n<article>\n${sourceBody}\n</article>`);
  return parts.join('\n\n');
}

import { agentSystemPrompt, getAgentProfile } from '../skills.js';

export async function runOne(ctx: Ctx, llm: LLM, video: any): Promise<void> {
  const idea = ctx.db.one<any>('SELECT * FROM ideas WHERE id = ?', video.idea_id);
  const body = articleBody(ctx, video.article_id);

  const profile = getAgentProfile(ctx, 'writer');
  const systemPrompt = agentSystemPrompt(ctx, 'writer', ROLE, [`format-${video.format}`]);

  const script = await llm.structured<Script>({
    model: profile.model || ctx.settings.models['writer'],
    system: systemPrompt,
    user: userPrompt(ctx, video, idea, body),
    schema: ScriptSchema,
    maxTokens: 3000,
    temperature: profile.temperature ?? 0.85,
  });

  const roundNo = (video.critic_rounds || 0) + 1;
  ctx.db.updateVideo(video.id, {
    status: VideoStatus.SCRIPTED,
    script,
  });

  const hooks = script.hooks.map((h) => `[${h.style}] ${h.text}`).join(' | ');
  ctx.event(AGENT, `Bản nháp vòng ${roundNo}: ${hooks}`, { videoId: video.id });
}
