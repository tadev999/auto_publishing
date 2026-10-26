import path from 'node:path';
import { Settings } from '../config.js';
import { articleBody, normalize } from '../content.js';
import { Ctx } from '../context.js';
import { VideoStatus } from '../db.js';
import { LLM } from '../llm.js';
import { extractFrames, probe, videoDir } from '../media.js';
import { CriticReport, CriticReportSchema, QAReport, QAReportSchema, Script, ScriptSchema } from '../schemas.js';
import { agentSystemPrompt, getAgentProfile } from '../skills.js';
import { targetWords } from './writer.js';

export const AGENT = 'critic';

export const ROLE = `Bạn là biên tập viên khó tính kiêm "Người giữ triết lý" của dự án Endogenism.
Bạn KHÔNG viết lại script. Bạn chấm điểm và góp ý để người viết tự sửa.

Thang điểm 0–10 cho từng tiêu chí (chấm trên script khi dùng hook tốt nhất):
- hook: dừng được ngón tay lướt trong 2 giây VÀ giúp người xem nhận ra mình (không dọa, không giật tít).
- philosophy: đúng tinh thần Endogenism, không vi phạm luật cứng nào. Chỉ cho 9–10 khi hoàn toàn sạch.
- single_idea: một video một ý, mạch rõ, không lan man.
- voice: nghe như chính tác giả (ấm, ngang hàng, câu ngắn, ẩn dụ đời thường), không giọng coach/MC.
- ending: câu kết mở ra phản tư hoặc mời bình luận, không ra lệnh; tốt nhất có callback về hook.
- readability: dễ đọc thành tiếng, đúng độ dài mục tiêu, đúng cấu trúc beats của format.

Chấm nghiêm khắc: 8 là "tốt, đăng được", 9–10 là "xuất sắc". Đừng cho điểm cao vì lịch sự.
\`violations\`: liệt kê từng vi phạm luật cứng kèm câu trích cụ thể; để trống nếu không có.
\`feedback\`: 2–5 góp ý cụ thể bằng tiếng Việt, mỗi góp ý chỉ rõ beat nào và sửa thế nào.`;

