import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaError';
  }
}

export interface Probe {
  duration: number;
  width: number;
  height: number;
  has_audio: boolean;
  hasAudio: boolean;
}

export function videoDir(dataDir: string, videoId: number): string {
  const d = path.join(dataDir, 'media', String(videoId).padStart(5, '0'));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function requireBin(binary: 'ffmpeg' | 'ffprobe'): string {
  // 1. Kiểm tra trong remotion node_modules (prebuilt bundle)
  const remotionComp = path.join(
    ROOT,
    'remotion',
    'node_modules',
    '@remotion',
    'compositor-darwin-arm64'
  );
  const bundled = path.join(remotionComp, binary);
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  // 2. Kiểm tra trong PATH
  try {
    const res = child_process.execSync(`which ${binary}`, { encoding: 'utf8' }).trim();
    if (res && fs.existsSync(res)) return res;
  } catch {}

  throw new MediaError(`'${binary}' not found in PATH or remotion packages.`);
}

function runBin(args: string[], timeout = 600000): child_process.SpawnSyncReturns<Buffer> {
  const env = { ...process.env };
  const remotionComp = path.join(
    ROOT,
    'remotion',
    'node_modules',
    '@remotion',
    'compositor-darwin-arm64'
  );
  if (fs.existsSync(remotionComp)) {
    env.DYLD_LIBRARY_PATH = `${remotionComp}:${env.DYLD_LIBRARY_PATH || ''}`;
  }

  const res = child_process.spawnSync(args[0], args.slice(1), {
    env,
    timeout,
    maxBuffer: 50 * 1024 * 1024,
  });

  if (res.error) {
    throw new MediaError(`${path.basename(args[0])} error: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const errText = res.stderr?.toString('utf8').slice(-800) || res.stdout?.toString('utf8').slice(-800);
    throw new MediaError(`${path.basename(args[0])} failed: ${errText}`);
  }
  return res;
}

export function probe(filePath: string): Probe {
  const ffprobeBin = requireBin('ffprobe');
  const res = runBin([
    ffprobeBin,
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const data = JSON.parse(res.stdout.toString('utf8'));
  const videoStream = (data.streams || []).find((s: any) => s.codec_type === 'video');
  if (!videoStream) {
    throw new MediaError(`No video stream in ${filePath}`);
  }

  const hasAudio = (data.streams || []).some((s: any) => s.codec_type === 'audio');
  return {
    duration: parseFloat(data.format?.duration || '0'),
    width: parseInt(videoStream.width, 10),
    height: parseInt(videoStream.height, 10),
    has_audio: hasAudio,
    hasAudio,
  };
}

export function audioDuration(filePath: string): number {
  const ffprobeBin = requireBin('ffprobe');
  const res = runBin([
    ffprobeBin,
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    filePath,
  ]);
  return parseFloat(res.stdout.toString('utf8').trim());
}

export function normalizeLoudness(src: string, dest: string, lufs: number): string {
  const ffmpegBin = requireBin('ffmpeg');
  runBin([
    ffmpegBin,
    '-y',
    '-i',
    src,
    '-c:v',
    'copy',
    '-af',
    `loudnorm=I=${lufs}:TP=-1.5:LRA=11`,
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    dest,
  ]);
  return dest;
}

export function extractFrames(videoPath: string, times: number[], outDir: string, width = 540): Buffer[] {
  fs.mkdirSync(outDir, { recursive: true });
  const ffmpegBin = requireBin('ffmpeg');
  const frames: Buffer[] = [];

  times.forEach((t, i) => {
    const target = path.join(outDir, `frame_${i}.jpg`);
    runBin([
      ffmpegBin,
      '-y',
      '-ss',
      t.toFixed(2),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${width}:-2`,
      '-q:v',
      '4',
      target,
    ]);
    frames.push(fs.readFileSync(target));
  });

  return frames;
}
