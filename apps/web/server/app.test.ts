import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createStudioApp } from './app.js';
import { accessControl } from './access.js';
import { JobRunner, validateCommand } from './jobs.js';
import { acquireServerLock } from './lock.js';
import type { Job, StudioStatus } from '../shared/api.js';
import { DB } from '@endo/core/db';

let root: string;
let studio: ReturnType<typeof createStudioApp>;
let server: http.Server;
let base: string;
const request = (url: string, method = 'GET', body?: unknown) =>
  fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const autoDefaults = { horizonHours: 24, checkIntervalSeconds: 60, platforms: ['youtube'] };
async function waitForJob(id: string) {
  for (let i = 0; i < 100; i++) {
    const response = await request(`/api/jobs/${id}`);
    const job: Job = await response.json();
    if (job.status !== 'running') return job;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('Job did not finish.');
}

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'endo-web-test-'));
  fs.mkdirSync(path.join(root, 'apps/cli/dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/cli/dist/cli.js'), `
    const command = process.argv[2];
    console.log('fixture ' + command);
    if (command === 'produce') {
      const child = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)']);
      require('node:fs').writeFileSync('descendant.pid', String(child.pid));
      setTimeout(() => {}, 30000);
    }
    else if (command === 'ingest') process.exitCode = 2;
  `);
  studio = createStudioApp({
    root, dataDir: path.join(root, 'data'), access: { host: '127.0.0.1' }, scheduler: false,
  });
  server = http.createServer(studio.app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address.');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await studio.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('command validation', () => {
  it('prevents a second server from claiming the same database', () => {
    const release = acquireServerLock(path.join(root, 'data'));
    try {
      expect(() => acquireServerLock(path.join(root, 'data'))).toThrow('already owns this database');
    } finally { release(); }
    const releaseAgain = acquireServerLock(path.join(root, 'data'));
    releaseAgain();
  });
  it('only allows supported commands and options', () => {
    expect(validateCommand({ command: 'produce', args: ['--limit', '1'] }).command).toBe('produce');
    for (const input of [
      { command: 'exec', args: [] },
      { command: 'publish', args: ['--video-id', '1;touch /tmp/unwanted'] },
      { command: 'plan', args: ['--help'] },
      { command: 'produce', args: ['--limit', '0'] },
      { command: 'produce', args: ['--limit', '1', '--limit', '2'] },
      { command: 'plan', args: [], extra: true },
    ]) expect(() => validateCommand(input)).toThrow();
  });
});

