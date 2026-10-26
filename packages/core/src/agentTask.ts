import type { z } from 'zod';
import type { Ctx } from './context.js';
import { LLM } from './llm.js';
import { agentSystemPrompt, getAgentProfile } from './skills.js';

export async function agentTask<T>(ctx: Ctx, role: string, task: string, user: string,
  schema: z.ZodType<T>, llm = new LLM(ctx.settings)): Promise<T> {
  const profile = getAgentProfile(ctx, role);
  const options = {
    model: profile.model, temperature: profile.temperature,
    system: agentSystemPrompt(ctx, role, task), user, schema,
  };
  return llm.structured(options);
}
