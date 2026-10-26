import { afterEach, describe, expect, it, vi } from 'vitest';
import { studioAPI } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('web API client', () => {
  it('works as an imported module without exposing a browser bridge', async () => {
    const browser = { dispatchEvent: vi.fn() };
    vi.stubGlobal('window', browser);
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ models: ['gpt-5.4'] }));
    vi.stubGlobal('fetch', request);
    await expect(studioAPI.getModels('openai')).resolves.toEqual({ models: ['gpt-5.4'] });
    expect(request).toHaveBeenCalledWith('/api/models/openai', expect.any(Object));
    expect(browser).not.toHaveProperty('studioAPI');
  });
  it('surfaces HTTP failures through both the caller and the UI error event', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Key missing' }, { status: 409 })));
    await expect(studioAPI.getModels('gemini')).rejects.toThrow('Key missing');
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].detail).toBe('Key missing');
  });
  it('shares one SSE connection and closes it after the last subscriber leaves', () => {
    const close = vi.fn();
    const addEventListener = vi.fn();
    const source = vi.fn(function () { return { close, addEventListener }; });
    vi.stubGlobal('EventSource', source);
    const onLog = vi.fn();
    const removeLog = studioAPI.onLog(onLog);
    const removeActivity = studioAPI.onActivity(vi.fn());
    try {
      expect(source).toHaveBeenCalledExactlyOnceWith('/api/stream');
      const listener = addEventListener.mock.calls.find(([name]) => name === 'log')?.[1];
      listener({ data: JSON.stringify({ level: 'info', text: 'Connected' }) });
      expect(onLog).toHaveBeenCalledWith({ level: 'info', text: 'Connected' });
      removeLog();
      expect(close).not.toHaveBeenCalled();
    } finally { removeLog(); removeActivity(); }
    expect(close).toHaveBeenCalledOnce();
  });
});
