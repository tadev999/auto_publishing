import express, { type ErrorRequestHandler, type Response } from 'express';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { z, ZodError } from 'zod';
import { DB } from '@endo/core/db';
import { getAllAgentProfiles, listAllSkills } from '@endo/core/skills';
import type { StudioEvent, VideoItem } from '../shared/types.js';
import type { LogMessage } from '../shared/api.js';
import { accessControl, type AccessOptions } from './access.js';
import { HttpError, JobRunner } from './jobs.js';
import { reduceActivity, type ActivitySnapshot } from '../shared/activity.js';
import { automationConfig, automationState, automationSchema, AUTOMATION_KEY, AUTOMATION_STATE_KEY } from '@endo/core/automation';
import type { Settings } from '@endo/core/config';
import { modelProvider } from '@endo/core/modelProvider';
import { listProviderModels } from './models.js';

const execFileAsync = promisify(execFile);
const positiveInteger = z.coerce.number().int().positive().max(999999);
const profileSchema = z.object({
  id: z.string().max(50), name: z.string().max(200), title: z.string().max(300),
  role: z.string().max(50), department: z.string().max(200),
  responsibility: z.string().trim().min(1).max(4000),
  avatarIcon: z.string().max(30), color: z.string().max(30),
  model: z.string().trim().min(1).max(100).refine((model) => modelProvider(model) !== null,
    'Model ID phải bắt đầu bằng gemini-, gpt- hoặc claude-.'),
  temperature: z.number().min(0).max(2),
  tone: z.enum(['philosophy', 'viral', 'satire', 'practical', 'strict']),
  systemPromptExtra: z.string().max(20000).optional(),
  equippedSkills: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(100),
  stats: z.object({
    creativity: z.number().min(0).max(100), precision: z.number().min(0).max(100),
    empathy: z.number().min(0).max(100), velocity: z.number().min(0).max(100),
  }),
}).strict();

interface AppOptions {
  root: string;
  dataDir: string;
  access: AccessOptions;
  scheduler?: boolean;
  settings?: Settings;
}

