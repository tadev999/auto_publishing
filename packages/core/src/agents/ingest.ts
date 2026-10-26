import { MissingSecret } from '../config.js';
import { Article, loadArticles, normalize } from '../content.js';
import { Ctx } from '../context.js';
import { utcnow } from '../db.js';
import { LLM } from '../llm.js';
import { IdeaSeed, IngestResult, IngestResultSchema } from '../schemas.js';
import { agentSystemPrompt, getAgentProfile } from '../skills.js';
import { sameIdea, type IdeaIdentity } from '../ideaIdentity.js';

export const AGENT = 'ingest';

export const ROLE = `Bạn là biên tập viên nội dung của dự án Endogenism (Nội Sinh).
Nhiệm vụ: đọc MỘT bài viết và tách thành 4–6 ý tưởng video ngắn ĐỘC LẬP (mỗi ý tưởng đủ cho một video 15–60 giây).

Yêu cầu:
- Mỗi ý tưởng một góc khác nhau, không trùng lặp.
- \`quotes\` phải là câu trích NGUYÊN VĂN từ bài (giữ nguyên chữ và dấu câu, có thể bỏ ký hiệu markdown). Không sửa, không bịa.
- \`practice\` chỉ điền nếu bài thực sự có một thực hành cụ thể.
- \`formats\`: chọn trong cau-hoi, goi-ten, ngo-nhan, thuc-hanh, doc-cham, xếp theo mức phù hợp.
  - thuc-hanh chỉ khi có \`practice\`.
  - doc-cham chỉ khi có đoạn trích đọc to lên nghe đẹp.
  - ngo-nhan khi bài phá một niềm tin phổ biến.
- Cố gắng để các ý tưởng của bài phủ được nhiều format khác nhau.
- Mọi ý tưởng phải tuân thủ luật cứng của Endogenism.`;

export function userPrompt(article: Article): string {
  return (
    `Mạch ${article.machIndex}: ${article.machTitle}\n` +
    `Bài ${article.number}: ${article.title}\n\n` +
    `<article>\n${article.body}\n</article>`
  );
}

export function verifiedSeed(seed: IdeaSeed, article: Article): IdeaSeed {
  const source = normalize(article.body);
  const quotes = seed.quotes.filter((q) => {
    const norm = normalize(q);
    return norm && source.includes(norm);
  });
  let formats = Array.from(new Set(seed.formats));
  if (quotes.length === 0) {
    formats = formats.filter((f) => f !== 'doc-cham');
  }
  if (!seed.practice) {
    formats = formats.filter((f) => f !== 'thuc-hanh');
  }
  return {
    ...seed,
    quotes,
    formats: formats.length > 0 ? (formats as [any, ...any[]]) : ['goi-ten'],
  };
}

export async function ingestArticle(ctx: Ctx, llm: LLM, article: Article): Promise<number> {
  const previous = ctx.db.all<IdeaIdentity>('SELECT article_id, angle, insight FROM ideas WHERE article_id = ?', article.id);
  const profile = getAgentProfile(ctx, 'planner');
  const request = {
    model: profile.model,
    system: agentSystemPrompt(ctx, 'planner', ROLE),
    user: `${userPrompt(article)}\n\nCác góc đã có (không lặp lại hoặc diễn đạt lại):\n${JSON.stringify(previous)}`,
    schema: IngestResultSchema,
    maxTokens: 6000,
    temperature: profile.temperature,
  };
  const result = await llm.structured<IngestResult>(request);

  const seeds = result.ideas.map((s) => verifiedSeed(s, article));
  const db = ctx.db;

  let inserted = 0;
  db.tx(() => {
    db.run(
      `INSERT INTO articles(id, mach_slug, mach_index, mach_title, number, title, path, content_hash, ingested_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_hash=excluded.content_hash,
           ingested_at=excluded.ingested_at, path=excluded.path`,
      article.id,
      article.machSlug,
      article.machIndex,
      article.machTitle,
      article.number,
      article.title,
      article.path,
      article.contentHash,
      utcnow()
    );

    const existing = db.all<IdeaIdentity>('SELECT article_id, angle, insight FROM ideas');
    for (const s of seeds) {
      const identity = { article_id: article.id, angle: s.angle, insight: s.insight };
      if (existing.some((idea) => sameIdea(identity, idea))) continue;
      db.run(
        `INSERT INTO ideas(article_id, angle, insight, quotes, metaphor, practice, question, emotion,
                             hook_seed, formats, primary_format, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        article.id,
        s.angle,
        s.insight,
        JSON.stringify(s.quotes),
        s.metaphor,
        s.practice,
        s.question,
        s.emotion,
        s.hook_seed,
        JSON.stringify(s.formats),
        s.formats[0],
        utcnow()
      );
      existing.push(identity);
      inserted++;
    }
  });

  ctx.event(AGENT, `${article.id}: thêm ${inserted}, bỏ ${seeds.length - inserted} ý tưởng trùng/gần trùng`);
  return inserted;
}

export async function run(
  ctx: Ctx,
  llm: LLM,
  options: { force?: boolean; limit?: number; only?: string; failFast?: boolean } = {}
): Promise<number> {
  const { force = false, limit, only } = options;
  let articles = loadArticles(ctx.settings.path('content_dir'));
  if (only) {
    articles = articles.filter((a) => a.id === only);
  }

  let done = 0;
  for (const article of articles) {
    if (limit !== undefined && done >= limit) {
      break;
    }
    const row = ctx.db.one<any>('SELECT content_hash FROM articles WHERE id = ?', article.id);
    if (row && row.content_hash === article.contentHash && !force) {
      continue;
    }

    try {
      const n = await ingestArticle(ctx, llm, article);
      ctx.event(AGENT, `${article.id} → ${n} ý tưởng`);
      done++;
    } catch (exc: any) {
      if (exc instanceof MissingSecret) {
        throw exc;
      }
      ctx.event(AGENT, `${article.id} lỗi: ${exc.message}`, { level: 'error' });
      if (options.failFast) throw exc;
    }
  }

  const total = ctx.db.one<any>('SELECT COUNT(*) AS n FROM ideas').n;
  ctx.event(AGENT, `Hoàn tất: ${done} bài mới/cập nhật, kho có ${total} ý tưởng`);
  return done;
}
