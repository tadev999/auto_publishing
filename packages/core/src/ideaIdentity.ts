export interface IdeaIdentity {
  article_id: string;
  angle: string;
  insight: string;
}

export function normalizeIdea(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function similar(left: string, right: string): boolean {
  const a = normalizeIdea(left), b = normalizeIdea(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const tokensA = new Set(a.split(' ')), tokensB = new Set(b.split(' '));
  if (Math.min(tokensA.size, tokensB.size) < 5) return false;
  const overlap = [...tokensA].filter((token) => tokensB.has(token)).length;
  return overlap / new Set([...tokensA, ...tokensB]).size >= 0.8;
}

export function sameIdea(a: IdeaIdentity, b: IdeaIdentity): boolean {
  return similar(a.angle, b.angle) || similar(a.insight, b.insight);
}

const scriptBodySchema = z.object({ beats: z.array(z.object({ text: z.string() })).min(1) });

export function assertUniqueScript(ctx: Pick<Ctx, 'db'>, video: { id: number; script: unknown }): void {
  const body = (script: unknown, id: number) => {
    const parsed = scriptBodySchema.safeParse(typeof script === 'string' ? JSON.parse(script) : script);
    if (!parsed.success) throw new Error(`Video #${id} thiếu phần thân kịch bản hợp lệ để kiểm tra trùng.`);
    const text = parsed.data.beats.map((beat) => beat.text).join(' ');
    if (!normalizeIdea(text)) throw new Error(`Video #${id} có phần thân kịch bản rỗng.`);
    return text;
  };
  const current = body(video.script, video.id);
  const previous = ctx.db.all<{ id: number; script: string }>('SELECT id, script FROM videos WHERE id != ? AND script IS NOT NULL', video.id);
  for (const other of previous) {
    if (similar(current, body(other.script, other.id))) {
      throw new Error(`Kịch bản video #${video.id} trùng/gần trùng nội dung #${other.id}; cần kiểm tra trước khi tiếp tục.`);
    }
  }
}
import { z } from 'zod';
import type { Ctx } from './context.js';
