import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings, getSettings } from '../src/config.js';
import { makeCtx, type Ctx } from '../src/context.js';
import { runAutomation, automationConfig, automationState, AUTOMATION_KEY } from '../src/automation.js';
import { ingestArticle } from '../src/agents/ingest.js';
import * as planner from '../src/agents/planner.js';
import * as pipeline from '../src/pipeline.js';
import { publishVideo } from '../src/agents/publisher.js';
import { assertUniqueScript, sameIdea } from '../src/ideaIdentity.js';
import { LLM } from '../src/llm.js';
import type { Article } from '../src/content.js';
import { YouTube } from '../src/integrations/youtube.js';
import type { IdeaSeed } from '../src/schemas.js';

let root: string;
let ctx: Ctx;
const now = new Date('2026-10-24T00:00:00+07:00');
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'endo-auto-'));
  const settings = new Settings(getSettings());
  settings.paths = { ...settings.paths, data_dir: root, content_dir: path.join(root, 'content') };
  fs.mkdirSync(settings.paths.content_dir);
  settings.schedule = { ...settings.schedule, same_article_gap_days: 0 };
  settings.publish = { ...settings.publish, dry_run: true, platforms: ['youtube'] };
  ctx = makeCtx(settings);
  ctx.db.setKv(AUTOMATION_KEY, { enabled: true, dailyLimit: 3 });
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const mockLlm = async (options: any) => {
    const input = JSON.parse(options.user);
    if (input.candidates) return options.schema.parse({ ideaIds: input.candidates.map((idea: { id: number }) => idea.id) });
    return options.schema.parse({ approved: true, reason: 'Fixture reviewed' });
  };
  vi.spyOn(LLM.prototype, 'gpt').mockImplementation(mockLlm);
  vi.spyOn(LLM.prototype, 'geminiRun').mockImplementation(mockLlm);
});
afterEach(() => {
  ctx.db.close();
  fs.rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function article(id = 'source') {
  ctx.db.run(`INSERT OR IGNORE INTO articles(id, mach_slug, mach_index, mach_title, number, title, path, content_hash)
    VALUES (?, 'm', 1, 'm', 1, 'title', 'path', 'hash')`, id);
}
function idea(angle: string, insight = `Nội dung ${angle}`, status = 'available') {
  article();
  return ctx.db.run(`INSERT INTO ideas(article_id, angle, insight, formats, primary_format, status, created_at)
    VALUES ('source', ?, ?, '["goi-ten","thuc-hanh","doc-cham"]', 'goi-ten', ?, ?)`,
    angle, insight, status, now.toISOString());
}
function video(ideaId: number, status: string, at = '2026-10-24T00:00:00Z') {
  return ctx.db.run(`INSERT INTO videos(idea_id, article_id, format, slot_at, episode, status, script, created_at, updated_at)
    VALUES (?, 'source', 'goi-ten', ?, 1, ?, ?, ?, ?)`, ideaId, at, status,
    JSON.stringify({ beats: [{ text: `Unique story ${ideaId}` }], caption: 'Caption', hashtags: [] }), now.toISOString(), now.toISOString());
}

describe('idea identity and ingest history', () => {
  it('normalizes case/punctuation and rejects high-overlap wording without merging distinct insights', () => {
    const base = { article_id: 'source', angle: 'Nhận diện kiệt sức vì luôn làm vừa lòng người khác', insight: 'Nhận diện giới hạn cá nhân' };
    expect(sameIdea(base, { ...base, angle: 'NHẬN DIỆN KIỆT SỨC, VÌ LUÔN LÀM VỪA LÒNG NGƯỜI KHÁC!' })).toBe(true);
    expect(sameIdea(base, { ...base, insight: 'khác', angle: `${base.angle} nhé` })).toBe(true);
    expect(sameIdea(base, { ...base, angle: 'Xây dựng thói quen nghỉ ngơi', insight: 'Ngắt kết nối thiết bị trước khi ngủ' })).toBe(false);
  });
  it('preserves used and available ideas on reingest and deduplicates within the returned batch', async () => {
    const used = idea('Nhận diện kiệt sức', 'Hiểu đúng giới hạn cá nhân', 'used');
    video(used, 'published');
    const available = idea('Nghỉ ngơi chủ động', 'Tạo khoảng lặng mỗi ngày');
    const seed: IdeaSeed = {
      angle: 'NHẬN DIỆN KIỆT SỨC!', insight: 'Hiểu đúng giới hạn cá nhân', quotes: [],
      metaphor: '', practice: '', question: 'Q?', emotion: 'calm', hook_seed: 'H', formats: ['goi-ten'],
    };
    const response = [seed, { ...seed, angle: 'Ranh giới công việc', insight: 'Nói không với yêu cầu ngoài giờ' }];
    const llm = new LLM(ctx.settings);
    vi.spyOn(llm, 'gpt').mockResolvedValue({ ideas: [...response, response[1]] });
    vi.spyOn(llm, 'geminiRun').mockResolvedValue({ ideas: [...response, response[1]] });
    const source: Article = {
      id: 'source', mach_slug: 'm', machSlug: 'm', mach_index: 1, machIndex: 1, mach_title: 'm',
      machTitle: 'm', number: 1, title: 'title', path: 'path', body: 'body', content_hash: 'new', contentHash: 'new',
    };
    expect(await ingestArticle(ctx, llm, source)).toBe(1);
    expect(await ingestArticle(ctx, llm, source)).toBe(0);
    expect(ctx.db.one('SELECT id FROM ideas WHERE id = ?', used)).not.toBeNull();
    expect(ctx.db.one('SELECT id FROM ideas WHERE id = ?', available)).not.toBeNull();
    expect(ctx.db.one<{ n: number }>('SELECT count(*) AS n FROM ideas')?.n).toBe(3);
  });
  it('catches repeated script content even with different ideas, hooks and captions', () => {
    const old = video(idea('old angle'), 'published');
    const next = video(idea('different angle'), 'planned', '2026-10-24T01:00:00Z');
    const script = { beats: [{ text: 'Nghỉ ngơi không phải là phần thưởng sau khi kiệt sức.' }], caption: 'old' };
    ctx.db.updateVideo(old, { script: JSON.stringify(script) });
    ctx.db.updateVideo(next, { script: JSON.stringify({ ...script, caption: 'new caption', hooks: ['new hook'] }) });
    expect(() => assertUniqueScript(ctx, ctx.db.video(next))).toThrow('trùng/gần trùng nội dung');
    ctx.db.updateVideo(next, { script: JSON.stringify({ beats: [{ text: 'Thiết lập ranh giới bằng một lời từ chối rõ ràng.' }] }) });
    expect(() => assertUniqueScript(ctx, ctx.db.video(next))).not.toThrow();
  });
});

describe('bounded unique planning', () => {
  it('never reuses a referenced idea even if an old failed video made it available again', () => {
    const used = idea('Ý tưởng đã dùng', 'Nội dung lịch sử');
    video(used, 'failed');
    idea('Ý tưởng đã dùng!', 'Nội dung khác');
    expect(planner.run(ctx, now, { horizonHours: 24, dailyLimit: 3 })).toBe(0);
  });
  it('allows different angles from the same source and limits slots to the next 24h and daily cap', () => {
    for (let i = 0; i < 8; i++) idea(`góc-${i}`, `insight-${i}`);
    expect(planner.run(ctx, now, { horizonHours: 24, dailyLimit: 2 })).toBe(2);
    expect(planner.run(ctx, now, { horizonHours: 24, dailyLimit: 2 })).toBe(0);
    const rows = ctx.db.all<{ idea_id: number; slot_at: string }>('SELECT idea_id, slot_at FROM videos');
    expect(new Set(rows.map((row) => row.idea_id)).size).toBe(2);
    for (const row of rows) expect(Date.parse(row.slot_at)).toBeLessThanOrEqual(now.getTime() + 86400000);
    ctx.db.updateVideo(ctx.db.one<{ id: number }>('SELECT id FROM videos LIMIT 1')!.id, { status: 'failed' });
    expect(planner.run(ctx, now, { horizonHours: 24, dailyLimit: 2 })).toBe(0);
  });
  it('uses the configured timezone instead of hard-coded GMT+7', () => {
    expect(planner.zonedSlot('2026-10-24', 11, 30, 'Asia/Tokyo').toISOString()).toBe('2026-10-24T02:30:00.000Z');
    expect(planner.zonedSlot('2026-10-24', 11, 30, 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-10-24T04:30:00.000Z');
  });
});

describe('continuous automatic cycles', () => {
  function mockProduction() {
    const order = [...pipeline.STAGES.map((stage) => stage.status), 'queued'];
    for (const stage of pipeline.STAGES) {
      vi.spyOn(stage, 'handler').mockImplementation(async (context, _llm, target) => {
        context.db.updateVideo(target.id, {
          status: order[order.indexOf(target.status) + 1],
          script: JSON.stringify({ beats: [{ text: `Unique story ${target.idea_id}` }], caption: 'Fixture caption', hashtags: [] }),
        });
      });
    }
  }
  it('migrates legacy configuration with original platforms without modifying settings or stored history', () => {
    ctx.settings.publish.platforms = ['instagram', 'tiktok'];
    const config = automationConfig(ctx);
    expect(config).toEqual({ enabled: true, dailyLimit: 3, horizonHours: 24,
      checkIntervalSeconds: 60, platforms: ['instagram', 'tiktok'] });
    expect(ctx.db.getKv(AUTOMATION_KEY)).toEqual({ enabled: true, dailyLimit: 3 });
  });
  it('applies an extended preparation horizon to actual planned slots, keeping the daily cap', async () => {
    mockProduction();
    for (let i = 0; i < 12; i++) idea(`angle-${i}`, `meaning-${i}`);
    ctx.db.setKv(AUTOMATION_KEY, { enabled: true, dailyLimit: 1, horizonHours: 168,
      checkIntervalSeconds: 180, platforms: ['youtube'] });
    await runAutomation(ctx);
    const rows = ctx.db.all<{ slot_at: string }>('SELECT slot_at FROM videos ORDER BY slot_at');
    expect(rows.length).toBe(7);
    expect(rows.some((row) => Date.parse(row.slot_at) > now.getTime() + 86400000)).toBe(true);
    expect(rows.every((row) => Date.parse(row.slot_at) <= now.getTime() + 168 * 3600000)).toBe(true);
    expect(pipeline.STAGES[0].handler).toHaveBeenCalledTimes(1);
  });
  it('applies the horizon to production selection without deleting or moving existing future videos', async () => {
    mockProduction();
    ctx.settings.schedule.slots = [];
    const slot = new Date(now.getTime() + 48 * 3600000).toISOString();
    const id = video(idea('future idea'), 'planned', slot);
    ctx.db.setKv(AUTOMATION_KEY, { enabled: true, dailyLimit: 3, horizonHours: 1, checkIntervalSeconds: 60, platforms: ['youtube'] });
    await runAutomation(ctx);
    expect(pipeline.STAGES[0].handler).not.toHaveBeenCalled();
    expect(ctx.db.video(id)).toMatchObject({ status: 'planned', slot_at: slot });
    ctx.db.setKv(AUTOMATION_KEY, { ...automationConfig(ctx), horizonHours: 72 });
    await runAutomation(ctx);
    expect(ctx.db.video(id)).toMatchObject({ status: 'queued', slot_at: slot });
    expect(pipeline.STAGES[0].handler).toHaveBeenCalledTimes(1);
  });
  it('uses selected platforms for pending publications and production, but keeps manual settings and finished videos intact', async () => {
    mockProduction();
    const id = video(idea('ready idea'), 'queued', '2026-10-23T00:00:00Z');
    ctx.db.run("INSERT INTO publications(video_id, platform, status, error) VALUES (?, 'instagram', 'pending', 'Old unselected platform error')", id);
    const completed = video(idea('completed idea'), 'published', '2026-10-22T00:00:00Z');
    idea('new idea to produce');
    ctx.db.setKv(AUTOMATION_KEY, { enabled: true, dailyLimit: 3, horizonHours: 24, checkIntervalSeconds: 60,
      platforms: ['youtube', 'tiktok'] });
    await runAutomation(ctx);
    expect(ctx.db.all('SELECT platform, status FROM publications WHERE video_id = ? ORDER BY platform', id)).toEqual([
      { platform: 'instagram', status: 'pending' }, { platform: 'tiktok', status: 'dry_run' }, { platform: 'youtube', status: 'dry_run' },
    ]);
    expect(ctx.db.video(id).status).toBe('published');
    expect(ctx.db.all('SELECT id FROM publications WHERE video_id = ?', completed)).toHaveLength(0);
    const productionCtx = vi.mocked(pipeline.STAGES[0].handler).mock.calls[0][0];
    expect(productionCtx.settings.publish.platforms).toEqual(['youtube', 'tiktok']);
    expect(productionCtx.settings.publish.dry_run).toBe(true);
    expect(ctx.settings.publish.platforms).toEqual(['youtube']);
    const manual = video(idea('manual unique'), 'queued', '2026-10-21T00:00:00Z');
    await publishVideo(ctx, ctx.db.video(manual));
    expect(ctx.db.all('SELECT platform FROM publications WHERE video_id = ?', manual)).toEqual([{ platform: 'youtube' }]);
  });
  it('fills, produces, publishes at the due time, keeps a persistent daily budget, and never creates repeats', async () => {
    mockProduction();
    for (let i = 0; i < 6; i++) idea(`angle-${i}`, `meaning-${i}`);
    for (let i = 0; i < 4; i++) await runAutomation(ctx);
    expect(ctx.db.one<{ n: number }>("SELECT count(*) AS n FROM videos WHERE status = 'queued'")?.n).toBe(3);
    expect(ctx.db.getKv(`automation_budget:2026-10-24`).production).toBe(3);
    expect(ctx.db.one<{ n: number }>('SELECT count(DISTINCT idea_id) AS n FROM videos')?.n).toBe(3);
    vi.setSystemTime(new Date('2026-10-24T16:30:00Z'));
    await runAutomation(ctx);
    expect(ctx.db.one<{ n: number }>("SELECT count(*) AS n FROM videos WHERE status = 'published'")?.n).toBe(3);
    expect(ctx.db.one<{ n: number }>('SELECT count(*) AS n FROM publications')?.n).toBe(3);
    const reopened = makeCtx(ctx.settings);
    try {
      expect(automationConfig(reopened)).toEqual({ enabled: true, dailyLimit: 3,
        horizonHours: 24, checkIntervalSeconds: 60, platforms: ['youtube'] });
      expect(reopened.db.getKv('automation_budget:2026-10-24').production).toBe(3);
    } finally { reopened.db.close(); }
  });
  it('does not run while paused/disabled and blocks rather than repeating failed production', async () => {
    mockProduction();
    idea('angle-one');
    ctx.db.setKv('paused', true);
    await runAutomation(ctx);
    expect(ctx.db.one<{ n: number }>('SELECT count(*) AS n FROM videos')?.n).toBe(0);
    ctx.db.setKv('paused', false);
    vi.mocked(pipeline.STAGES[0].handler).mockRejectedValue(new Error('Fixture model failure'));
    await expect(runAutomation(ctx)).rejects.toThrow('Fixture model failure');
    expect(automationState(ctx).blocked).toBe(true);
    await runAutomation(ctx);
    expect(pipeline.STAGES[0].handler).toHaveBeenCalledTimes(1);
  });
  it('blocks an identical generated script before a second paid voice call', async () => {
    mockProduction();
    idea('first unique angle', 'First original insight');
    idea('second distinct perspective', 'Second new meaning');
    vi.mocked(pipeline.STAGES[0].handler).mockImplementation(async (context, _llm, target) => {
      context.db.updateVideo(target.id, {
        status: 'scripted',
        script: JSON.stringify({ beats: [{ text: 'The same repeated script body.' }], caption: 'Caption', hashtags: [] }),
      });
    });
    vi.mocked(pipeline.STAGES[1].handler).mockImplementation(async (context, _llm, target) => {
      context.db.updateVideo(target.id, { status: 'approved' });
    });
    await runAutomation(ctx);
    // Restore the first script that later stage mocks intentionally overwrite.
    const first = ctx.db.one<{ id: number }>('SELECT id FROM videos WHERE status = ?', 'queued')!;
    ctx.db.updateVideo(first.id, { script: JSON.stringify({ beats: [{ text: 'The same repeated script body.' }], caption: 'Caption', hashtags: [] }) });
    await expect(runAutomation(ctx)).rejects.toThrow('trùng/gần trùng nội dung');
    expect(pipeline.STAGES[2].handler).toHaveBeenCalledTimes(1);
    expect(automationState(ctx).blocked).toBe(true);
  });
  it('uses fresh day budgets and does not loop API calls once there are no unseen articles', async () => {
    mockProduction();
    for (let i = 0; i < 8; i++) idea(`angle-${i}`, `meaning-${i}`);
    ctx.db.setKv(AUTOMATION_KEY, { enabled: true, dailyLimit: 1 });
    await runAutomation(ctx);
    await runAutomation(ctx);
    expect(pipeline.STAGES[0].handler).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-25T00:00:00+07:00'));
    await runAutomation(ctx);
    expect(pipeline.STAGES[0].handler).toHaveBeenCalledTimes(2);
  });
  it('ingests unseen and changed sources once per hash without creating new versions of existing ideas', async () => {
    mockProduction();
    const folder = path.join(ctx.settings.path('content_dir'), 'mach-1-test');
    fs.mkdirSync(folder);
    const source = path.join(folder, 'bai-001.md');
    fs.writeFileSync(source, 'A fresh source article.');
    const seeds: IdeaSeed[] = Array.from({ length: 4 }, (_, i) => ({
      angle: `Unique angle ${i}`, insight: `Unique insight ${i}`, quotes: [], metaphor: '',
      practice: '', question: 'Q?', emotion: 'calm', hook_seed: 'H', formats: ['goi-ten'],
    }));
    const originalMock = vi.mocked(LLM.prototype.geminiRun).getMockImplementation()!;
    const model = vi.mocked(LLM.prototype.geminiRun).mockImplementation(async (options) => {
      if (typeof options.system === 'string' && options.system.includes('tách thành 4–6')) return options.schema.parse({ ideas: seeds });
      return originalMock(options);
    });
    await runAutomation(ctx);
    await runAutomation(ctx);
    const ingestCalls = () => model.mock.calls.filter(([options]) => options.system.includes('tách thành 4–6')).length;
    expect(ingestCalls()).toBe(1);
    expect(ctx.db.getKv('automation_budget:2026-10-24')).toEqual({ production: 1, ingest: 1 });
    fs.writeFileSync(source, 'Updated source article.');
    await runAutomation(ctx);
    await runAutomation(ctx);
    expect(ingestCalls()).toBe(2);
    expect(ctx.db.one<{ n: number }>('SELECT count(*) AS n FROM ideas')?.n).toBe(4);
    expect(ctx.db.one<{ n: number }>('SELECT count(*) AS n FROM videos')?.n).toBe(1);
    expect(ctx.db.getKv('automation_budget:2026-10-24')).toEqual({ production: 1, ingest: 2 });
  });
  it('refuses to retry an ambiguous publication and keeps a durable review marker on upload errors', async () => {
    const id = idea('unique angle', 'unique meaning');
    const vid = video(id, 'queued');
    ctx.settings.publish.dry_run = false;
    vi.spyOn(YouTube.prototype, 'uploadShort').mockRejectedValue(new Error('Upload outcome unknown'));
    await expect(publishVideo(ctx, ctx.db.video(vid), { preventDuplicates: true })).rejects.toThrow('Upload outcome unknown');
    expect(ctx.db.one<{ status: string }>('SELECT status FROM publications')?.status).toBe('review_required');
    await expect(runAutomation(ctx)).rejects.toThrow('chưa xác định');
    expect(YouTube.prototype.uploadShort).toHaveBeenCalledTimes(1);
  });
});
