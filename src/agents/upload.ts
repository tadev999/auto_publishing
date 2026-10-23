import path from 'node:path';
import { Ctx } from '../context.js';
import { VideoStatus } from '../db.js';
import { upload } from '../integrations/storage.js';
import { videoDir } from '../media.js';

export const AGENT = 'upload';

export async function runOne(ctx: Ctx, video: any): Promise<void> {
  const s = ctx.settings;
  const needsUrl = s.publish.platforms.includes('instagram') && !s.publish.dry_run;
  let key: string | null = null;

  if (needsUrl) {
    const videoPath = path.join(videoDir(s.dataDir, video.id), 'video.mp4');
    const formattedId = String(video.id).padStart(5, '0');
    key = await upload(s, videoPath, `videos/${formattedId}-${video.format}.mp4`);
  }

  ctx.db.updateVideo(video.id, {
    status: VideoStatus.QUEUED,
    r2_key: key,
  });

  ctx.event(AGENT, `Vào hàng đợi${key ? ' · R2 ' + key : ''}`, { videoId: video.id });
}
