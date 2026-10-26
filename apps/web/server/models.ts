import { z } from 'zod';
import { modelProvider, type ModelProvider } from '@endo/core/modelProvider';
import { HttpError } from './jobs.js';

const pageSchema = z.object({
  data: z.array(z.object({ id: z.string() })).optional(),
  models: z.array(z.object({
    name: z.string(), supportedGenerationMethods: z.array(z.string()).optional(),
  })).optional(),
  nextPageToken: z.string().optional(),
  has_more: z.boolean().optional(),
  last_id: z.string().nullable().optional(),
});

export async function listProviderModels(provider: ModelProvider, env: Record<string, string | undefined>,
  request: typeof fetch = fetch): Promise<string[]> {
  const keyName = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' }[provider];
  const key = env[keyName];
  if (!key || /your_|placeholder/.test(key)) throw new HttpError(409, `Chưa cấu hình ${keyName}. Thêm key trong Kết nối & API keys để tải danh sách model.`);
  const base = {
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
    openai: 'https://api.openai.com/v1/models',
    anthropic: 'https://api.anthropic.com/v1/models',
  }[provider];
  const headers: Record<string, string> = provider === 'gemini' ? { 'x-goog-api-key': key }
    : provider === 'openai' ? { Authorization: `Bearer ${key}` }
      : { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  const models = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const url = new URL(base);
    if (provider === 'gemini') {
      url.searchParams.set('pageSize', '1000');
      if (cursor) url.searchParams.set('pageToken', cursor);
    } else if (provider === 'anthropic') {
      url.searchParams.set('limit', '1000');
      if (cursor) url.searchParams.set('after_id', cursor);
    }
    const response = await request(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new HttpError(502, `Không tải được model ${provider} (HTTP ${response.status}). Kiểm tra API key và quyền truy cập.`);
    const page = pageSchema.parse(await response.json());
    if (provider === 'gemini') {
      if (!page.models) throw new HttpError(502, 'Gemini trả về danh sách model không hợp lệ.');
      for (const model of page.models) {
        if (model.supportedGenerationMethods?.includes('generateContent')) models.add(model.name.replace(/^models\//, ''));
      }
      cursor = page.nextPageToken;
    } else {
      if (!page.data) throw new HttpError(502, 'Nhà cung cấp trả về danh sách model không hợp lệ.');
      for (const model of page.data) models.add(model.id);
      cursor = provider === 'anthropic' && page.has_more ? page.last_id || page.data.at(-1)?.id : undefined;
      if (provider === 'anthropic' && page.has_more && !cursor) throw new HttpError(502, 'Thiếu trang model tiếp theo.');
    }
    if (cursor && cursors.has(cursor)) throw new HttpError(502, 'Nhà cung cấp lặp lại trang model.');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...models].filter((id) => modelProvider(id) === provider)
    .filter((id) => !/(embedding|tts|transcribe|audio|realtime|image|live|robotics)/i.test(id))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}
