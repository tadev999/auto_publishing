import fs from 'node:fs';
import { Settings } from '../config.js';
import { DB } from '../db.js';
import { ApiError, fetchWithRetry } from './http.js';

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';
const SCOPES = 'user.info.basic,video.upload,video.publish,video.list';
const TOKENS_KEY = 'tiktok_tokens';
export const MAX_SINGLE_CHUNK = 64 * 1024 * 1024;
export const CHUNK = 10 * 1024 * 1024;

export function chunkPlan(size: number): [number, number] {
  if (size <= MAX_SINGLE_CHUNK) {
    return [size, 1];
  }
  return [CHUNK, Math.floor(size / CHUNK)];
}

export class TikTok {
  constructor(public settings: Settings, public db: DB) {}

  authorizeUrl(state: string): string {
    const query = new URLSearchParams({
      client_key: this.settings.secret('TIKTOK_CLIENT_KEY'),
      scope: SCOPES,
      response_type: 'code',
      redirect_uri: this.settings.secret('TIKTOK_REDIRECT_URI'),
      state,
    });
    return `${AUTH_URL}?${query.toString()}`;
  }

  async exchangeCode(code: string): Promise<any> {
    return this._tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.settings.secret('TIKTOK_REDIRECT_URI'),
    });
  }

  async _tokenRequest(form: Record<string, string>): Promise<any> {
    const formData = new URLSearchParams({
      client_key: this.settings.secret('TIKTOK_CLIENT_KEY'),
      client_secret: this.settings.secret('TIKTOK_CLIENT_SECRET'),
      ...form,
    });

    const resp = await fetchWithRetry(`${API}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      timeoutMs: 30000,
    });

    const data = (await resp.json()) as any;
    if (!data.access_token) {
      throw new ApiError(`TikTok token error: ${data.error} ${data.error_description}`);
    }

    const now = Date.now() / 1000;
    const tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      open_id: data.open_id,
      scope: data.scope,
      expires_at: now + Number(data.expires_in || 0),
      refresh_expires_at: now + Number(data.refresh_expires_in || 0),
    };
    this.db.setKv(TOKENS_KEY, tokens);
    return tokens;
  }

  async accessToken(): Promise<string> {
    let tokens = this.db.getKv<any>(TOKENS_KEY);
    if (!tokens) {
      throw new ApiError('TikTok is not authorized yet. Run: npm run endo tiktok-auth');
    }
    const now = Date.now() / 1000;
    if (tokens.expires_at - now < 300) {
      if (tokens.refresh_expires_at < now) {
        throw new ApiError('TikTok refresh token expired. Run: npm run endo tiktok-auth');
      }
      tokens = await this._tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      });
    }
    return tokens.access_token;
  }

  async _post(path: string, body: any, params?: Record<string, any>): Promise<any> {
    const token = await this.accessToken();
    const resp = await fetchWithRetry(`${API}${path}`, {
      method: 'POST',
      params,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
      timeoutMs: 60000,
    });

    const payload = (await resp.json()) as any;
    const err = payload.error || {};
    if (err.code && err.code !== 'ok') {
      throw new ApiError(`TikTok ${path}: ${err.code} ${err.message} (log_id=${err.log_id})`);
    }
    return payload.data || {};
  }

  async creatorInfo(): Promise<any> {
    return this._post('/post/publish/creator_info/query/', {});
  }

  async upload(
    videoPath: string,
    caption: string,
    mode: string,
    isAigc: boolean,
    duration: number
  ): Promise<string> {
    const stat = fs.statSync(videoPath);
    const size = stat.size;
    const [chunkSize, chunks] = chunkPlan(size);
    const source = {
      source: 'FILE_UPLOAD',
      video_size: size,
      chunk_size: chunkSize,
      total_chunk_count: chunks,
    };

    let initData: any;
    if (mode === 'direct') {
      const info = await this.creatorInfo();
      const maxSec = info.max_video_post_duration_sec;
      if (maxSec && duration > maxSec) {
        throw new ApiError(`Video ${duration.toFixed(0)}s exceeds TikTok limit ${maxSec}s for this creator`);
      }
      const options = info.privacy_level_options || ['SELF_ONLY'];
      const privacy = options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : options[0];
      initData = await this._post('/post/publish/video/init/', {
        post_info: {
          title: caption.slice(0, 2200),
          privacy_level: privacy,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1500,
          is_aigc: isAigc,
        },
        source_info: source,
      });
    } else {
      initData = await this._post('/post/publish/inbox/video/init/', { source_info: source });
    }

    await this._putChunks(initData.upload_url, videoPath, size, chunkSize, chunks);
    return initData.publish_id;
  }

  async _putChunks(
    url: string,
    videoPath: string,
    size: number,
    chunkSize: number,
    chunks: number
  ): Promise<void> {
    const fd = fs.openSync(videoPath, 'r');
    try {
      for (let i = 0; i < chunks; i++) {
        const start = i * chunkSize;
        const end = i === chunks - 1 ? size - 1 : start + chunkSize - 1;
        const chunkLen = end - start + 1;
        const buffer = Buffer.alloc(chunkLen);
        fs.readSync(fd, buffer, 0, chunkLen, start);

        await fetchWithRetry(`${url}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': String(chunkLen),
            'Content-Range': `bytes ${start}-${end}/${size}`,
          },
          body: buffer,
          timeoutMs: 300000,
        });
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  async status(publishId: string): Promise<any> {
    return this._post('/post/publish/status/fetch/', { publish_id: publishId });
  }

  async waitUntilDone(publishId: string, waitSeconds: number = 600): Promise<any> {
    const deadline = Date.now() + waitSeconds * 1000;
    while (true) {
      const data = await this.status(publishId);
      const state = data.status;
      if (state === 'PUBLISH_COMPLETE' || state === 'SEND_TO_USER_INBOX') {
        return data;
      }
      if (state === 'FAILED') {
        throw new ApiError(`TikTok publish failed: ${data.fail_reason}`);
      }
      if (Date.now() > deadline) {
        throw new ApiError(`TikTok publish ${publishId} still ${state} after ${waitSeconds}s`);
      }
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  async videoMetrics(videoIds: string[]): Promise<Record<string, any>> {
    const data = await this._post(
      '/video/query/',
      { filters: { video_ids: videoIds } },
      { fields: 'id,view_count,like_count,comment_count,share_count' }
    );
    const result: Record<string, any> = {};
    for (const v of data.videos || []) {
      result[String(v.id)] = {
        views: v.view_count ?? null,
        likes: v.like_count ?? null,
        comments: v.comment_count ?? null,
        shares: v.share_count ?? null,
        saves: null,
        avg_watch_time: null,
        raw: v,
      };
    }
    return result;
  }
}