export function weightedTotal(settings: Settings, report: CriticReport): number {
  const scores: Record<string, number> = report.scores as any;
  const weights = settings.critic.weights;
  let totalScore = 0;
  let totalWeight = 0;
  for (const [k, w] of Object.entries(weights)) {
    totalScore += (scores[k] || 0) * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? Number((totalScore / totalWeight).toFixed(2)) : 0;
}

export function deterministicChecks(ctx: Ctx, video: any, script: Script): string[] {
  const issues: string[] = [];
  const fmt = ctx.settings.formats[video.format];
  const [lo, hi] = targetWords(fmt.duration);

  const beatsWords = script.beats.map((b) => b.text).join(' ').trim().split(/\s+/).filter(Boolean).length;
  const maxHookWords = Math.max(
    ...script.hooks.map((h) => h.text.trim().split(/\s+/).filter(Boolean).length),
    0
  );
  const words = beatsWords + maxHookWords;

  if (words > hi * 1.15) {
    issues.push(`Script dài ${words} từ, vượt mục tiêu ${lo}–${hi} từ. Cắt bớt beat yếu nhất.`);
  }
  if (words < lo * 0.8) {
    issues.push(`Script chỉ ${words} từ, ngắn hơn mục tiêu ${lo}–${hi} từ.`);
  }
  const hookStyles = new Set(script.hooks.map((h) => h.style));
  if (hookStyles.size < 3) {
    issues.push('3 hook phải thuộc 3 style khác nhau.');
  }

  if (video.format === 'doc-cham') {
    const source = normalize(articleBody(ctx, video.article_id));
    for (const b of script.beats) {
      if (b.role === 'quote' && !source.includes(normalize(b.text))) {
        issues.push(`Beat quote không phải nguyên văn bài gốc: "${b.text}"`);
      }
    }
  }

  return issues;
}

export async function runOne(ctx: Ctx, llm: LLM, video: any): Promise<void> {
  const scriptRaw = typeof video.script === 'string' ? JSON.parse(video.script) : video.script;
  const script = ScriptSchema.parse(scriptRaw);

  const fmt = ctx.settings.formats[video.format];
  const [lo, hi] = targetWords(fmt.duration);
  const idea = ctx.db.one<any>('SELECT insight, quotes FROM ideas WHERE id = ?', video.idea_id);

  const profile = getAgentProfile(ctx, 'critic');
  const systemPrompt = agentSystemPrompt(ctx, 'critic', ROLE, [`format-${video.format}`]);

  const report = await llm.structured<CriticReport>({
    model: profile.model || ctx.settings.models['critic'],
    temperature: profile.temperature ?? 0.3,
    system: systemPrompt,
    user: [
      `FORMAT: ${video.format} — ${fmt.label} — mục tiêu ${lo}–${hi} từ.`,
      `Ý chính của bài gốc: ${idea?.insight}`,
      `Trích dẫn gốc: ${idea?.quotes}`,
      `SCRIPT:\n${JSON.stringify(script, null, 2)}`,
    ].join('\n\n'),
    schema: CriticReportSchema,
  });

  const checks = deterministicChecks(ctx, video, script);
  const total = weightedTotal(ctx.settings, report);
  const philosophy = report.scores.philosophy;

  const passed =
    total >= ctx.settings.critic.pass_total &&
    philosophy >= ctx.settings.critic.pass_philosophy &&
    report.violations.length === 0 &&
    checks.length === 0;

  const roundNo = (video.critic_rounds || 0) + 1;
  const hook = script.hooks[report.best_hook_index] || script.hooks[0];

  const prevCritic = video.critic
    ? typeof video.critic === 'string'
      ? JSON.parse(video.critic)
      : video.critic
    : {};

  const review = {
    round: roundNo,
    total,
    passed,
    scores: report.scores,
    best_hook_index: report.best_hook_index,
    violations: report.violations,
    feedback: [...checks, ...report.feedback],
    history: [
      ...(prevCritic.history || []),
      { round: roundNo, total, philosophy },
    ],
  };

  const verdict = `vòng ${roundNo}: ${total}/10 (triết lý ${philosophy})`;

  if (passed) {
    const finalBeats = [{ role: 'hook', text: hook.text, emphasis: [] }, ...script.beats];
    const finalScript = { ...script, final_beats: finalBeats };

    ctx.db.updateVideo(video.id, {
      status: VideoStatus.APPROVED,
      script: finalScript,
      critic: review,
      critic_rounds: roundNo,
      hook_style: hook.style,
    });
    ctx.event(AGENT, `DUYỆT ${verdict} · hook [${hook.style}] "${hook.text}"`, { videoId: video.id });
    return;
  }

  const allIssues = [...report.violations, ...checks, ...report.feedback];
  const reasons = allIssues.slice(0, 3).join('; ');

  if (roundNo >= ctx.settings.critic.max_rounds) {
    ctx.db.updateVideo(video.id, {
      status: VideoStatus.FAILED,
      critic: review,
      critic_rounds: roundNo,
      error: `critic_rejected after ${roundNo} rounds`,
    });
    ctx.db.run("UPDATE ideas SET status = 'skipped' WHERE id = ?", video.idea_id);
    ctx.event(AGENT, `LOẠI sau ${roundNo} vòng (${verdict}). ${reasons}`, {
      videoId: video.id,
      level: 'warning',
    });
    return;
  }

  ctx.db.updateVideo(video.id, {
    status: VideoStatus.PLANNED,
    critic: review,
    critic_rounds: roundNo,
  });
  ctx.event(AGENT, `TRẢ LẠI ${verdict}. ${reasons}`, { videoId: video.id });
}

export const VISION_PROMPT = `Bạn kiểm tra chất lượng khung hình của một video dọc 9:16 cho TikTok/Reels/Shorts.
Ảnh là 4 khung hình lấy ở 15%, 40%, 65%, 90% thời lượng.

Chỉ đánh FAIL khi có lỗi RÕ RÀNG:
- Chữ bị cắt khỏi khung, chồng lên nhau, hoặc không đọc được.
- Chữ chính nằm trong vùng bị giao diện app che: 10% trên cùng, 22% dưới cùng, 12% mép phải.
- Lỗi hình (khung đen toàn bộ khi đáng lẽ có nội dung, hình vỡ, méo).
- Hình ảnh không phù hợp với nội dung tĩnh lặng, chữa lành (bạo lực, phản cảm, quảng cáo, logo thương hiệu nổi bật).
Lỗi dấu tiếng Việt hiển thị sai cũng là FAIL.
Nếu không có lỗi rõ ràng, passed = true. \`issues\` mô tả ngắn bằng tiếng Việt.`;

export async function runVisionQA(ctx: Ctx, llm: LLM, video: any): Promise<void> {
  const s = ctx.settings;
  const out = videoDir(s.dataDir, video.id);
  const videoPath = path.join(out, 'video.mp4');
  const info = probe(videoPath);

  const [lo, hi] = s.formats[video.format].duration;
  const minD = lo - s.render.duration_slack[0];
  const maxD = hi + s.render.duration_slack[1];

  if (info.duration < minD || info.duration > maxD) {
    const hint = info.duration > maxD ? 'Rút gọn' : 'Mở rộng';
    const feedback = [`Video dài ${info.duration.toFixed(1)}s, cần ${lo}–${hi}s. ${hint} script cho đúng độ dài.`];
    ctx.event(AGENT, `QA trả về: ${feedback.join('; ')}`, { videoId: video.id });
    ctx.db.updateVideo(video.id, {
      status: VideoStatus.PLANNED,
      critic_rounds: (video.critic_rounds || 0) + 1,
      media: {},
    });
    return;
  }

  const tech: string[] = [];
  if (info.width !== s.render.width || info.height !== s.render.height) {
    tech.push(`Sai kích thước ${info.width}x${info.height}`);
  }
  if (!info.hasAudio) {
    tech.push('Không có âm thanh');
  }
  if (tech.length > 0) {
    throw new Error(tech.join('; '));
  }

  const framesDir = path.join(out, 'frames');
  const timepoints = [0.15, 0.4, 0.65, 0.9].map((p) => info.duration * p);
  const frames = extractFrames(videoPath, timepoints, framesDir);

  const profile = getAgentProfile(ctx, 'critic');
  const report = await llm.structured<QAReport>({
    model: profile.model,
    system: agentSystemPrompt(ctx, 'critic', VISION_PROMPT, [`format-${video.format}`]),
    user: 'Kiểm tra 4 khung hình sau.',
    schema: QAReportSchema,
    images: frames,
    temperature: profile.temperature,
  });

  if (!report.passed) {
    const issues = report.issues.length > 0
      ? report.issues.map((i) => `QA hình ảnh: ${i}`)
      : ['QA hình ảnh không đạt'];
    ctx.event(AGENT, `QA không đạt: ${issues.join('; ')}`, { videoId: video.id });
    ctx.db.updateVideo(video.id, {
      status: VideoStatus.PLANNED,
      critic_rounds: (video.critic_rounds || 0) + 1,
      media: {},
    });
    return;
  }

  ctx.db.updateVideo(video.id, { status: VideoStatus.QA_PASSED });
  ctx.event(AGENT, `Duyệt chất lượng video xuất bản · ${info.duration.toFixed(1)}s · ${info.width}x${info.height}`, {
    videoId: video.id,
  });
}