describe('web API', () => {
  it('validates automatic settings, persists pause/limit, and rejects direct internal cycle requests', async () => {
    expect((await (await request('/api/status')).json()).schedule.automation).toMatchObject({ enabled: false, dailyLimit: 3 });
    expect((await request('/api/automation', 'PUT', { ...autoDefaults, enabled: false, dailyLimit: 7 })).status).toBe(200);
    expect(studio.db.getKv('automation')).toEqual({ ...autoDefaults, enabled: false, dailyLimit: 7 });
    expect(studio.db.getKv('paused')).toBe(true);
    for (const dailyLimit of [0, 21, 1.5, '3']) {
      expect((await request('/api/automation', 'PUT', { ...autoDefaults, enabled: false, dailyLimit })).status).toBe(400);
    }
    expect((await request('/api/automation', 'PUT', { ...autoDefaults, enabled: true, dailyLimit: 3 })).status).toBe(409);
    expect((await request('/api/jobs', 'POST', { command: 'auto-cycle' })).status).toBe(400);
    expect(studio.db.getKv('automation')).toEqual({ ...autoDefaults, enabled: false, dailyLimit: 7 });
  });
  it('validates all tunable fields before persistence and can save while off without starting a job', async () => {
    const input = { ...autoDefaults, enabled: false, dailyLimit: 4, action: 'save',
      horizonHours: 168, checkIntervalSeconds: 30, platforms: ['instagram', 'tiktok'] };
    expect((await request('/api/automation', 'PUT', input)).status).toBe(200);
    expect(studio.jobs.active).toBeNull();
    expect(studio.db.getKv('paused', false)).toBe(false);
    const status: StudioStatus = await (await request('/api/status')).json();
    expect(status.schedule.automation).toMatchObject({
      enabled: false, dailyLimit: 4, horizonHours: 168, checkIntervalSeconds: 30, platforms: ['instagram', 'tiktok'],
    });
    const invalid = [
      { horizonHours: 0 }, { horizonHours: 169 }, { horizonHours: 1.5 }, { horizonHours: '24' },
      { checkIntervalSeconds: 29 }, { checkIntervalSeconds: 3601 }, { checkIntervalSeconds: 30.5 },
      { platforms: [] }, { platforms: ['facebook'] }, { platforms: ['youtube', 'youtube'] },
    ];
    const saved = studio.db.getKv('automation');
    for (const change of invalid) {
      expect((await request('/api/automation', 'PUT', { ...input, ...change })).status).toBe(400);
      expect(studio.db.getKv('automation')).toEqual(saved);
    }
    expect((await request('/api/automation', 'PUT', { enabled: false, dailyLimit: 3 })).status).toBe(400);
  });
  it('starts automation only explicitly and persists a stop', async () => {
    await studio.close();
    studio = createStudioApp({ root, dataDir: path.join(root, 'data'), access: { host: '127.0.0.1' } });
    const previous = server;
    previous.closeAllConnections();
    await new Promise<void>((resolve) => previous.close(() => resolve()));
    server = http.createServer(studio.app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address.');
    base = `http://127.0.0.1:${address.port}`;
    expect((await request('/api/automation', 'PUT', { ...autoDefaults, enabled: true, dailyLimit: 2 })).status).toBe(200);
    const status: StudioStatus = await (await request('/api/status')).json();
    expect(status.schedule.automation).toMatchObject({ enabled: true, dailyLimit: 2, blocked: false });
    const first = studio.db.one<{ payload: string }>('SELECT payload FROM web_jobs LIMIT 1')!;
    await waitForJob(JSON.parse(first.payload).id);
    expect(studio.db.getKv('automation_state').blocked).toBe(false);
    await request('/api/stop', 'POST');
    expect(studio.db.getKv('automation')).toEqual({ ...autoDefaults, enabled: false, dailyLimit: 2 });
    expect(studio.db.getKv('paused')).toBe(true);
  });
  it('blocks interrupted automatic jobs on restart without discarding the enabled setting', () => {
    const job: Job = {
      id: 'interrupted-auto', command: 'auto-cycle', args: [], status: 'running',
      startedAt: new Date().toISOString(), output: '', eventCursor: 0,
    };
    studio.db.setKv('automation', { enabled: true, dailyLimit: 5 });
    studio.db.run('INSERT INTO web_jobs(id, payload) VALUES (?, ?)', job.id, JSON.stringify(job));
    const runner = new JobRunner(studio.db, root, () => {});
    expect(runner.get(job.id).status).toBe('interrupted');
    expect(studio.db.getKv('automation_state').blocked).toBe(true);
    expect(studio.db.getKv('automation')).toEqual({ enabled: true, dailyLimit: 5 });
  });
  it('resumes persisted enabled automation on scheduler ticks, but never starts a blocked cycle', async () => {
    const dataDir = path.join(root, 'scheduler-auto');
    const persisted = new DB(path.join(dataDir, 'app.db'));
    persisted.setKv('automation', { enabled: true, dailyLimit: 4 });
    persisted.setKv('automation_state', { blocked: true, lastError: 'Review required', message: 'Blocked', lastCycleAt: null });
    persisted.close();
    vi.useFakeTimers();
    const scheduled = createStudioApp({ root, dataDir, access: { host: '127.0.0.1' } });
    try {
      vi.advanceTimersByTime(60000);
      expect(scheduled.jobs.active).toBeNull();
      scheduled.db.setKv('automation_state', { blocked: false, lastError: null, message: 'Ready', lastCycleAt: null });
      vi.advanceTimersByTime(60000);
      expect(scheduled.jobs.active?.command).toBe('auto-cycle');
      expect(scheduled.db.getKv('automation_state').blocked).toBe(false);
    } finally {
      vi.useRealTimers();
      await scheduled.close();
    }
  });
  it('uses the persisted custom interval after restart, reports it and prevents overlapping jobs', async () => {
    const dataDir = path.join(root, 'custom-scheduler');
    const persisted = new DB(path.join(dataDir, 'app.db'));
    persisted.setKv('automation', { ...autoDefaults, enabled: true, dailyLimit: 3, checkIntervalSeconds: 30 });
    persisted.close();
    vi.useFakeTimers();
    const scheduled = createStudioApp({ root, dataDir, access: { host: '127.0.0.1' } });
    try {
      vi.advanceTimersByTime(29999);
      expect(scheduled.jobs.active).toBeNull();
      vi.advanceTimersByTime(1);
      expect(scheduled.jobs.active?.command).toBe('auto-cycle');
      const job = scheduled.jobs.active?.id;
      vi.advanceTimersByTime(30000);
      expect(scheduled.jobs.active?.id).toBe(job);
      expect(scheduled.db.all('SELECT id FROM web_jobs')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      await scheduled.close();
    }
  });
  it('reschedules immediately on save without running or unblocking automatic work', async () => {
    await studio.close();
    studio = createStudioApp({ root, dataDir: path.join(root, 'data'), access: { host: '127.0.0.1' } });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = http.createServer(studio.app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address.');
    base = `http://127.0.0.1:${address.port}`;
    studio.db.setKv('automation', { ...autoDefaults, enabled: true, dailyLimit: 3 });
    studio.db.setKv('automation_state', { blocked: true, lastError: 'Review', message: 'Review', lastCycleAt: null });
    const input = { ...autoDefaults, enabled: true, dailyLimit: 6, horizonHours: 48, checkIntervalSeconds: 180, platforms: ['tiktok'], action: 'save' };
    expect((await request('/api/automation', 'PUT', input)).status).toBe(200);
    const status: StudioStatus = await (await request('/api/status')).json();
    expect(status.schedule.automation).toMatchObject({ horizonHours: 48, checkIntervalSeconds: 180, platforms: ['tiktok'], blocked: true });
    const delay = Date.parse(status.schedule.nextCheckAt!) - Date.parse(status.schedule.serverTime);
    expect(delay).toBeGreaterThan(179000);
    expect(delay).toBeLessThanOrEqual(180000);
    expect(studio.jobs.active).toBeNull();
    expect((await request('/api/automation', 'PUT', { ...input, enabled: false })).status).toBe(409);
    const job = studio.jobs.start({ command: 'produce' });
    expect((await request('/api/automation', 'PUT', input)).status).toBe(409);
    await studio.jobs.stop();
    expect((await waitForJob(job.id)).status).toBe('stopped');
  });
  it('adds lifecycle metadata to an existing audit database without losing history', () => {
    const filename = path.join(root, 'legacy.db');
    const legacy = new DB(filename);
    legacy.conn.exec(`DROP TABLE events;
      CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL,
        video_id INTEGER, agent TEXT NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL);
      INSERT INTO events(ts, agent, level, message) VALUES ('old', 'writer', 'info', 'Keep this history')`);
    legacy.close();
    const upgraded = new DB(filename);
    try {
      expect(upgraded.one('SELECT message, phase FROM events WHERE id = 1')).toEqual({
        message: 'Keep this history', phase: null,
      });
      upgraded.log('voice', 'Now working', 7, 'info', 'started');
      expect(upgraded.one<{ phase: string }>('SELECT phase FROM events WHERE id = 2')?.phase).toBe('started');
    } finally { upgraded.close(); }
  });
  it('reports the current stage, not replayed historical events, and clears it on stop', async () => {
    studio.db.log('publisher', 'Old publication', null, 'info', 'started');
    expect((await (await request('/api/status')).json()).activity.current).toBeNull();
    await request('/api/jobs', 'POST', { command: 'produce' });
    studio.db.log('writer', 'Writing video 7', 7, 'info', 'started');
    let status: StudioStatus = await (await request('/api/status')).json();
    expect(status.activity.current).toMatchObject({ role: 'writer', status: 'working', videoId: 7 });
    const previousRevision = status.activity.revision;
    studio.db.log('writer', 'Draft ready', 7, 'info', 'finished');
    studio.db.log('qa', 'Checking quality', 7, 'info', 'started');
    status = await (await request('/api/status')).json();
    expect(status.activity.current).toMatchObject({ role: 'critic', agent: 'qa', status: 'working' });
    expect(status.activity.revision).toBeGreaterThan(previousRevision);
    await request('/api/stop', 'POST');
    status = await (await request('/api/status')).json();
    expect(status.activity.current).toBeNull();
    expect(status.activity.jobId).toBeNull();
  });
  it('initializes a fresh database and returns the expected status shape', async () => {
    const response = await request('/api/status');
    const status: StudioStatus = await response.json();
    expect(response.status).toBe(200);
    expect(status).toMatchObject({ videos: [], ideas: [], eventsCount: 1, activeJob: null,
      activity: { jobId: null, current: null } });
    expect((await request('/api/events?limit=0')).status).toBe(400);
    expect((await request('/api/videos/not-a-number')).status).toBe(400);
    expect((await request('/api/unknown')).status).toBe(404);
  });
  it('runs a job to completion independently of its creation request', async () => {
    const response = await request('/api/jobs', 'POST', { command: 'plan' });
    expect(response.status).toBe(202);
    const { id } = await response.json();
    const job = await waitForJob(id);
    expect(job.status).toBe('succeeded');
    expect(job.output).toContain('fixture plan');
    expect(studio.jobs.active).toBeNull();
  });
  it('reports real scheduler availability and eligible publication slots independently of video list limits', async () => {
    studio.db.run(`INSERT INTO articles
      (id, mach_slug, mach_index, mach_title, number, title, path, content_hash)
      VALUES ('schedule', 'm', 1, 'm', 1, 'a', 'a', 'h')`);
    for (const [id, status, slot] of [
      [1, 'qa_passed', '2000-01-01T00:00:00Z'],
      [2, 'queued', '2099-01-01T00:00:00Z'],
      [3, 'published', '1999-01-01T00:00:00Z'],
      [4, 'planned', '1998-01-01T00:00:00Z'],
      [5, 'failed', '1997-01-01T00:00:00Z'],
    ]) {
      const idea = studio.db.run(`INSERT INTO ideas(article_id, angle, insight, primary_format, created_at)
        VALUES ('schedule', 'a', 'i', 'goi-ten', 'now')`);
      studio.db.run(`INSERT INTO videos(id, idea_id, article_id, format, slot_at, episode, status, created_at, updated_at)
        VALUES (?, ?, 'schedule', 'goi-ten', ?, 1, ?, 'now', 'now')`, id, idea, slot, status);
    }
    let status: StudioStatus = await (await request('/api/status')).json();
    expect(status.schedule).toMatchObject({ enabled: false, paused: false, nextCheckAt: null,
      nextPublication: { id: 1, slotAt: '2000-01-01T00:00:00Z' }, dueCount: 1, pendingProduction: 1,
      activeCommand: null, lastError: null });
    expect(Number.isFinite(Date.parse(status.schedule.serverTime))).toBe(true);
    await request('/api/jobs', 'POST', { command: 'produce' });
    status = await (await request('/api/status')).json();
    expect(status.schedule.activeCommand).toBe('produce');
    await request('/api/stop', 'POST');
    status = await (await request('/api/status')).json();
    expect(status.schedule.paused).toBe(true);
    expect(status.schedule.activeCommand).toBeNull();
  });
  it('reports a next check within sixty seconds when the scheduler is enabled', async () => {
    const scheduled = createStudioApp({
      root, dataDir: path.join(root, 'scheduled-data'), access: { host: '127.0.0.1' }, scheduler: true,
    });
    const scheduledServer = http.createServer(scheduled.app);
    await new Promise<void>((resolve) => scheduledServer.listen(0, '127.0.0.1', resolve));
    try {
      const address = scheduledServer.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP address.');
      const status: StudioStatus = await (await fetch(`http://127.0.0.1:${address.port}/api/status`)).json();
      expect(status.schedule.enabled).toBe(true);
      const remaining = Date.parse(status.schedule.nextCheckAt!) - Date.parse(status.schedule.serverTime);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(60000);
    } finally {
      await scheduled.close();
      scheduledServer.closeAllConnections();
      await new Promise<void>((resolve) => scheduledServer.close(() => resolve()));
    }
  });
  it('reports command failures instead of returning success', async () => {
    const { id } = await (await request('/api/jobs', 'POST', { command: 'ingest' })).json();
    const job = await waitForJob(id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('code 2');
    expect((await request('/api/jobs', 'POST', { command: 'sh' })).status).toBe(400);
  });
  it('prevents overlapping jobs and stops only the managed task', async () => {
    const { id } = await (await request('/api/jobs', 'POST', { command: 'produce' })).json();
    expect((await request('/api/jobs', 'POST', { command: 'plan' })).status).toBe(409);
    expect((await request('/api/stop', 'POST', {})).status).toBe(200);
    expect((await waitForJob(id)).status).toBe('stopped');
    expect(studio.db.getKv('paused')).toBe(true);
  });
  it.skipIf(process.platform === 'win32')('stops render subprocesses along with their CLI parent', async () => {
    await request('/api/jobs', 'POST', { command: 'produce' });
    const filename = path.join(root, 'descendant.pid');
    for (let i = 0; i < 100 && !fs.existsSync(filename); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(fs.existsSync(filename)).toBe(true);
    const pid = Number(fs.readFileSync(filename, 'utf8'));
    await request('/api/stop', 'POST', {});
    let alive = true;
    for (let i = 0; i < 100 && alive; i++) {
      try { process.kill(pid, 0); } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ESRCH') alive = false;
        else throw error;
      }
      if (alive) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(alive).toBe(false);
  });
  it('marks unfinished jobs as interrupted on restart without rerunning them', () => {
    const job: Job = {
      id: 'interrupted-test', command: 'publish', args: [], status: 'running',
      startedAt: new Date().toISOString(), output: 'Previous output',
    };
    studio.db.run('INSERT INTO web_jobs(id, payload) VALUES (?, ?)', job.id, JSON.stringify(job));
    const restored = new JobRunner(studio.db, root, () => {});
    expect(restored.get(job.id)).toMatchObject({ status: 'interrupted', output: 'Previous output' });
    expect(restored.active).toBeNull();
  });
  it('writes settings with restricted permissions and refuses runtime options', async () => {
    expect(await (await request('/api/settings')).json()).toEqual({ exists: false, content: '' });
    expect((await request('/api/settings', 'PUT', { content: 'OPENAI_API_KEY=test-value\n' })).status).toBe(200);
    expect((await (await request('/api/settings')).json()).content).toBe('OPENAI_API_KEY=test-value\n');
    expect(fs.statSync(path.join(root, '.env')).mode & 0o777).toBe(0o600);
    expect((await request('/api/settings', 'PUT', { content: 'NODE_OPTIONS=--require=bad\n' })).status).toBe(400);
  });
  it('reuses core skill metadata and persists agent profiles', async () => {
    const skills = await (await request('/api/skills')).json();
    expect(skills.availableSkills.some((skill: { id: string }) => skill.id === 'hook-writing')).toBe(true);
    const profile = { ...skills.savedProfiles.writer, temperature: 0.6 };
    expect((await request('/api/skills', 'PUT', { writer: profile })).status).toBe(200);
    expect((await (await request('/api/skills')).json()).savedProfiles.writer.temperature).toBe(0.6);
    expect((await request('/api/skills', 'PUT', { writer: { ...profile, equippedSkills: ['../secret'] } })).status).toBe(400);
  });
  it('saves all five roles, skills and instructions independently without touching automation', async () => {
    const payload = await (await request('/api/skills')).json();
    const profiles = Object.fromEntries(Object.entries(payload.savedProfiles).map(([role, raw]) => {
      const profile = raw as Record<string, unknown>;
      return [role, { ...profile, responsibility: `Trách nhiệm riêng ${role}`,
        systemPromptExtra: `Chỉ dẫn riêng ${role}`, equippedSkills: ['content-curation'] }];
    }));
    studio.db.setKv('automation', { ...autoDefaults, enabled: false, dailyLimit: 7 });
    expect((await request('/api/skills', 'PUT', profiles)).status).toBe(200);
    const saved = await (await request('/api/skills')).json();
    expect(saved.savedProfiles).toEqual(profiles);
    expect(studio.db.getKv('agent_skills')).toEqual(profiles);
    expect((await (await request('/api/status')).json()).activeJob).toBeNull();
    expect(studio.db.getKv('automation')).toEqual({ ...autoDefaults, enabled: false, dailyLimit: 7 });
    expect((await request('/api/skills', 'PUT', { planner: { ...profiles.planner, responsibility: '' } })).status).toBe(400);
    expect((await request('/api/skills', 'PUT', { producer: { ...profiles.producer, model: ' ' } })).status).toBe(400);
  });
  it('persists Gemini, GPT and Claude choices and rejects unsupported model IDs', async () => {
    const { savedProfiles } = await (await request('/api/skills')).json();
    const profiles = {
      planner: { ...savedProfiles.planner, model: 'gemini-2.5-flash' },
      writer: { ...savedProfiles.writer, model: 'claude-3-7-sonnet' },
      critic: { ...savedProfiles.critic, model: 'gpt-4o-mini' },
    };
    expect((await request('/api/skills', 'PUT', profiles)).status).toBe(200);
    const saved = await (await request('/api/skills')).json();
    for (const [role, profile] of Object.entries(profiles)) {
      expect(saved.savedProfiles[role].model).toBe(profile.model);
    }
    for (const model of ['remotion-engine', 'gemini-', 'unsupported-model']) {
      expect((await request('/api/skills', 'PUT', { planner: { ...profiles.planner, model } })).status).toBe(400);
    }
    expect(studio.db.getKv('agent_skills').planner.model).toBe('gemini-2.5-flash');
    const reopened = new DB(path.join(root, 'data', 'app.db'));
    try {
      const persisted = reopened.getKv('agent_skills');
      for (const [role, profile] of Object.entries(profiles)) expect(persisted[role].model).toBe(profile.model);
    } finally { reopened.close(); }
    expect(studio.jobs.active).toBeNull();
  });
  it('streams log/event updates over SSE and cleans up disconnected clients', async () => {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/stream`, { signal: controller.signal });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('event: events');
    studio.db.run("INSERT INTO events(ts, agent, level, message) VALUES (?, ?, ?, ?)",
      new Date().toISOString(), 'writer', 'info', 'stream fixture');
    let received = '';
    for (let i = 0; i < 10 && !received.includes('stream fixture'); i++) {
      received += new TextDecoder().decode((await reader.read()).value);
    }
    expect(received).toContain('stream fixture');
    controller.abort();
    await reader.cancel().catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
    });
  });
  it('serves MP4 byte ranges but refuses files outside the media directory', async () => {
    const dir = path.join(root, 'data/media/00001');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'video.mp4'), '0123456789');
    studio.db.run(`INSERT INTO articles
      (id, mach_slug, mach_index, mach_title, number, title, path, content_hash)
      VALUES ('article', 'm', 1, 'm', 1, 'a', 'a', 'h')`);
    const idea = studio.db.run("INSERT INTO ideas(article_id, angle, insight, primary_format, created_at) VALUES ('article', 'a', 'i', 'goi-ten', 'now')");
    studio.db.run(`INSERT INTO videos(id, idea_id, article_id, format, slot_at, episode, status, media, created_at, updated_at)
      VALUES (1, ?, 'article', 'goi-ten', 'now', 1, 'rendered', ?, 'now', 'now')`, idea, '{"video":"video.mp4"}');
    const response = await fetch(`${base}/api/videos/1/media`, { headers: { Range: 'bytes=2-5' } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('2345');
    const outside = path.join(root, 'outside.mp4');
    fs.writeFileSync(outside, 'private');
    studio.db.run('UPDATE videos SET media = ? WHERE id = 1', JSON.stringify({ video_path: outside }));
    expect((await request('/api/videos/1/media')).status).toBe(403);
  });
  it('resets rows without unlinking the live database and preserves media when requested', async () => {
    const media = path.join(root, 'data/media');
    fs.mkdirSync(media, { recursive: true });
    fs.writeFileSync(path.join(media, 'keep.mp4'), 'test');
    studio.db.setKv('test', 'value');
    expect((await request('/api/reset', 'POST', { keepMedia: true })).status).toBe(200);
    expect(studio.db.getKv('test')).toBeNull();
    expect(fs.existsSync(path.join(media, 'keep.mp4'))).toBe(true);
    expect((await request('/api/status')).status).toBe(200);
  });
  it('rejects cross-origin access and DNS-rebinding Host headers', async () => {
    expect((await fetch(`${base}/api/status`, { headers: { Origin: 'https://evil.invalid' } })).status).toBe(403);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      http.get(`${base}/api/status`, { headers: { Host: 'evil.invalid' } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on('error', reject);
    });
    expect(status).toBe(403);
  });
  it('requires HTTPS and credentials for non-local binding', () => {
    expect(() => accessControl({ host: '0.0.0.0' })).toThrow('Remote access requires');
    expect(() => accessControl({
      host: '0.0.0.0', publicOrigin: 'http://example.invalid', username: 'admin', password: '1234567890123456',
    })).toThrow('HTTPS');
  });
  it('protects all routes with HTTP Basic authentication when configured', async () => {
    const protectedStudio = createStudioApp({
      root, dataDir: path.join(root, 'protected'),
      access: { host: '127.0.0.1', username: 'test', password: 'test-password' }, scheduler: false,
    });
    const protectedServer = http.createServer(protectedStudio.app);
    try {
      await new Promise<void>((resolve) => protectedServer.listen(0, '127.0.0.1', resolve));
      const address = protectedServer.address();
      if (!address || typeof address === 'string') throw new Error('Expected address.');
      const url = `http://127.0.0.1:${address.port}/api/settings`;
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { headers: { Authorization: `Basic ${Buffer.from('test:test-password').toString('base64')}` } })).status).toBe(200);
    } finally {
      await protectedStudio.close();
      protectedServer.closeAllConnections();
      await new Promise<void>((resolve) => protectedServer.close(() => resolve()));
    }
  });
});
