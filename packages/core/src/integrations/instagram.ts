import { Settings } from '../config.js';
import { ApiError, fetchWithRetry } from './http.js';

export interface InstagramInsights {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  avg_watch_time: number | null;
  raw: Record<string, any>;
}

export class Instagram {
  base: string;
  userId: string;
  token: string;

  constructor(public settings: Settings) {
    this.base = `https://graph.facebook.com/${settings.publish.instagram_graph_version}`;
    this.userId = settings.secret('IG_USER_ID');
    this.token = settings.secret('IG_ACCESS_TOKEN');
  }

  async _get(path: string, params: Record<string, any> = {}): Promise<any> {
    const resp = await fetchWithRetry(`${this.base}/${path}`, {
      method: 'GET',
      params: { ...params, access_token: this.token },
      timeoutMs: 60000,
    });
    return resp.json();
  }

  async _post(path: string, data: Record<string, any> = {}): Promise<any> {
    return this._postOnce(path, data);
  }

  async _postOnce(path: string, data: Record<string, any> = {}): Promise<any> {
    const formData = new URLSearchParams();
    formData.append('access_token', this.token);
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && val !== null) {
        formData.append(key, String(val));
      }
    }

    const resp = await fetchWithRetry(
      `${this.base}/${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
        timeoutMs: 60000,
      },
      1 // don't auto-retry post
    );
    return resp.json();
  }

  async quotaLeft(): Promise<number | null> {
    const data = await this._get(`${this.userId}/content_publishing_limit`, {
      fields: 'quota_usage,config',
    });
    const items = data.data || [];
    if (items.length === 0) return null;
    const cfg = items[0].config || {};
    return Number(cfg.quota_total || 0) - Number(items[0].quota_usage || 0);
  }

  async publishReel(
    videoUrl: string,
    caption: string,
    waitSeconds: number = 600
  ): Promise<{ container_id: string; media_id: string; permalink: string | null }> {
    const initRes = await this._post(`${this.userId}/media`, {
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: 'true',
    });
    const container = initRes.id;

    const deadline = Date.now() + waitSeconds * 1000;
    while (true) {
      const statusRes = await this._get(container, { fields: 'status_code,status' });
      const statusCode = statusRes.status_code;
      if (statusCode === 'FINISHED') {
        break;
      }
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new ApiError(`Instagram container ${container} status ${statusCode}`);
      }
      if (Date.now() > deadline) {
        throw new ApiError(`Instagram container ${container} not ready after ${waitSeconds}s`);
      }
      await new Promise((r) => setTimeout(r, 10000));
    }

    const pubRes = await this._postOnce(`${this.userId}/media_publish`, { creation_id: container });
    const mediaId = pubRes.id;
    const permalinkRes = await this._get(mediaId, { fields: 'permalink' });
    return {
      container_id: container,
      media_id: mediaId,
      permalink: permalinkRes.permalink || null,
    };
  }

  async insights(mediaId: string): Promise<InstagramInsights> {
    const metrics = 'views,likes,comments,shares,saved,ig_reels_avg_watch_time';
    const data = await this._get(`${mediaId}/insights`, { metric: metrics });
    const items = data.data || [];
    const values: Record<string, any> = {};
    for (const m of items) {
      values[m.name] = (m.values && m.values[0] && m.values[0].value) ?? null;
    }
    const watchMs = values.ig_reels_avg_watch_time;
    return {
      views: values.views ?? null,
      likes: values.likes ?? null,
      comments: values.comments ?? null,
      shares: values.shares ?? null,
      saves: values.saved ?? null,
      avg_watch_time: watchMs ? watchMs / 1000 : null,
      raw: values,
    };
  }
}
