import path from 'node:path';
import { Ctx } from '../context.js';
import { VideoStatus } from '../db.js';
import { LLM } from '../llm.js';
import { extractFrames, probe, videoDir } from '../media.js';
import { QAReport, QAReportSchema } from '../schemas.js';

export const AGENT = 'qa';

export const VISION_PROMPT = `Bạn kiểm tra chất lượng khung hình của một video dọc 9:16 cho TikTok/Reels.
Ảnh là 4 khung hình lấy ở 15%, 40%, 65%, 90% thời lượng.

Chỉ đánh FAIL khi có lỗi RÕ RÀNG:
- Chữ bị cắt khỏi khung, chồng lên nhau, hoặc không đọc được.
- Chữ chính nằm trong vùng bị giao diện app che: 10% trên cùng, 22% dưới cùng, 12% mép phải.
- Lỗi hình (khung đen toàn bộ khi đáng lẽ có nội dung, hình vỡ, méo).
- Hình ảnh không phù hợp với nội dung tĩnh lặng, chữa lành (bạo lực, phản cảm, quảng cáo, logo thương hiệu nổi bật).
Lỗi dấu tiếng Việt hiển thị sai cũng là FAIL.
Nếu không có lỗi rõ ràng, passed = true. \`issues\` mô tả ngắn bằng tiếng Việt.`;

export function sendBack(ctx: Ctx, video: any, feedback: string[], agent: string): void {
  const review = video.critic
    ? typeof video.critic === 'string'
      ? JSON.parse(video.critic)
      : { ...video.critic }
    : {};
  review.feedback = feedback;
  review.violations = [];

  const rounds = (video.critic_rounds || 0) + 1;
  if (rounds > ctx.settings.critic.max_rounds) {
    ctx.db.updateVideo(video.id, {
      status: VideoStatus.FAILED,
      critic: review,
      error: `${agent}: ${feedback.join('; ')}`,
    });
    ctx.db.run("UPDATE ideas SET status = 'skipped' WHERE id = ?", video.idea_id);
    ctx.event(agent, `LOẠI: ${feedback.join('; ')}`, {
      videoId: video.id,
      level: 'warning',
    });
    return;
  }

  ctx.db.updateVideo(video.id, {
    status: VideoStatus.PLANNED,
    critic: review,
    critic_rounds: rounds,
    media: {},
  });
  ctx.event(agent, `Trả về writer: ${feedback.join('; ')}`, { videoId: video.id });
}

export async function runOne(ctx: Ctx, llm: LLM, video: any): Promise<void> {
  const s = ctx.settings;
  const out = videoDir(s.dataDir, video.id);
  const videoPath = path.join(out, 'video.mp4');
  const info = probe(videoPath);

  const [lo, hi] = s.formats[video.format].duration;
  const minD = lo - s.render.duration_slack[0];
  const maxD = hi + s.render.duration_slack[1];

  if (info.duration < minD || info.duration > maxD) {
    const hint = info.duration > maxD ? 'Rút gọn' : 'Mở rộng';
    sendBack(
      ctx,
      video,
      [`Video dài ${info.duration.toFixed(1)}s, cần ${lo}–${hi}s. ${hint} script cho đúng độ dài.`],
      AGENT
    );
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

  const report = await llm.gpt<QAReport>({
    model: s.models['qa_vision'],
    system: VISION_PROMPT,
    user: 'Kiểm tra 4 khung hình sau.',
    schema: QAReportSchema,
    images: frames,
    temperature: 0,
  });

  if (!report.passed) {
    const issues = report.issues.length > 0
      ? report.issues.map((i) => `QA hình ảnh: ${i}`)
      : ['QA hình ảnh không đạt'];
    sendBack(ctx, video, issues, AGENT);
    return;
  }

  ctx.db.updateVideo(video.id, { status: VideoStatus.QA_PASSED });
  ctx.event(AGENT, `Đạt · ${info.duration.toFixed(1)}s · ${info.width}x${info.height}`, {
    videoId: video.id,
  });
}
