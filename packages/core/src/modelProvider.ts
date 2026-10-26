export const MODEL_PROVIDERS = {
  gemini: { label: 'Gemini (Google)', models: ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'] },
  openai: { label: 'GPT (OpenAI)', models: ['gpt-5.4', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  anthropic: { label: 'Claude (Anthropic)', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'] },
} as const;

export type ModelProvider = keyof typeof MODEL_PROVIDERS;

export function modelProvider(model: string): ModelProvider | null {
  if (/^gemini-[a-zA-Z0-9._-]+$/.test(model)) return 'gemini';
  if (/^gpt-[a-zA-Z0-9._-]+$/.test(model)) return 'openai';
  if (/^claude-[a-zA-Z0-9._-]+$/.test(model)) return 'anthropic';
  return null;
}

export function requireModelProvider(model: string): ModelProvider {
  const provider = modelProvider(model);
  if (!provider) throw new Error('Model không hợp lệ. Sử dụng model ID bắt đầu bằng gemini-, gpt- hoặc claude-.');
  return provider;
}
