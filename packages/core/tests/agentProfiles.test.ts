import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings, getSettings } from '../src/config.js';
import { makeCtx, type Ctx } from '../src/context.js';
import { getAgentProfile, getAllAgentProfiles, saveAgentProfile, agentSystemPrompt, DEFAULT_AGENT_PROFILES } from '../src/skills.js';
import { LLM } from '../src/llm.js';
import { ingestArticle } from '../src/agents/ingest.js';
import { runWithProfile } from '../src/agents/planner.js';
import { runOne as write } from '../src/agents/writer.js';
import { runOne as critique, runVisionQA } from '../src/agents/critic.js';
import { productionDirection, runOne as prepareVisual } from '../src/agents/visual.js';
import * as pixabay from '../src/integrations/pixabay.js';
import { publishVideo } from '../src/agents/publisher.js';
import { probe } from '../src/media.js';
import type { Article } from '../src/content.js';

vi.mock('../src/media.js', async (original) => {
  const actual = await original<typeof import('../src/media.js')>();
  return { ...actual, probe: vi.fn(), extractFrames: vi.fn(() => [Buffer.from('fixture')]) };
});

let root: string;
let ctx: Ctx;
let article: Article;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'endo-profiles-'));
  const settings = new Settings(getSettings());
  settings.paths = { ...settings.paths, data_dir: root, music_dir: path.join(root, 'music') };
  settings.publish = { ...settings.publish, platforms: ['youtube'], dry_run: true };
  settings.schedule = { ...settings.schedule, same_article_gap_days: 0 };
  ctx = makeCtx(settings);
  const file = path.join(root, 'source.md');
  fs.writeFileSync(file, 'Nội dung nguồn để kiểm tra.');
  article = { id: 'source', mach_slug: 'm', machSlug: 'm', mach_index: 1, machIndex: 1, mach_title: 'M', machTitle: 'M',
    number: 1, title: 'Source', path: file, body: 'Nội dung nguồn để kiểm tra.', content_hash: 'hash', contentHash: 'hash' };
  ctx.db.run(`INSERT INTO articles(id, mach_slug, mach_index, mach_title, number, title, path, content_hash)
    VALUES ('source', 'm', 1, 'M', 1, 'Source', ?, 'hash')`, file);
  getAllAgentProfiles(ctx);
});
afterEach(() => {
  ctx.db.close();
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function customize(role: string) {
  const profile = { ...getAgentProfile(ctx, role), responsibility: `Trách nhiệm riêng ${role}`,
    systemPromptExtra: `Chỉ dẫn riêng ${role}`, equippedSkills: ['content-curation'], model: 'gpt-4o-mini', temperature: 0.35 };
  saveAgentProfile(ctx, profile);
  return profile;
}
function idea(angle: string) {
  return ctx.db.run(`INSERT INTO ideas(article_id, angle, insight, formats, primary_format, created_at)
    VALUES ('source', ?, ?, '["goi-ten"]', 'goi-ten', 'now')`, angle, angle);
}
const script = {
  hooks: [{ style: 'recognition', text: 'Một câu hỏi nhỏ' }, { style: 'naming', text: 'Một góc nhìn mới' }, { style: 'reversal', text: 'Một điều ngược lại' }],
  beats: [{ role: 'line', text: 'Nội dung kịch bản riêng biệt.', emphasis: [] }],
  caption: 'Một lời nhắc nhỏ.', hashtags: ['#noisinh'], visual_keywords: ['window', 'forest', 'sunlight'], self_check: 'Đã kiểm tra.',
};
function video() {
  const id = ctx.db.run(`INSERT INTO videos(idea_id, article_id, format, slot_at, episode, status, created_at, updated_at, script)
    VALUES (?, 'source', 'goi-ten', '2026-10-24T01:00:00Z', 1, 'planned', 'now', 'now', ?)`, idea('Unique idea'), JSON.stringify(script));
  return ctx.db.video(id);
}
function verifyPrompt(options: { system: string | string[]; model: string; temperature?: number }, role: string) {
  const text = Array.isArray(options.system) ? options.system.join('\n') : options.system;
  expect(text).toContain(`Trách nhiệm riêng ${role}`);
  expect(text).toContain(`Chỉ dẫn riêng ${role}`);
  expect(text).toContain('<skill name="content-curation">');
  expect(text).toContain('<skill name="endogenism-guardrails">');
  expect(options.model).toBe('gpt-4o-mini');
  expect(options.temperature).toBe(0.35);
}

describe('saved team profiles', () => {
  it('replaces legacy profiles once, retains a backup and preserves later edits across restart', () => {
    ctx.db.setKv('agent_profiles_version', 1);
    ctx.db.setKv('agent_skills', { producer: { model: 'old-engine' } });
    ctx.db.setKv('automation', { enabled: false, dailyLimit: 7 });
    expect(Object.keys(getAllAgentProfiles(ctx))).toHaveLength(5);
    expect(ctx.db.getKv('agent_profiles_before_v2')).toEqual({ producer: { model: 'old-engine' } });
    expect(getAgentProfile(ctx, 'producer').model).toBe('gpt-4o');
    const saved = customize('producer');
    const reopened = makeCtx(ctx.settings);
    try { expect(getAgentProfile(reopened, 'producer')).toEqual(saved); }
    finally { reopened.db.close(); }
    expect(ctx.db.getKv('automation')).toEqual({ enabled: false, dailyLimit: 7 });
  });
  it('defines complete consistent roles with real skills and mandatory task boundaries', () => {
    for (const role of Object.keys(DEFAULT_AGENT_PROFILES)) {
      const profile = getAgentProfile(ctx, role);
      expect(profile.responsibility.length).toBeGreaterThan(30);
      expect(profile.systemPromptExtra!.length).toBeGreaterThan(30);
      expect(profile.department).toBe('Team Nội Dung');
      expect(profile.title).toBe(profile.name);
      const prompt = agentSystemPrompt(ctx, role, 'Mandatory task');
      expect(prompt.endsWith('Mandatory task')).toBe(true);
      expect(prompt).not.toContain('not found');
    }
    saveAgentProfile(ctx, { ...getAgentProfile(ctx, 'writer'), equippedSkills: ['missing-skill'] });
    expect(() => agentSystemPrompt(ctx, 'writer', 'Task')).toThrow('Không tìm thấy kỹ năng');
  });
});

describe('profiles applied to actual agent tasks', () => {
  it('applies the content lead profile to ingestion and respects provider/model selection', async () => {
    customize('planner');
    const llm = new LLM(ctx.settings);
    const mock = vi.spyOn(llm, 'gpt').mockResolvedValue({ ideas: [] });
    await ingestArticle(ctx, llm, article);
    verifyPrompt(mock.mock.calls[0][0], 'planner');
  });
  it('applies priority choices, caches idle planning, invalidates on profile edit and rejects invented IDs', async () => {
    customize('planner');
    const first = idea('First idea'), second = idea('Second idea');
    const model = vi.spyOn(LLM.prototype, 'gpt').mockResolvedValue({ ideaIds: [second, first] });
    await runWithProfile(ctx, new Date('2026-10-24T00:00:00+07:00'), { horizonHours: 24, dailyLimit: 1 });
    expect(ctx.db.one<{ idea_id: number }>('SELECT idea_id FROM videos ORDER BY id LIMIT 1')?.idea_id).toBe(second);
    verifyPrompt(model.mock.calls[0][0], 'planner');
    await runWithProfile(ctx, new Date('2026-10-24T00:00:00+07:00'), { horizonHours: 24, dailyLimit: 1 });
    expect(model).toHaveBeenCalledTimes(1);
    saveAgentProfile(ctx, { ...getAgentProfile(ctx, 'planner'), systemPromptExtra: 'New instructions' });
    model.mockResolvedValue({ ideaIds: [999999] });
    await expect(runWithProfile(ctx, new Date('2026-10-24T00:00:00+07:00'), { horizonHours: 24, dailyLimit: 1 }))
      .rejects.toThrow('ID ý tưởng không hợp lệ');
    expect(ctx.db.all('SELECT id FROM videos')).toHaveLength(1);
  });
  it('applies the writer profile when generating a script', async () => {
    customize('writer');
    const llm = new LLM(ctx.settings);
    const mock = vi.spyOn(llm, 'gpt').mockResolvedValue(script);
    const target = video();
    await write(ctx, llm, target);
    verifyPrompt(mock.mock.calls[0][0], 'writer');
    expect(ctx.db.video(target.id).status).toBe('scripted');
  });
  it('applies the editor profile to both script review and visual QA without bypassing technical checks', async () => {
    customize('critic');
    const target = video();
    const llm = new LLM(ctx.settings);
    const model = vi.spyOn(llm, 'gpt').mockResolvedValueOnce({
      scores: { hook: 9, philosophy: 9, single_idea: 9, voice: 9, ending: 9, readability: 9 },
      violations: [], feedback: [], best_hook_index: 0,
    }).mockResolvedValue({ passed: true, issues: [] });
    await critique(ctx, llm, target);
    verifyPrompt(model.mock.calls[0][0], 'critic');
    const duration = ctx.settings.formats['goi-ten'].duration[0];
    vi.mocked(probe).mockReturnValue({ duration, width: 1080, height: 1920, hasAudio: true, raw: {} });
    await runVisionQA(ctx, llm, ctx.db.video(target.id));
    verifyPrompt(model.mock.calls[1][0], 'critic');
    expect(model.mock.calls[1][0].images).toHaveLength(1);
    vi.mocked(probe).mockReturnValue({ duration, width: 1, height: 1, hasAudio: true, raw: {} });
    await expect(runVisionQA(ctx, llm, target)).rejects.toThrow('Sai kích thước');
    expect(model).toHaveBeenCalledTimes(2);
  });
  it('uses producer directions for stock keywords/music and refuses paths or unlisted moods', async () => {
    customize('producer');
    const model = vi.spyOn(LLM.prototype, 'gpt').mockResolvedValue({
      keywords: ['quiet forest', 'sunlit window', 'slow river'], musicMood: ctx.settings.formats['goi-ten'].music_mood,
    });
    const target = video();
    const direction = await productionDirection(ctx, target);
    expect(direction.keywords).toEqual(['quiet forest', 'sunlit window', 'slow river']);
    verifyPrompt(model.mock.calls[0][0], 'producer');
    model.mockResolvedValue({ keywords: ['one', 'two', 'three'], musicMood: '../../unsafe' });
    await expect(productionDirection(ctx, target)).rejects.toThrow('ngoài danh sách');
  });
  it('applies publisher approval before any publication and never publishes a denied video', async () => {
    customize('publisher');
    const model = vi.spyOn(LLM.prototype, 'gpt').mockResolvedValue({ approved: false, reason: 'Caption không phù hợp' });
    const target = video();
    await expect(publishVideo(ctx, target)).rejects.toThrow('Caption không phù hợp');
    expect(ctx.db.all('SELECT id FROM publications')).toHaveLength(0);
    verifyPrompt(model.mock.calls[0][0], 'publisher');
    await expect(publishVideo(ctx, target)).rejects.toThrow('Caption không phù hợp');
    expect(model).toHaveBeenCalledTimes(1);
    saveAgentProfile(ctx, { ...getAgentProfile(ctx, 'publisher'), systemPromptExtra: 'Đã chỉnh quy tắc caption.' });
    model.mockResolvedValue({ approved: true, reason: 'Metadata phù hợp' });
    await publishVideo(ctx, target);
    expect(ctx.db.one<{ status: string }>('SELECT status FROM publications')?.status).toBe('dry_run');
    await publishVideo(ctx, ctx.db.video(target.id));
    expect(model).toHaveBeenCalledTimes(2);
  });
  it('uses producer decisions in actual stock searches and the copied music track', async () => {
    customize('producer');
    ctx.settings.formats = { ...ctx.settings.formats, 'goi-ten': { ...ctx.settings.formats['goi-ten'], visual: 'stock' } };
    const moodDir = path.join(ctx.settings.path('music_dir'), 'profile-mood');
    fs.mkdirSync(moodDir, { recursive: true });
    fs.writeFileSync(path.join(moodDir, 'profile-track.mp3'), 'fixture music');
    const direction = { keywords: ['rain on glass', 'quiet forest', 'slow clouds'], musicMood: 'profile-mood' };
    const model = vi.spyOn(LLM.prototype, 'gpt').mockResolvedValue(direction);
    vi.spyOn(ctx.settings, 'secret').mockImplementation((name) => name === 'PIXABAY_API_KEY' ? 'fixture' : undefined);
    const search = vi.spyOn(pixabay, 'searchVideos').mockResolvedValue([1, 2].map((id) => ({
      id, url: `https://example.invalid/${id}`, duration: 10, tags: 'fixture', user: 'fixture',
      files: [{ url: 'https://example.invalid/clip', width: 1080, height: 1920, size: 100, quality: 'medium' }],
    })));
    vi.spyOn(pixabay, 'download').mockResolvedValue(undefined);
    const target = video();
    target.media = JSON.stringify({ speech_seconds: 7 });
    const media = await prepareVisual(ctx, target);
    verifyPrompt(model.mock.calls[0][0], 'producer');
    expect(search).toHaveBeenCalledWith(ctx.settings, direction.keywords[0]);
    expect(media.clips).toHaveLength(2);
    expect(media.music_track).toBe('profile-track.mp3');
    expect(media.production_direction).toEqual(direction);
    const copied = path.join(ctx.settings.dataDir, 'media', String(target.id).padStart(5, '0'), 'public', 'music.mp3');
    expect(fs.readFileSync(copied, 'utf8')).toBe('fixture music');
  });
  it('routes Claude models to Claude while retaining saved instructions', async () => {
    saveAgentProfile(ctx, { ...customize('planner'), model: 'claude-test' });
    const llm = new LLM(ctx.settings);
    const claude = vi.spyOn(llm, 'claude').mockResolvedValue({ ideas: [] });
    const gpt = vi.spyOn(llm, 'gpt');
    await ingestArticle(ctx, llm, article);
    expect(claude).toHaveBeenCalledOnce();
    expect(gpt).not.toHaveBeenCalled();
    expect(claude.mock.calls[0][0].system).toContain('Chỉ dẫn riêng planner');
  });
});
