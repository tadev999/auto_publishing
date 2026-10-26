import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Settings } from '../config.js';
import { fetchWithRetry } from './http.js';

export interface PixabayVideoFile {
  url: string;
  width: number;
  height: number;
  size: number;
  quality: 'large' | 'medium' | 'small' | 'tiny';
}

export interface PixabayVideo {
  id: number;
  url: string;
  duration: number;
  tags: string;
  user: string;
  files: PixabayVideoFile[];
}

export async function searchVideos(
  settings: Settings,
  query: string,
  perPage: number = 15
): Promise<PixabayVideo[]> {
  const apiKey = settings.secret('PIXABAY_API_KEY', false);
  if (!apiKey) return [];

  const resp = await fetchWithRetry('https://pixabay.com/api/videos/', {
    params: {
      key: apiKey,
      q: query,
      video_type: 'film',
      per_page: perPage,
    },
    timeoutMs: 30000,
  });

  const data = (await resp.json()) as any;
  const hits = data.hits || [];

  return hits.map((hit: any) => {
    const files: PixabayVideoFile[] = [];
    if (hit.videos) {
      for (const q of ['large', 'medium', 'small', 'tiny'] as const) {
        if (hit.videos[q] && hit.videos[q].url) {
          files.push({
            quality: q,
            url: hit.videos[q].url,
            width: hit.videos[q].width,
            height: hit.videos[q].height,
            size: hit.videos[q].size,
          });
        }
      }
    }
    return {
      id: hit.id,
      url: hit.pageURL,
      duration: hit.duration,
      tags: hit.tags,
      user: hit.user,
      files,
    };
  });
}

export function bestFile(video: PixabayVideo): PixabayVideoFile | null {
  // Prefer medium or large for fast download and crisp 1080p rendering
  const medium = video.files.find((f) => f.quality === 'medium');
  if (medium) return medium;
  const large = video.files.find((f) => f.quality === 'large');
  if (large) return large;
  return video.files[0] || null;
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
