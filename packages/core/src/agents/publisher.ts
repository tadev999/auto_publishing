import path from 'node:path';
import { Ctx } from '../context.js';
import { VideoStatus, utcnow } from '../db.js';
import { Instagram } from '../integrations/instagram.js';
import { presignedUrl, upload } from '../integrations/storage.js';
import { notify } from '../integrations/telegram.js';
import { TikTok } from '../integrations/tiktok.js';
import { YouTube } from '../integrations/youtube.js';
import { probe, videoDir } from '../media.js';

export const AGENT = 'publisher';
export const PAUSE_KEY = 'paused';

export function buildCaption(ctx: Ctx, video: any, platform: string): string {
  const script = typeof video.script === 'string' ? JSON.parse(video.script) : video.script;
  const scriptTags: string[] = script.hashtags || [];
  const defaultTags: string[] = ctx.settings.brand.default_hashtags || [];
  const tags = Array.from(new Set([...scriptTags, ...defaultTags]));

  const parts = [(script.caption || '').trim(), tags.join(' ')];
  if (platform === 'instagram' && ctx.settings.publish.instagram_ai_disclosure) {
    parts.push(ctx.settings.publish.instagram_ai_disclosure);
  }
  return parts.filter(Boolean).join('\n\n');
}

function getOrCreatePublication(ctx: Ctx, videoId: number, platform: string): any {
  ctx.db.run(
    "INSERT OR IGNORE INTO publications(video_id, platform, status) VALUES(?, ?, 'pending')",
    videoId,
    platform
  );
  return ctx.db.one<any>(
    'SELECT * FROM publications WHERE video_id = ? AND platform = ?',
    videoId,
    platform
  );
}

async function publishInstagram(ctx: Ctx, video: any): Promise<any> {
  const s = ctx.settings;
  let key = video.r2_key;
  if (!key) {
    const videoPath = path.join(videoDir(s.dataDir, video.id), 'video.mp4');
    const formattedId = String(video.id).padStart(5, '0');
    key = await upload(s, videoPath, `videos/${formattedId}-${video.format}.mp4`);
    ctx.db.updateVideo(video.id, { r2_key: key });
  }

  const url = await presignedUrl(s, key);
  const caption = buildCaption(ctx, video, 'instagram');
  const result = await new Instagram(s).publishReel(url, caption);
  return {
    external_id: result.container_id,
    post_id: result.media_id,
    permalink: result.permalink,
  };
}

async function publishTikTok(ctx: Ctx, video: any): Promise<any> {
  const s = ctx.settings;
  const videoPath = path.join(videoDir(s.dataDir, video.id), 'video.mp4');
  const tt = new TikTok(s, ctx.db);
  const caption = buildCaption(ctx, video, 'tiktok');
  const info = probe(videoPath);

  const publishId = await tt.upload(
    videoPath,
    caption,
    s.publish.tiktok_mode,
    s.publish.tiktok_ai_label,
    info.duration
  );

  const status = await tt.waitUntilDone(publishId);
  const postIds = status.publicaly_available_post_id || [];
  return {
    external_id: publishId,
    post_id: postIds.length > 0 ? String(postIds[0]) : null,
    permalink: null,
    inbox: status.status === 'SEND_TO_USER_INBOX',
  };
}

async function publishYouTube(ctx: Ctx, video: any): Promise<any> {
  const s = ctx.settings;
  const videoPath = path.join(videoDir(s.dataDir, video.id), 'video.mp4');
  const yt = new YouTube(s);
  const script = typeof video.script === 'string' ? JSON.parse(video.script) : video.script;
  const title = (video.title || script.title || 'YouTube Short').slice(0, 100);
  const caption = buildCaption(ctx, video, 'youtube');
  const scriptTags: string[] = script.hashtags || [];
  const defaultTags: string[] = ctx.settings.brand.default_hashtags || [];
  const tags = Array.from(new Set([...scriptTags, ...defaultTags]));

  const result = await yt.uploadShort(videoPath, title, caption, tags, 'public');
  return {
    external_id: result.videoId,
    post_id: result.videoId,
    permalink: result.url,
  };
}

