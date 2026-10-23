import fs from 'node:fs';
import path from 'node:path';
import { Ctx } from '../context.js';
import { bestFile, download, searchPortraitVideos } from '../integrations/pexels.js';
import { videoDir } from '../media.js';

export const AGENT = 'visual';
export const SECONDS_PER_CLIP = 7;
export const USED_KEY = 'pexels_used_ids';

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

async function stockClips(
  ctx: Ctx,
  keywords: string[],
  count: number,
  publicDir: string
): Promise<any[]> {
  const used: number[] = ctx.db.getKv<number[]>(USED_KEY) || [];
  const picked: any[] = [];

  for (const kw of keywords) {
    const items = await searchPortraitVideos(ctx.settings, kw);
    for (const item of items) {
      if (picked.length >= count) break;
      if (used.includes(item.id) || picked.some((p) => p.id === item.id)) continue;
      const f = bestFile(item);
      if (!f) continue;

      const name = `clip_${picked.length}.mp4`;
      const dest = path.join(publicDir, name);
      await download(f.link, dest);
      picked.push({
        id: item.id,
        file: name,
        author: item.user?.name,
        url: item.url,
        keyword: kw,
      });
    }
    if (picked.length >= count) break;
  }

  ctx.db.setKv(
    USED_KEY,
    [...used, ...picked.map((p) => p.id)].slice(-500)
  );
  return picked;
}

export async function runOne(ctx: Ctx, video: any): Promise<Record<string, any>> {
  const fmt = ctx.settings.formats[video.format];
  const media = video.media
    ? typeof video.media === 'string'
      ? JSON.parse(video.media)
      : { ...video.media }
    : {};

  const publicDir = path.join(videoDir(ctx.settings.dataDir, video.id), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  if (fmt.visual === 'stock' && !media.clips) {
    const script = typeof video.script === 'string' ? JSON.parse(video.script) : video.script;
    const speechSec = media.speech_seconds || 30;
    const count = Math.max(2, Math.min(5, Math.ceil(speechSec / SECONDS_PER_CLIP)));
    const keywords = [...(script?.visual_keywords || []), 'calm window light'];

    media.clips = await stockClips(ctx, keywords, count, publicDir);
    ctx.event(
      AGENT,
      `${media.clips.length} cảnh quay: ${media.clips.map((c: any) => c.keyword).join(', ')}`,
      { videoId: video.id }
    );
  }

  if (!('music' in media)) {
    const track = pickMusic(ctx, fmt.music_mood, video.id);
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

  return media;
}
