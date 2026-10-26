import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { depthScore } from '../src/agents/analytics.js';
import { weightedTotal } from '../src/agents/critic.js';
import { verifiedSeed } from '../src/agents/ingest.js';
import { getSettings } from '../src/config.js';
import { Article } from '../src/content.js';
import { Ctx, makeCtx } from '../src/context.js';
import { VideoStatus, utcnow } from '../src/db.js';
import { CHUNK, MAX_SINGLE_CHUNK, chunkPlan } from '../src/integrations/tiktok.js';
import * as pipeline from '../src/pipeline.js';
import { CriticReport, IdeaSeed } from '../src/schemas.js';

const ARTICLE: Article = {
  id: 'bai-001',
  mach_slug: 'mach-1',
  machSlug: 'mach-1',
  mach_index: 1,
  machIndex: 1,
  mach_title: 'M1',
  machTitle: 'M1',
  number: 1,
  title: 'T',
  path: '/x',
  body: 'Bạn không lười. Và bạn **không làm quá**.\n\nCỗ máy không bao giờ tắt.',
  content_hash: 'abc',
  contentHash: 'abc',
};

function createTestCtx(): Ctx {
  const tmpDb = path.join(process.cwd(), 'data', `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const settings = getSettings();
  const testSettings = { ...settings, dbPath: tmpDb };
  const ctx = makeCtx(testSettings as any);
  return ctx;
}

export function cleanupDb(dbPath: string) {
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(`${dbPath}-wal`); } catch {}
  try { fs.unlinkSync(`${dbPath}-shm`); } catch {}
}

describe('core', () => {
  it('verifiedSeed keeps only verbatim quotes', () => {
    const seed: IdeaSeed = {
      angle: 'a',
      insight: 'i',
      quotes: ['Bạn không lười. Và bạn không làm quá.', 'Câu bịa ra.'],
      question: 'q',
      emotion: 'e',
      hook_seed: 'h',
      formats: ['doc-cham', 'thuc-hanh', 'goi-ten'],
    };
    const out = verifiedSeed(seed, ARTICLE);
    expect(out.quotes).toEqual(['Bạn không lười. Và bạn không làm quá.']);
    expect(out.formats).toEqual(['doc-cham', 'goi-ten']);
  });

  it('verifiedSeed drops doc-cham without quotes', () => {
    const seed: IdeaSeed = {
      angle: 'a',
      insight: 'i',
      quotes: ['bịa'],
      question: 'q',
      emotion: 'e',
      hook_seed: 'h',
      formats: ['doc-cham'],
    };
    expect(verifiedSeed(seed, ARTICLE).formats).toEqual(['goi-ten']);
  });

  it('weightedTotal uses config weights', () => {
    const ctx = createTestCtx();
    const report: CriticReport = {
      best_hook_index: 0,
      scores: {
        hook: 10,
        philosophy: 10,
        single_idea: 10,
        voice: 10,
        ending: 10,
        readability: 0,
      },
      violations: [],
      feedback: [],
    };
    expect(weightedTotal(ctx.settings, report)).toBe(9.0);
    cleanupDb(ctx.settings.dbPath);
  });

  it('depthScore rewards saves and shares', () => {
    const w = { saves: 4, shares: 3, comments: 2, likes: 0.5 };
    expect(depthScore(w, { views: 1000, saves: 10, shares: 0, comments: 0, likes: 0 })).toBe(40.0);
    expect(depthScore(w, { views: 0 })).toBe(0.0);
  });

  it('tiktok chunkPlan calculates chunks correctly', () => {
    expect(chunkPlan(20000000)).toEqual([20000000, 1]);
    const size = MAX_SINGLE_CHUNK + 5;
    const [chunk, count] = chunkPlan(size);
    expect(chunk).toBe(CHUNK);
    expect(count).toBe(Math.floor(size / CHUNK));
  });

  it('pipeline moves video through all stages', async () => {
    const ctx = createTestCtx();

    // Insert article & idea
    ctx.db.run(
      `INSERT INTO articles(id, mach_slug, mach_index, mach_title, number, title, path, content_hash, ingested_at)
       VALUES('bai-001', 'm-1', 1, 'M1', 1, 'T1', '/p', 'h', ?)`,
      utcnow()
    );
    const ideaId = ctx.db.run(
      `INSERT INTO ideas(article_id, angle, insight, quotes, formats, primary_format, status, question, emotion, hook_seed, created_at)
       VALUES('bai-001', 'a', 'i', '[]', '["goi-ten"]', 'goi-ten', 'used', 'q', 'e', 'h', ?)`,
      utcnow()
    );
    const vid = ctx.db.run(
      `INSERT INTO videos(idea_id, article_id, format, slot_at, episode, status, created_at, updated_at)
       VALUES(?, 'bai-001', 'goi-ten', '2030-01-01T00:00:00Z', 1, 'planned', ?, ?)`,
      ideaId,
      utcnow(),
      utcnow()
    );

    const order = [...pipeline.STAGES.map((s) => s.status), VideoStatus.QUEUED];
    const originalStages = [...pipeline.STAGES];

    try {
      // Mock handlers to advance status
      pipeline.STAGES.forEach((s) => {
        s.handler = async (c, _llm, v) => {
          const currIdx = order.indexOf(v.status as VideoStatus);
          c.db.updateVideo(v.id, { status: order[currIdx + 1] });
        };
      });

      const stats = await pipeline.produce(ctx, null as any);
      expect(ctx.db.video(vid).status).toBe(VideoStatus.QUEUED);
      for (const val of Object.values(stats)) {
        expect(val).toBe(1);
      }
      expect(ctx.db.all<{ agent: string; phase: string }>(
        'SELECT agent, phase FROM events WHERE phase IS NOT NULL ORDER BY id',
      )).toEqual(pipeline.STAGES.flatMap((stage) => [
        { agent: stage.name, phase: 'started' },
        { agent: stage.name, phase: 'finished' },
      ]));
    } finally {
      // Restore handlers
      originalStages.forEach((orig, i) => {
        pipeline.STAGES[i].handler = orig.handler;
      });
      cleanupDb(ctx.settings.dbPath);
    }
  });
});