const PUBLISHERS: Record<string, (ctx: Ctx, video: any) => Promise<any>> = {
  instagram: publishInstagram,
  tiktok: publishTikTok,
  youtube: publishYouTube,
};

export async function publishVideo(ctx: Ctx, video: any): Promise<void> {
  const s = ctx.settings;

  for (const platform of s.publish.platforms) {
    const pub = getOrCreatePublication(ctx, video.id, platform);
    if (['published', 'dry_run', 'failed'].includes(pub.status)) {
      continue;
    }

    if (s.publish.dry_run) {
      ctx.db.run(
        "UPDATE publications SET status = 'dry_run', published_at = ? WHERE id = ?",
        utcnow(),
        pub.id
      );
      ctx.event(
        AGENT,
        `[DRY RUN] ${platform}: sẽ đăng lúc này\n${buildCaption(ctx, video, platform)}`,
        { videoId: video.id }
      );
      continue;
    }

    try {
      const publisherFn = PUBLISHERS[platform];
      if (!publisherFn) {
        throw new Error(`Unsupported platform: ${platform}`);
      }
      const result = await publisherFn(ctx, video);
      ctx.db.run(
        `UPDATE publications SET status = 'published', external_id = ?, post_id = ?, permalink = ?,
             published_at = ?, error = NULL WHERE id = ?`,
        result.external_id,
        result.post_id,
        result.permalink,
        utcnow(),
        pub.id
      );

      const where = result.inbox
        ? 'hộp thư nháp TikTok (bấm Đăng trong app)'
        : result.permalink || '';
      ctx.event(AGENT, `${platform}: đã đăng ${where}`, { videoId: video.id });

      if (result.inbox) {
        await notify(s, `📥 Video #${video.id} đã vào hộp nháp TikTok — mở app và bấm Đăng.`);
      }
    } catch (exc: any) {
      const attempts = (pub.attempts || 0) + 1;
      const final = attempts >= s.publish.max_attempts;
      ctx.db.run(
        'UPDATE publications SET attempts = ?, error = ?, status = ? WHERE id = ?',
        attempts,
        String(exc.message || exc).slice(0, 1000),
        final ? 'failed' : 'pending',
        pub.id
      );
      ctx.event(AGENT, `${platform} lỗi (lần ${attempts}): ${exc.message || exc}`, {
        videoId: video.id,
        level: 'error',
      });
      if (final) {
        await notify(s, `❌ Đăng ${platform} thất bại cho video #${video.id}: ${exc.message || exc}`);
      }
    }
  }

  const pubs = ctx.db.all<any>('SELECT status FROM publications WHERE video_id = ?', video.id);
  const states = new Set(pubs.map((p) => p.status));
  const doneStates = new Set(['published', 'dry_run', 'failed']);

  let allDone = true;
  for (const st of states) {
    if (!doneStates.has(st)) {
      allDone = false;
      break;
    }
  }

  if (allDone && states.size > 0) {
    const ok = states.has('published') || states.has('dry_run');
    ctx.db.updateVideo(video.id, {
      status: ok ? VideoStatus.PUBLISHED : VideoStatus.FAILED,
      error: ok ? null : 'all platforms failed',
    });
  }
}

export async function run(ctx: Ctx, now?: Date): Promise<number> {
  if (ctx.db.getKv(PAUSE_KEY)) {
    ctx.event(AGENT, 'Đang tạm dừng (npm run endo resume để chạy lại)', { level: 'warning' });
    return 0;
  }

  const nowIso = (now || new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const due = ctx.db.all<any>(
    'SELECT * FROM videos WHERE status = ? AND slot_at <= ? ORDER BY slot_at',
    VideoStatus.QUEUED,
    nowIso
  );

  for (const video of due) {
    await publishVideo(ctx, video);
  }
  return due.length;
}
