import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Ctx } from '../context.js';
import * as pexels from '../integrations/pexels.js';
import * as pixabay from '../integrations/pixabay.js';
import { requireBin, videoDir } from '../media.js';
import { z } from 'zod';
import { agentTask } from '../agentTask.js';

export const AGENT = 'visual';
export const SECONDS_PER_CLIP = 7;
export const USED_KEY = 'stock_used_ids';

export async function productionDirection(ctx: Ctx, video: { id: number; script: unknown; format: string }) {
  const format = ctx.settings.formats[video.format];
  const root = ctx.settings.path('music_dir');
  const moods = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name) : [];
  const allowedMoods = [...new Set([format.music_mood, ...moods])];
  const result = await agentTask(ctx, 'producer',
    'Lập hướng sản xuất từ kịch bản đã duyệt. Không đổi lời thoại. Trả về 3–5 từ khóa tiếng Anh cụ thể để tìm cảnh quay, và một musicMood trong danh sách cho phép. Không tạo đường dẫn, URL hoặc đổi cấu hình render.',
    JSON.stringify({ script: video.script, format: video.format, allowedMoods }),
    z.object({ keywords: z.array(z.string().trim().min(1).max(100)).min(3).max(5), musicMood: z.string().min(1) }));
  if (!allowedMoods.includes(result.musicMood)) throw new Error('Kỹ Sư Sản Xuất chọn loại nhạc ngoài danh sách cho phép.');
  return result;
}

function pickMusic(ctx: Ctx, mood: string, seed: number): string | null {
  const root = ctx.settings.path('music_dir');
  const moodDir = path.join(root, mood);
  let tracks: string[] = [];

  if (fs.existsSync(moodDir)) {
    tracks = fs
      .readdirSync(moodDir)
      .filter((f) => f.endsWith('.mp3'))
      .map((f) => path.join(moodDir, f));
  }
  if (tracks.length === 0 && fs.existsSync(root)) {
    // recursive search
    function scan(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (entry.isFile() && entry.name.endsWith('.mp3')) tracks.push(full);
      }
    }
    scan(root);
  }

  if (tracks.length === 0) return null;
  tracks.sort();
  return tracks[seed % tracks.length];
}

export function generateFallbackClip(destPath: string, duration = 10): boolean {
  try {
    const ffmpeg = requireBin('ffmpeg');
    child_process.spawnSync(
      ffmpeg,
      [
        '-y',
        '-f', 'lavfi',
        '-i', `color=c=#151926:s=1080x1920:d=${duration}:r=30`,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        destPath,
      ],
      { timeout: 15000 }
    );
    return fs.existsSync(destPath) && fs.statSync(destPath).size > 0;
  } catch {
    return false;
  }
}

