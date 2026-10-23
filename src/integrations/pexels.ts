import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Settings } from '../config.js';
import { fetchWithRetry } from './http.js';

export interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  fps: number;
  link: string;
}

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  user: {
    id: number;
    name: string;
    url: string;
  };
  video_files: PexelsVideoFile[];
}

export async function searchPortraitVideos(
  settings: Settings,
  query: string,
  perPage: number = 15
): Promise<PexelsVideo[]> {
  const resp = await fetchWithRetry('https://api.pexels.com/videos/search', {
    params: {
      query,
      orientation: 'portrait',
      size: 'medium',
      per_page: perPage,
    },
    headers: {
      Authorization: settings.secret('PEXELS_API_KEY'),
    },
    timeoutMs: 30000,
  });

  const data = (await resp.json()) as any;
  return data.videos || [];
}

export function bestFile(video: PexelsVideo, minHeight: number = 1280): PexelsVideoFile | null {
  const files = (video.video_files || []).filter(
    (f) =>
      f.file_type === 'video/mp4' &&
      (f.height || 0) >= minHeight &&
      (f.height || 0) > (f.width || 0)
  );

  if (files.length === 0) return null;
  return files.reduce((min, curr) => (curr.height < min.height ? curr : min), files[0]);
}

export async function download(url: string, destPath: string): Promise<string> {
  const resp = await fetchWithRetry(url, { timeoutMs: 120000 });
  if (!resp.body) {
    throw new Error(`Download body empty for ${url}`);
  }

  // @ts-ignore - ReadableStream to NodeJS.ReadableStream
  const nodeStream = (await import('node:stream')).Readable.fromWeb(resp.body as any);
  await pipeline(nodeStream, fs.createWriteStream(destPath));
  return destPath;
}
