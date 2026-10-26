import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Settings } from '../src/config.js';
import { LLM } from '../src/llm.js';
import { modelProvider } from '../src/modelProvider.js';

const clients = vi.hoisted(() => ({
  gemini: vi.fn(), openai: vi.fn(), anthropic: vi.fn(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent: clients.gemini }; },
}));
vi.mock('openai', () => ({
  default: class { chat = { completions: { create: clients.openai } }; },
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: clients.anthropic }; },
}));

const schema = z.object({ approved: z.boolean() });
const options = { system: 'Saved instructions', user: 'Review', schema, temperature: 0.35 };
let settings: Settings;
beforeEach(() => {
  vi.clearAllMocks();
  settings = new Settings({});
  vi.spyOn(settings, 'secret').mockImplementation((name, required = true) => {
    const value = settings.env[name] || '';
    if (!value && required) throw new Error(`Missing secret ${name}`);
    return value;
  });
  settings.env = { GEMINI_API_KEY: 'fixture', OPENAI_API_KEY: 'fixture', ANTHROPIC_API_KEY: 'fixture' };
  clients.gemini.mockResolvedValue({ text: '{"approved":true}' });
  clients.openai.mockResolvedValue({ choices: [{ message: { content: '{"approved":true}' } }] });
  clients.anthropic.mockResolvedValue({ content: [{ type: 'tool_use', input: { approved: true } }] });
});
afterEach(() => vi.restoreAllMocks());

describe('explicit model providers', () => {
  it('uses supported GPT-5 token parameters without sending unsupported temperature', async () => {
    await new LLM(settings).structured({ ...options, model: 'gpt-5.4', maxTokens: 1200 });
    const sent = clients.openai.mock.calls[0][0];
    expect(sent.max_completion_tokens).toBe(1200);
    expect(sent).not.toHaveProperty('max_tokens');
    expect(sent).not.toHaveProperty('temperature');
  });
  it('does not send temperature to recent Claude models that no longer support it', async () => {
    await new LLM(settings).structured({ ...options, model: 'claude-opus-5-5' });
    expect(clients.anthropic.mock.calls[0][0]).not.toHaveProperty('temperature');
  });
  it.each([
    ['gemini-2.5-flash', 'gemini'],
    ['gpt-4o-mini', 'openai'],
    ['claude-3-7-sonnet', 'anthropic'],
  ] as const)('calls only the selected provider for %s, even when every key exists', async (model, provider) => {
    const llm = new LLM(settings);
    await expect(llm.structured({ ...options, model, images: [Buffer.from('image')], maxTokens: 1200 }))
      .resolves.toEqual({ approved: true });
    for (const [id, request] of Object.entries(clients)) {
      expect(request).toHaveBeenCalledTimes(id === provider ? 1 : 0);
    }
    const sent = clients[provider].mock.calls[0][0];
    expect(sent.model).toBe(model);
    if (provider === 'gemini') {
      expect(sent.config).toMatchObject({ temperature: 0.35, maxOutputTokens: 1200, systemInstruction: options.system });
      expect(sent.contents[1].inlineData.mimeType).toBe('image/jpeg');
    } else if (provider === 'openai') {
      expect(sent).toMatchObject({ temperature: 0.35, max_tokens: 1200 });
      expect(sent.messages[0].content).toContain(options.system);
      expect(sent.messages[1].content[1].type).toBe('image_url');
    } else {
      expect(sent).toMatchObject({ temperature: 0.35, max_tokens: 1200 });
      expect(sent.system[0].text).toBe(options.system);
      expect(sent.messages[0].content[1].type).toBe('image');
    }
  });
  it.each([
    ['gemini-2.5-flash', 'GEMINI_API_KEY'],
    ['gpt-4o', 'OPENAI_API_KEY'],
    ['claude-3-7-sonnet', 'ANTHROPIC_API_KEY'],
  ])('reports a missing selected key for %s without using another key', async (model, key) => {
    delete settings.env[key];
    await expect(new LLM(settings).structured({ ...options, model })).rejects.toThrow(`Missing secret ${key}`);
    for (const request of Object.values(clients)) expect(request).not.toHaveBeenCalled();
  });
  it('propagates Gemini errors without changing model or provider', async () => {
    clients.gemini.mockRejectedValue(new Error('Model is unavailable'));
    await expect(new LLM(settings).structured({ ...options, model: 'gemini-custom-model' }))
      .rejects.toThrow('Model is unavailable');
    expect(clients.gemini).toHaveBeenCalledOnce();
    expect(clients.gemini.mock.calls[0][0].model).toBe('gemini-custom-model');
    expect(clients.openai).not.toHaveBeenCalled();
    expect(clients.anthropic).not.toHaveBeenCalled();
  });
  it('rejects unrecognized model IDs before making a request', async () => {
    for (const model of ['', 'remotion-engine', 'gemini-', 'unknown-model', 'gpt-4o other']) {
      expect(modelProvider(model)).toBeNull();
      await expect(new LLM(settings).structured({ ...options, model })).rejects.toThrow('Model không hợp lệ');
    }
    for (const request of Object.values(clients)) expect(request).not.toHaveBeenCalled();
  });
  it.each([
    ['gpt-custom-model', 'openai'],
    ['claude-custom-model', 'anthropic'],
  ] as const)('keeps retries on the same provider and model when %s fails', async (model, provider) => {
    vi.useFakeTimers();
    try {
      clients[provider].mockRejectedValue(new Error('Selected model is unavailable'));
      const rejected = expect(new LLM(settings).structured({ ...options, model }))
        .rejects.toThrow('Selected model is unavailable');
      await vi.runAllTimersAsync();
      await rejected;
      expect(clients[provider]).toHaveBeenCalledTimes(3);
      for (const [id, request] of Object.entries(clients)) {
        if (id !== provider) expect(request).not.toHaveBeenCalled();
        else for (const [sent] of request.mock.calls) expect(sent.model).toBe(model);
      }
    } finally { vi.useRealTimers(); }
  });
});