async function stockClips(
  ctx: Ctx,
  keywords: string[],
  count: number,
  publicDir: string
): Promise<any[]> {
  const used: number[] = ctx.db.getKv<number[]>(USED_KEY) || [];
  const picked: any[] = [];
  const hasPixabay = Boolean(ctx.settings.secret('PIXABAY_API_KEY', false));
  const hasPexels = Boolean(ctx.settings.secret('PEXELS_API_KEY', false));

  try {
    for (const kw of keywords) {
      if (picked.length >= count) break;

      if (hasPixabay) {
        let items: pixabay.PixabayVideo[] = [];
        try {
          items = await pixabay.searchVideos(ctx.settings, kw);
        } catch (err: any) {
          ctx.event(AGENT, `Pixabay API không khả dụng cho "${kw}": ${err.message}`, { level: 'warning' });
        }

        for (const item of items) {
          if (picked.length >= count) break;
          if (used.includes(item.id) || picked.some((p) => p.id === item.id)) continue;
          const f = pixabay.bestFile(item);
          if (!f) continue;

          const name = `clip_${picked.length}.mp4`;
          const dest = path.join(publicDir, name);
          try {
            await pixabay.download(f.url, dest);
            picked.push({
              id: item.id,
              file: name,
              author: item.user,
              url: item.url,
              keyword: kw,
              source: 'pixabay',
            });
          } catch {}
        }
      } else if (hasPexels) {
        let items: pexels.PexelsVideo[] = [];
        try {
          items = await pexels.searchPortraitVideos(ctx.settings, kw);
        } catch (err: any) {
          ctx.event(AGENT, `Pexels API không khả dụng cho "${kw}": ${err.message}`, { level: 'warning' });
        }

        for (const item of items) {
          if (picked.length >= count) break;
          if (used.includes(item.id) || picked.some((p) => p.id === item.id)) continue;
          const f = pexels.bestFile(item);
          if (!f) continue;

          const name = `clip_${picked.length}.mp4`;
          const dest = path.join(publicDir, name);
          try {
            await pexels.download(f.link, dest);
            picked.push({
              id: item.id,
              file: name,
              author: item.user?.name,
              url: item.url,
              keyword: kw,
              source: 'pexels',
            });
          } catch {}
        }
      }
    }
  } catch (err: any) {
    ctx.event(AGENT, `Không thể tải stock clips: ${err.message}`, { level: 'warning' });
  }

  // Fallback nếu thiếu clip (offline hoặc Pexels quota/key bị lỗi)
  if (picked.length < count) {
    const fallbackDir = path.resolve(ctx.settings.dataDir, '../assets/broll_fallback');
    let localClips: string[] = [];
    if (fs.existsSync(fallbackDir)) {
      localClips = fs.readdirSync(fallbackDir).filter((f) => f.endsWith('.mp4')).map((f) => path.join(fallbackDir, f));
    }

    while (picked.length < count) {
      const idx = picked.length;
      const name = `clip_${idx}.mp4`;
      const dest = path.join(publicDir, name);

      if (localClips.length > 0) {
        const src = localClips[idx % localClips.length];
        fs.copyFileSync(src, dest);
        picked.push({
          id: 900000 + idx,
          file: name,
          author: 'Local Fallback',
          url: '',
          keyword: 'local-fallback',
        });
      } else {
        generateFallbackClip(dest, SECONDS_PER_CLIP + 3);
        picked.push({
          id: 990000 + idx,
          file: name,
          author: 'Synthetic Ambient',
          url: '',
          keyword: 'synthetic-gradient',
        });
      }
    }
  }

  ctx.db.setKv(
    USED_KEY,
    [...used, ...picked.map((p) => p.id)].slice(-500)
  );
  return picked;
}

export async function runOne(ctx: Ctx, video: any): Promise<Record<string, any>> {
  ctx.event(AGENT, 'Bắt đầu chuẩn bị cảnh quay và nhạc nền', { videoId: video.id, phase: 'started' });
  const fmt = ctx.settings.formats[video.format];
  const media = video.media
    ? typeof video.media === 'string'
      ? JSON.parse(video.media)
      : { ...video.media }
    : {};
  const direction = await productionDirection(ctx, video);
  media.production_direction = direction;

  const publicDir = path.join(videoDir(ctx.settings.dataDir, video.id), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  if (fmt.visual === 'stock' && !media.clips) {
    const speechSec = media.speech_seconds || 30;
    const count = Math.max(2, Math.min(5, Math.ceil(speechSec / SECONDS_PER_CLIP)));
    const keywords = direction.keywords;

    media.clips = await stockClips(ctx, keywords, count, publicDir);
    ctx.event(
      AGENT,
      `${media.clips.length} cảnh quay: ${media.clips.map((c: any) => c.keyword).join(', ')}`,
      { videoId: video.id }
    );
  }

  if (!('music' in media)) {
    const track = pickMusic(ctx, direction.musicMood, video.id);
    if (track) {
      fs.copyFileSync(track, path.join(publicDir, 'music.mp3'));
      media.music = 'music.mp3';
      media.music_track = path.basename(track);
    } else {
      media.music = null;
      ctx.event(AGENT, 'Chưa có nhạc trong assets/music — video sẽ không có nhạc nền', {
        videoId: video.id,
        level: 'warning',
      });
    }
  }

  ctx.event(AGENT, 'Đã chuẩn bị cảnh quay và nhạc nền', { videoId: video.id, phase: 'finished' });
  return media;
}
