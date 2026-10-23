import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { Ctx } from '../context.js';
import { VideoStatus } from '../db.js';
import { MediaError, normalizeLoudness, videoDir } from '../media.js';
import * as visual from './visual.js';

const execFileAsync = promisify(execFile);

export const AGENT = 'render';

export function buildProps(
  ctx: Ctx,
  video: any,
  media: Record<string, any>,
  captions: Record<string, any>
): Record<string, any> {
  const s = ctx.settings;
  return {
    format: video.format,
    label: s.formats[video.format]?.label || video.format,
    episode: video.episode,
    handle: s.brand.handle || '',
    pages: captions.pages,
    durationInSeconds: captions.duration,
    voice: media.voice,
    music: media.music,
    musicVolume: s.render.music_volume,
    clips: (media.clips || []).map((c: any) => c.file),
    seed: video.id,
  };
}

export async function runOne(ctx: Ctx, video: any): Promise<void> {
  const media = await visual.runOne(ctx, video);
  ctx.db.updateVideo(video.id, { media });

  const out = videoDir(ctx.settings.dataDir, video.id);
  const captionsPath = path.join(out, media.captions);
  const captions = JSON.parse(fs.readFileSync(captionsPath, 'utf-8'));

  const propsPath = path.join(out, 'props.json');
  fs.writeFileSync(propsPath, JSON.stringify(buildProps(ctx, video, media, captions), null, 2), 'utf-8');

  const rawPath = path.join(out, 'raw.mp4');
  const finalPath = path.join(out, 'video.mp4');

  const remotionDir = ctx.settings.path('remotion_dir');
  const publicDir = path.join(out, 'public');

  const args = [
    'remotion',
    'render',
    'src/index.ts',
    video.format,
    rawPath,
    `--props=${propsPath}`,
    `--public-dir=${publicDir}`,
    '--codec=h264',
    '--crf=18',
    '--log=error',
  ];

  try {
    await execFileAsync('npx', args, {
      cwd: remotionDir,
      timeout: 1800000,
    });
  } catch (err: any) {
    const output = (err.stderr || err.stdout || err.message || '').slice(-1200);
    throw new MediaError(`Remotion render failed: ${output}`);
  }

  normalizeLoudness(rawPath, finalPath, ctx.settings.render.loudness_lufs);
  if (fs.existsSync(rawPath)) {
    fs.unlinkSync(rawPath);
  }

  media.video = 'video.mp4';
  ctx.db.updateVideo(video.id, {
    status: VideoStatus.RENDERED,
    media,
  });

  const sizeMb = fs.statSync(finalPath).size / 1048576;
  ctx.event(
    AGENT,
    `Dựng xong ${captions.duration.toFixed(1)}s · ${sizeMb.toFixed(1)} MB → ${finalPath}`,
    { videoId: video.id }
  );
}
