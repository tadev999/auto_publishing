import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as planner from '../src/agents/planner.js';
import { getSettings } from '../src/config.js';
import { Ctx, makeCtx } from '../src/context.js';
import { VideoStatus, utcnow } from '../src/db.js';

const ALL = ['goi-ten', 'ngo-nhan', 'thuc-hanh', 'doc-cham', 'cau-hoi'];

function createTestCtx(): Ctx {
  const tmpDb = path.join(process.cwd(), 'data', `test-plan-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const settings = getSettings();
  const testSettings = { ...settings, dbPath: tmpDb };
  return makeCtx(testSettings as any);
}

function cleanupDb(dbPath: string) {
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(`${dbPath}-wal`); } catch {}
  try { fs.unlinkSync(`${dbPath}-shm`); } catch {}
}

function seed(ctx: Ctx, articles = 12, mach = 1, start = 1) {
  for (let n = start; n < start + articles; n++) {
    const aid = `bai-${String(n).padStart(3, '0')}`;
    ctx.db.run(
      `INSERT INTO articles(id, mach_slug, mach_index, mach_title, number, title, path, content_hash, ingested_at)
       VALUES(?, ?, ?, ?, ?, ?, '/path', 'hash', ?)`,
      aid,
      `mach-${mach}`,
      mach,
      `Mạch ${mach}`,
      n,
      `Bài ${n}`,
      utcnow()
    );

    for (let i = 0; i < 3; i++) {
      ctx.db.run(
        `INSERT INTO ideas(article_id, angle, insight, quotes, formats, primary_format, status, question, emotion, hook_seed, created_at)
         VALUES(?, 'angle', 'insight', '[]', ?, ?, 'available', 'q', 'e', 'h', ?)`,
        aid,
        JSON.stringify(ALL),
        ALL[0],
        utcnow()
      );
    }
  }
}

function testNow(): Date {
  return new Date('2026-10-24T00:00:00+07:00');
}

describe('planner', () => {
  it('ramp_up plans three videos per day for new account', () => {
    const ctx = createTestCtx();
    try {
      seed(ctx);
      const created = planner.run(ctx, testNow());
      const days = ctx.settings.schedule.queue_days;
      expect(created).toBe(3 * days);

      const rows = ctx.db.all<any>('SELECT DISTINCT format FROM videos');
      const formats = new Set(rows.map((r) => r.format));
      expect(formats).toEqual(new Set(['goi-ten', 'thuc-hanh', 'doc-cham']));
    } finally {
      cleanupDb(ctx.settings.dbPath);
    }
  });

  it('full schedule after ramp up', () => {
    const ctx = createTestCtx();
    try {
      seed(ctx, 30);
      ctx.db.setKv('schedule_start', '2026-09-01');
      const created = planner.run(ctx, testNow());
      expect(created).toBe(5 * ctx.settings.schedule.queue_days);
    } finally {
      cleanupDb(ctx.settings.dbPath);
    }
  });

  it('planner is idempotent', () => {
    const ctx = createTestCtx();
    try {
      seed(ctx);
      planner.run(ctx, testNow());
      expect(planner.run(ctx, testNow())).toBe(0);
    } finally {
      cleanupDb(ctx.settings.dbPath);
    }
  });

  it('journey starts with first article of current mach', () => {
    const ctx = createTestCtx();
    try {
      seed(ctx, 5, 2, 31);
      seed(ctx, 5, 1, 1);
      planner.run(ctx, testNow());
      const first = ctx.db.one<any>('SELECT article_id FROM videos ORDER BY slot_at LIMIT 1');
      expect(first.article_id).toBe('bai-001');
    } finally {
      cleanupDb(ctx.settings.dbPath);
    }
  });

  it('ideas are reserved and episodes increment', () => {
    const ctx = createTestCtx();
    try {
      seed(ctx);
      planner.run(ctx, testNow());
      const used = ctx.db.one<any>("SELECT COUNT(*) AS n FROM ideas WHERE status = 'used'").n;
      const countVideos = ctx.db.one<any>('SELECT COUNT(*) AS n FROM videos').n;
      expect(used).toBe(countVideos);

      const eps = ctx.db
        .all<any>("SELECT episode FROM videos WHERE format = 'goi-ten' ORDER BY slot_at")
        .map((r) => r.episode);
      expect(eps).toEqual(Array.from({ length: eps.length }, (_, i) => i + 1));
    } finally {
      cleanupDb(ctx.settings.dbPath);
    }
  });

  it('failed slot is refilled', () => {
    const ctx = createTestCtx();
    try {
      seed(ctx);
      planner.run(ctx, testNow());
      const vid = ctx.db.one<any>('SELECT id FROM videos ORDER BY slot_at LIMIT 1').id;
      ctx.db.updateVideo(vid, { status: VideoStatus.FAILED });
      expect(planner.run(ctx, testNow())).toBe(1);
    } finally {
      cleanupDb(ctx.settings.dbPath);
    }
  });
});
