import { describe, expect, it, vi } from 'vitest';
import { listProviderModels } from './models.js';

describe('provider model catalogs', () => {
  it('loads all Gemini pages, removes the resource prefix and excludes other modalities', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        models: [{ name: 'models/gemini-3.1-pro-preview', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] }],
        nextPageToken: 'second',
      }))
      .mockResolvedValueOnce(Response.json({
        models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-live-audio', supportedGenerationMethods: ['generateContent'] }],
      }));
    const models = await listProviderModels('gemini', { GEMINI_API_KEY: 'test-key' }, request);
    expect(models).toEqual(['gemini-3.1-pro-preview', 'gemini-2.5-flash']);
    const [url, options] = request.mock.calls[1];
    expect(String(url)).toContain('pageToken=second');
    expect(String(url)).not.toContain('test-key');
    expect(options?.headers).toEqual({ 'x-goog-api-key': 'test-key' });
  });
  it('lists GPT aliases and snapshots while excluding non-chat models', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      data: ['gpt-5.4', 'gpt-5.4-2026-03-05', 'gpt-4o', 'gpt-4o', 'gpt-audio', 'text-embedding-3-small']
        .map((id) => ({ id })),
    }));
    expect(await listProviderModels('openai', { OPENAI_API_KEY: 'test' }, request))
      .toEqual(['gpt-5.4-2026-03-05', 'gpt-5.4', 'gpt-4o']);
  });
  it('paginates Claude without imposing a hardcoded model limit', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'claude-opus-5-5' }], has_more: true, last_id: 'cursor' }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'claude-sonnet-5-5' }], has_more: false }));
    expect(await listProviderModels('anthropic', { ANTHROPIC_API_KEY: 'test' }, request)).toHaveLength(2);
    expect(String(request.mock.calls[1][0])).toContain('after_id=cursor');
  });
  it('reports missing keys, API errors and malformed responses rather than claiming a successful catalog', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(listProviderModels('openai', {}, request)).rejects.toThrow('Chưa cấu hình OPENAI_API_KEY');
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(new Response('secret upstream detail', { status: 401 }));
    await expect(listProviderModels('openai', { OPENAI_API_KEY: 'test' }, request)).rejects.toThrow('HTTP 401');
    request.mockResolvedValueOnce(Response.json({}));
    await expect(listProviderModels('openai', { OPENAI_API_KEY: 'test' }, request)).rejects.toThrow('không hợp lệ');
    request.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(listProviderModels('openai', { OPENAI_API_KEY: 'test' }, request)).rejects.toThrow('Network unavailable');
  });
  it('rejects repeated pagination cursors instead of looping indefinitely', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({
      data: [{ id: 'claude-model' }], has_more: true, last_id: 'same',
    }));
    await expect(listProviderModels('anthropic', { ANTHROPIC_API_KEY: 'test' }, request)).rejects.toThrow('lặp lại');
    expect(request).toHaveBeenCalledTimes(2);
  });
});
