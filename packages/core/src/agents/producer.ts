import fs from 'node:fs';
import path from 'node:path';
import { Ctx } from '../context.js';
import { VideoStatus } from '../db.js';
import { videoDir } from '../media.js';
import * as render from './render.js';
import * as visual from './visual.js';
import * as voice from './voice.js';

export const AGENT = 'producer';

/**
 * ĐẠO DIỄN SẢN XUẤT (PRODUCER)
 * Phụ trách toàn bộ quy trình sản xuất đa phương tiện từ kịch bản đã duyệt:
 * 1. Chuyển ngữ/Voiceover (ElevenLabs) + Bắt nhịp phụ đề (Whisper/Alignment)
 * 2. Visual Selection (Pexels B-Roll + Ambient Music + Offline Fallback)
 * 3. Remotion Video Rendering & Chuẩn hóa âm thanh LUFS
 */
export async function produceVideo(ctx: Ctx, video: any): Promise<void> {
  ctx.event(AGENT, `Bắt đầu sản xuất đa phương tiện cho video #${video.id} [${video.format}]`, {
    videoId: video.id,
  });

  // Bước 1: Thu âm giọng đọc & căn phụ đề nếu chưa có
  if (video.status === VideoStatus.APPROVED || !video.media?.voice) {
    ctx.event(AGENT, `Đang thu âm voiceover và căn thời gian phụ đề...`, { videoId: video.id });
    await voice.runOne(ctx, video);
    // Tải lại video state mới nhất
    video = ctx.db.one('SELECT * FROM videos WHERE id = ?', video.id);
  }

  // Bước 2: Chuẩn bị Visuals & Music (có offline fallback)
  ctx.event(AGENT, `Đang tuyển chọn B-Roll cảnh quay và phối nhạc nền...`, { videoId: video.id });
  const media = await visual.runOne(ctx, video);
  ctx.db.updateVideo(video.id, { media });
  video.media = media;

  // Bước 3: Dựng phim Remotion với đa luồng tối ưu
  ctx.event(AGENT, `Đang kết xuất video qua Remotion Engine (concurrency: 4)...`, { videoId: video.id });
  await render.runOne(ctx, video);

  ctx.event(AGENT, `Hoàn tất sản xuất video #${video.id}! Sẵn sàng kiểm duyệt chất lượng.`, {
    videoId: video.id,
  });
}

export const runOne = produceVideo;
