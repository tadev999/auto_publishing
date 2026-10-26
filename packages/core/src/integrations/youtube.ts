import fs from 'node:fs';
import { Settings } from '../config.js';
import { ApiError } from './http.js';

export interface YouTubePublishResult {
  videoId: string;
  url: string;
}

export class YouTube {
  constructor(private readonly settings: Settings) {}

  /**
   * Làm mới Access Token từ Refresh Token của Google OAuth2
   */
  async getAccessToken(): Promise<string> {
    const s = this.settings;
    const clientId = s.secret('YOUTUBE_CLIENT_ID');
    const clientSecret = s.secret('YOUTUBE_CLIENT_SECRET');
    const refreshToken = s.secret('YOUTUBE_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'Thiếu cấu hình YouTube OAuth (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN) trong .env'
      );
    }

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new ApiError(`Lỗi làm mới token YouTube (${resp.status}): ${errText}`, resp.status);
    }

    const tokenRes = (await resp.json()) as any;
    return tokenRes.access_token;
  }

  /**
   * Đăng tải video lên YouTube Shorts qua YouTube Data API v3
   */
  async uploadShort(
    videoPath: string,
    title: string,
    description: string,
    tags: string[] = [],
    privacyStatus: 'public' | 'unlisted' | 'private' = 'public'
  ): Promise<YouTubePublishResult> {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`File video không tồn tại: ${videoPath}`);
    }

    // Đảm bảo tiêu đề chứa hashtag #Shorts theo khuyến nghị của YouTube
    let shortTitle = title.trim();
    if (!shortTitle.toLowerCase().includes('#shorts')) {
      shortTitle = `${shortTitle} #Shorts`.slice(0, 100);
    }

    const accessToken = await this.getAccessToken();
    const videoStat = fs.statSync(videoPath);
    const videoBytes = fs.readFileSync(videoPath);

    // 1. Khởi tạo Resumable Upload Session
    const metadata = {
      snippet: {
        title: shortTitle,
        description: `${description}\n\n#Shorts`,
        tags: Array.from(new Set([...tags, 'Shorts', 'Endogenism'])),
        categoryId: '27', // Education
        defaultLanguage: 'vi',
        defaultAudioLanguage: 'vi',
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    };

    const initHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(videoStat.size),
    };

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: initHeaders,
        body: JSON.stringify(metadata),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      throw new ApiError(
        `Khởi tạo upload YouTube thất bại (${initRes.status}): ${errText}`,
        initRes.status,
        errText
      );
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      throw new Error('Google YouTube API không trả về location header cho resumable upload');
    }

    // 2. Tải luồng video MP4 lên Resumable Session URL
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoStat.size),
      },
      body: videoBytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new ApiError(
        `Tải file video lên YouTube thất bại (${uploadRes.status}): ${errText}`,
        uploadRes.status,
        errText
      );
    }

    const data: any = await uploadRes.json();
    const videoId = data.id;

    return {
      videoId,
      url: `https://www.youtube.com/shorts/${videoId}`,
    };
  }
}