export function createStudioApp(options: AppOptions) {
  const { root, dataDir } = options;
  const app = express();
  app.disable('x-powered-by');
  app.use(accessControl(options.access));
  app.use(express.json({ limit: '256kb' }));
  const db = new DB(path.join(dataDir, 'app.db'));
  getAllAgentProfiles({ db });
  const clients = new Set<Response>();
  let resetting = false;
  app.use('/api', (req, _res, next) => {
    if (resetting && req.method !== 'GET') next(new HttpError(409, 'Database reset is in progress.'));
    else next();
  });
  let lastId = db.one<{ id: number }>('SELECT MAX(id) AS id FROM events')?.id || 0;
  const broadcast = (event: string, data: unknown, id?: number) => {
    for (const client of clients) {
      if (client.destroyed || client.writableEnded || client.writableLength > 1024 * 1024) {
        client.end();
        clients.delete(client);
        continue;
      }
      client.write(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };
  const log = (message: LogMessage) => {
    console[message.level === 'error' ? 'error' : 'log'](message.text.trimEnd());
    broadcast('log', message);
  };
  const jobs = new JobRunner(db, root, log);
  const readAutomation = () => automationConfig({ db, settings: options.settings });
  const schedulerInterval = () => {
    const config = readAutomation();
    return (config.enabled ? config.checkIntervalSeconds : 60) * 1000;
  };
  let nextSchedulerCheck = Date.now() + schedulerInterval();
  let schedulerError: string | null = null;
  let activitySignature = '';
  const generation = Date.now();
  let activityRevision = 0;
  const activitySnapshot = (): ActivitySnapshot => {
    const job = jobs.active;
    const current = job ? reduceActivity(db.all<StudioEvent>(
      'SELECT * FROM events WHERE id > ? ORDER BY id', job.eventCursor || 0,
    )) : null;
    const signature = JSON.stringify([job?.id || null, current]);
    if (signature !== activitySignature) {
      activitySignature = signature;
      activityRevision++;
    }
    return { generation, revision: activityRevision, jobId: job?.id || null, current };
  };
  let broadcastRevision = 0;
  const envPath = path.join(root, '.env');
  const readEnv = () => ({
    ...dotenv.parse(fs.existsSync(envPath) ? fs.readFileSync(envPath) : ''),
    ...process.env,
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/status', (_req, res) => {
    res.json({
      videos: db.all('SELECT status, count(*) AS count FROM videos GROUP BY status'),
      ideas: db.all('SELECT status, count(*) AS count FROM ideas GROUP BY status'),
      eventsCount: db.one<{ count: number }>('SELECT count(*) AS count FROM events')?.count || 0,
      activeJob: jobs.active,
      activity: activitySnapshot(),
      schedule: {
        enabled: options.scheduler !== false,
        paused: db.getKv('paused', false),
        serverTime: new Date().toISOString(),
        nextCheckAt: options.scheduler === false ? null : new Date(nextSchedulerCheck).toISOString(),
        nextPublication: (() => {
          const video = db.one<{ id: number; slot_at: string }>(`SELECT id, slot_at FROM videos
            WHERE status IN ('qa_passed', 'queued') AND julianday(slot_at) IS NOT NULL
            ORDER BY julianday(slot_at), id LIMIT 1`);
          return video ? { id: video.id, slotAt: video.slot_at } : null;
        })(),
        dueCount: db.one<{ n: number }>(`SELECT count(*) AS n FROM videos
          WHERE status IN ('qa_passed', 'queued') AND julianday(slot_at) <= julianday('now')`)!.n,
        pendingProduction: db.one<{ n: number }>(`SELECT count(*) AS n FROM videos
          WHERE status IN ('planned', 'scripted', 'approved', 'voiced', 'rendered')`)!.n,
        activeCommand: jobs.active?.command || null,
        lastError: schedulerError,
        automation: {
          ...readAutomation(), ...automationState({ db }),
          dryRun: options.settings?.publish.dry_run ?? null,
          timezone: options.settings?.timezone || null,
        },
      },
    });
  });
  app.get('/api/videos', (_req, res) => res.json(db.all('SELECT * FROM videos ORDER BY slot_at DESC LIMIT 40')));
  app.get('/api/videos/:id', (req, res) => {
    const id = positiveInteger.parse(req.params.id);
    const video = db.one<VideoItem>('SELECT * FROM videos WHERE id = ?', id);
    if (!video) throw new HttpError(404, 'Video not found.');
    res.json(video);
  });
  app.get('/api/videos/:id/media', async (req, res) => {
    const id = positiveInteger.parse(req.params.id);
    const video = db.one<VideoItem>('SELECT * FROM videos WHERE id = ?', id);
    if (!video) throw new HttpError(404, 'Video not found.');
    const media: Record<string, unknown> = JSON.parse(video.media || '{}');
    const value = media.video_path || media.video;
    if (typeof value !== 'string' || !value) throw new HttpError(404, 'Video has not been rendered.');
    const mediaRoot = path.join(dataDir, 'media');
    const candidate = path.isAbsolute(value) ? value
      : value.startsWith('data/') ? path.resolve(root, value)
      : path.join(mediaRoot, String(id).padStart(5, '0'), value);
    let canonicalRoot: string;
    let target: string;
    try {
      [canonicalRoot, target] = await Promise.all([
        fs.promises.realpath(mediaRoot), fs.promises.realpath(candidate),
      ]);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new HttpError(404, 'Rendered video file is missing.');
      }
      throw error;
    }
    if (!target.startsWith(`${canonicalRoot}${path.sep}`) || path.extname(target).toLowerCase() !== '.mp4') {
      throw new HttpError(403, 'Invalid media path.');
    }
    res.sendFile(target);
  });
  app.get('/api/events', (req, res) => {
    const limit = z.coerce.number().int().min(1).max(200).parse(req.query.limit ?? 40);
    res.json(db.all('SELECT * FROM events ORDER BY id DESC LIMIT ?', limit));
  });
  app.get('/api/stream', (req, res) => {
    const cursor = req.headers['last-event-id'];
    const since = cursor ? z.coerce.number().int().nonnegative().parse(cursor) : Math.max(0, lastId - 15);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 2000\n\n');
    // The UI keeps a short history; replay the most recent 200 events on reconnect.
    const rows = db.all<StudioEvent>('SELECT * FROM events WHERE id > ? ORDER BY id DESC LIMIT 200', since).reverse();
    res.write(`id: ${lastId}\nevent: events\ndata: ${JSON.stringify(rows)}\n\n`);
    clients.add(res);
    res.write(`event: activity\ndata: ${JSON.stringify(activitySnapshot())}\n\n`);
    req.on('close', () => clients.delete(res));
  });
  app.post('/api/jobs', (req, res) => {
    if (req.body?.command === 'auto-cycle') throw new HttpError(400, 'Use the automation controls to start automatic operation.');
    res.status(202).json(jobs.start(req.body));
  });
  app.put('/api/automation', async (req, res) => {
    const { action, ...config } = automationSchema.extend({ action: z.enum(['apply', 'save']).default('apply') }).parse(req.body);
    const previous = readAutomation();
    if (action === 'save' && config.enabled !== previous.enabled) throw new HttpError(409, 'Lưu cấu hình không thay đổi trạng thái bật/tắt. Vui lòng tải lại trạng thái.');
    if (action === 'apply' && config.enabled && options.scheduler === false) throw new HttpError(409, 'Scheduler đang tắt trên server.');
    if ((action === 'save' || config.enabled) && jobs.active) throw new HttpError(409, 'Chờ tác vụ hiện tại kết thúc trước khi lưu hoặc bật tự động.');
    if (action === 'apply' && config.enabled && db.one("SELECT id FROM publications WHERE status IN ('publishing', 'review_required') LIMIT 1")) {
      throw new HttpError(409, 'Có lần phát hành chưa xác định kết quả. Cần đối soát trên nền tảng trước khi bật lại để tránh đăng trùng.');
    }
    db.setKv(AUTOMATION_KEY, config);
    if (action === 'save') {
      scheduleNextCheck();
      res.json(true);
      return;
    }
    if (!config.enabled) db.setKv('paused', true);
    if (!config.enabled && jobs.active?.command === 'auto-cycle') await jobs.stop();
    if (config.enabled) {
      db.setKv('paused', false);
      db.setKv(AUTOMATION_STATE_KEY, { ...automationState({ db }), blocked: false, lastError: null,
        message: 'Đã bật. Đang khởi động chu kỳ tự vận hành.' });
      try { jobs.start({ command: 'auto-cycle' }, false); }
      catch (error) {
        db.setKv(AUTOMATION_KEY, { ...config, enabled: false });
        throw error;
      }
    }
    scheduleNextCheck();
    res.json(true);
  });
  app.get('/api/jobs/:id', (req, res) => res.json(jobs.get(req.params.id)));
  app.post('/api/stop', async (_req, res) => {
    await jobs.stop();
    scheduleNextCheck();
    log({ level: 'warning', text: 'All web-managed agents stopped. Automatic publishing is paused.' });
    res.json({ success: true });
  });
  app.post('/api/reset', async (req, res) => {
    const { keepMedia } = z.object({ keepMedia: z.boolean().default(false) }).strict().parse(req.body);
    resetting = true;
    try {
      await jobs.stop();
      if (!keepMedia) {
        const mediaDir = path.join(dataDir, 'media');
        const stat = await fs.promises.lstat(mediaDir).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        if (stat?.isSymbolicLink()) throw new HttpError(400, 'Refusing to reset a symbolic-link media directory.');
        if (stat) await fs.promises.rm(mediaDir, { recursive: true });
      }
      db.tx(() => {
        for (const table of ['metrics', 'publications', 'videos', 'ideas', 'articles', 'events', 'kv']) {
          db.run(`DELETE FROM ${table}`);
        }
        db.run("DELETE FROM sqlite_sequence WHERE name IN ('ideas', 'videos', 'publications', 'metrics', 'events')");
        db.setKv('paused', true);
      });
      scheduleNextCheck();
      lastId = 0;
      broadcast('reset', {});
      res.json({ success: true, output: 'Database reset. Automatic publishing remains paused.' });
    } finally {
      resetting = false;
    }
  });
  app.get('/api/doctor', async (_req, res) => {
    const { stdout, stderr } = await execFileAsync(process.execPath,
      [path.join(root, 'apps/cli/dist/cli.js'), 'doctor'],
      { cwd: root, env: { ...process.env, AUTO_PUBLISHING_ROOT: root, FORCE_COLOR: undefined, NO_COLOR: '1' }, timeout: 30000 });
    res.json({ output: stdout + stderr });
  });
  app.get('/api/settings', async (_req, res) => {
    try {
      res.json({ exists: true, content: await fs.promises.readFile(envPath, 'utf8') });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        res.json({ exists: false, content: '' });
      } else throw error;
    }
  });
  app.put('/api/settings', async (req, res) => {
    const { content } = z.object({ content: z.string().max(128000) }).strict().parse(req.body);
    const blocked = /^(NODE_|STUDIO_|PUBLIC_ORIGIN$|HOST$|PORT$|AUTO_PUBLISHING_ROOT$|LD_|DYLD_|PATH$|HOME$)/;
    if (Object.keys(dotenv.parse(content)).some((key) => blocked.test(key))) {
      throw new HttpError(400, 'Server/runtime options must be set outside the editable API-key file.');
    }
    const temporary = `${envPath}.web-tmp`;
    await fs.promises.writeFile(temporary, content, { mode: 0o600 });
    await fs.promises.rename(temporary, envPath);
    res.json(true);
  });
  app.get('/api/tokens', (_req, res) => {
    const env = readEnv();
    const check = (...names: string[]) => {
      const configured = names.every((key) => Boolean(env[key]) && !/your_|placeholder/.test(env[key] || ''));
      return { configured, status: configured ? 'ok' : 'missing', preview: configured ? 'Configured' : 'Chưa cấu hình' };
    };
    res.json({
      gemini: check('GEMINI_API_KEY'), openai: check('OPENAI_API_KEY'), anthropic: check('ANTHROPIC_API_KEY'),
      elevenlabs: check('ELEVENLABS_API_KEY'), pixabay: check('PIXABAY_API_KEY'), pexels: check('PEXELS_API_KEY'),
      tiktok: check('TIKTOK_ACCESS_TOKEN'), instagram: check('IG_ACCESS_TOKEN'),
      youtube: check('YOUTUBE_CLIENT_ID', 'YOUTUBE_REFRESH_TOKEN'),
      r2_storage: check('R2_ACCESS_KEY_ID'), telegram: check('TELEGRAM_BOT_TOKEN'),
    });
  });
  app.get('/api/models/:provider', async (req, res) => {
    const provider = z.enum(['gemini', 'openai', 'anthropic']).parse(req.params.provider);
    res.json({ models: await listProviderModels(provider, readEnv()) });
  });
  app.get('/api/skills', (_req, res) => res.json({
    availableSkills: listAllSkills(),
    savedProfiles: getAllAgentProfiles({ db }),
  }));
  app.put('/api/skills', (req, res) => {
    const profiles = z.record(z.enum(['planner', 'writer', 'critic', 'producer', 'publisher']), profileSchema).parse(req.body);
    const available = new Set(listAllSkills().map((skill) => skill.id));
    for (const [role, profile] of Object.entries(profiles)) {
      if (profile.id !== role || profile.role !== role || profile.equippedSkills.some((skill) => !available.has(skill))) {
        throw new HttpError(400, 'Invalid role or skill.');
      }
    }
    db.setKv('agent_skills', { ...db.getKv('agent_skills', {}), ...profiles });
    res.json(true);
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API endpoint not found.')));

  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    console.error('[Web API]', error);
    if (res.headersSent) { res.end(); return; }
    const status = error instanceof HttpError ? error.status
      : error instanceof ZodError || error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : 'Internal server error.' });
  };
  app.use(onError);
  const poller = setInterval(() => {
    try {
      const rows = db.all<StudioEvent>('SELECT * FROM events WHERE id > ? ORDER BY id LIMIT 200', lastId);
      if (rows.length) {
        lastId = rows[rows.length - 1].id!;
        broadcast('events', rows, lastId);
      }
      const snapshot = activitySnapshot();
      if (snapshot.revision !== broadcastRevision) {
        broadcastRevision = snapshot.revision;
        broadcast('activity', snapshot);
      }
    } catch (error) { console.error('[Event stream]', error); }
  }, 500);
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(': heartbeat\n\n');
  }, 15000);
  let scheduler: ReturnType<typeof setTimeout> | null = null;
  function scheduleNextCheck() {
    if (scheduler) clearTimeout(scheduler);
    if (options.scheduler === false) return;
    const interval = schedulerInterval();
    nextSchedulerCheck = Date.now() + interval;
    scheduler = setTimeout(checkSchedule, interval);
  }
  function checkSchedule() {
    try {
      if (resetting || jobs.active || db.getKv('paused', false)) return;
      const automatic = readAutomation();
      if (automatic.enabled) {
        if (!automationState({ db }).blocked) jobs.start({ command: 'auto-cycle' }, false);
        schedulerError = null;
        return;
      }
      const due = db.one(`SELECT id FROM videos
        WHERE status IN ('qa_passed', 'queued')
        AND julianday(slot_at) <= julianday('now') LIMIT 1`);
      if (due) jobs.start({ command: 'publish', args: [] }, false);
      schedulerError = null;
    } catch (error) {
      schedulerError = error instanceof Error ? error.message : String(error);
      log({ level: 'error', text: `Scheduler: ${schedulerError}` });
    } finally {
      scheduleNextCheck();
    }
  }
  scheduleNextCheck();

  return {
    app, db, jobs,
    async close() {
      clearInterval(poller);
      clearInterval(heartbeat);
      if (scheduler) clearTimeout(scheduler);
      for (const client of clients) client.end();
      clients.clear();
      await jobs.stop(false);
      db.close();
    },
  };
}
