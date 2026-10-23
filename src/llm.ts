import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { z } from 'zod';
import type { Settings } from './config.js';

function zodToJsonSchema(schema: z.ZodTypeAny): any {
  // Simple Zod to JSON Schema converter for our schemas
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodTypeAny);
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodNullable)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string', description: schema.description };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number', description: schema.description };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', description: schema.description };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema._def.values };
  }

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return zodToJsonSchema(schema._def.innerType);
  }

  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema._def.innerType);
  }

  return { type: 'string' };
}

export class LLM {
  private _anthropic: Anthropic | null = null;
  private _openai: OpenAI | null = null;

  constructor(public readonly settings: Settings) {}

  get anthropic(): Anthropic {
    if (!this._anthropic) {
      this._anthropic = new Anthropic({
        apiKey: this.settings.secret('ANTHROPIC_API_KEY'),
        maxRetries: 4,
      });
    }
    return this._anthropic;
  }

  get openai(): OpenAI {
    if (!this._openai) {
      this._openai = new OpenAI({
        apiKey: this.settings.secret('OPENAI_API_KEY'),
        maxRetries: 4,
      });
    }
    return this._openai;
  }

  async claude<T>(opts: {
    model: string;
    system: string | string[];
    user: string;
    schema: z.ZodType<T, any, any>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<T> {
    const systemArr = Array.isArray(opts.system) ? opts.system : [opts.system];
    const systemBlocks: Anthropic.TextBlockParam[] = systemArr.map(
      (s, i) => {
        const block: any = { type: 'text', text: s };
        if (i === systemArr.length - 1) {
          block.cache_control = { type: 'ephemeral' };
        }
        return block;
      }
    );

    const toolSchema = zodToJsonSchema(opts.schema);
    const tool: Anthropic.Tool = {
      name: 'submit',
      description: 'Submit the final structured result.',
      input_schema: toolSchema,
    };

    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await this.anthropic.messages.create({
          model: opts.model,
          max_tokens: opts.maxTokens || 4000,
          temperature: opts.temperature ?? 0.8,
          system: systemBlocks as any,
          tools: [tool],
          tool_choice: { type: 'tool', name: 'submit' },
          messages: [{ role: 'user', content: opts.user }],
        });

        const block = resp.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
        if (!block) throw new Error('Claude did not return a tool_use block');
        return opts.schema.parse(block.input);
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
    throw lastError;
  }

  async gpt<T>(opts: {
    model: string;
    system: string;
    user: string;
    schema: z.ZodType<T, any, any>;
    images?: Buffer[];
    temperature?: number;
  }): Promise<T> {
    const jsonSchema = zodToJsonSchema(opts.schema);
    const systemMsg = `${opts.system}\n\nRespond ONLY with a JSON object that strictly matches this JSON schema:\n${JSON.stringify(
      jsonSchema
    )}`;

    const userContent: any[] = [{ type: 'text', text: opts.user }];
    if (opts.images && opts.images.length > 0) {
      for (const img of opts.images) {
        const b64 = img.toString('base64');
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' },
        });
      }
    }

    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await this.openai.chat.completions.create({
          model: opts.model,
          temperature: opts.temperature ?? 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userContent },
          ],
        });

        const raw = resp.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);
        return opts.schema.parse(parsed);
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
    throw lastError;
  }
}
