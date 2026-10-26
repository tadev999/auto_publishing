import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DB } from '@endo/core/db';
import { z } from 'zod';
import type { Job, LogMessage } from '../shared/api.js';
import { blockAutomation, automationState, AUTOMATION_KEY } from '@endo/core/automation';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const inputSchema = z.object({
  command: z.enum(['ingest', 'plan', 'produce', 'publish', 'demo', 'auto-cycle']),
  args: z.array(z.string().max(200)).max(8).default([]),
}).strict();

export function validateCommand(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, 'Invalid command or arguments.');
  const { command, args } = parsed.data;
  const allowed: Record<typeof command, Record<string, 'number' | 'flag'>> = {
    ingest: { '--limit': 'number', '--force': 'flag' },
    plan: {},
    produce: { '--limit': 'number' },
    publish: { '--video-id': 'number' },
    demo: {},
    'auto-cycle': {},
  };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const kind = Object.hasOwn(allowed[command], flag) ? allowed[command][flag] : undefined;
    if (!kind || seen.has(flag)) throw new HttpError(400, `Unsupported argument: ${flag}`);
    seen.add(flag);
    if (kind === 'number' && !/^[1-9]\d{0,5}$/.test(args[++i] || '')) {
      throw new HttpError(400, `${flag} requires a positive integer (maximum 999999).`);
    }
  }
  return parsed.data;
}

export class JobRunner {
  private child: ChildProcess | null = null;
  private completion: Promise<void> | null = null;
  private current: Job | null = null;
  private stopping = false;

  constructor(
    private db: DB,
    private root: string,
    private log: (message: LogMessage) => void,
  ) {
    this.db.conn.exec(`CREATE TABLE IF NOT EXISTS web_jobs (
      id TEXT PRIMARY KEY, payload TEXT NOT NULL
    )`);
    for (const row of this.db.all<{ payload: string }>('SELECT payload FROM web_jobs')) {
      const job: Job = JSON.parse(row.payload);
      if (job.status === 'running') {
        job.status = 'interrupted';
        job.error = 'Server restarted before this job finished. Check its output before retrying.';
        job.finishedAt = new Date().toISOString();
        this.save(job);
        if (job.command === 'auto-cycle') blockAutomation({ db: this.db },
          'Server đã dừng giữa chu kỳ tự động. Kiểm tra video/publications trước khi bật lại.');
      }
    }
  }

  get active() { return this.current; }

  get(id: string): Job {
    const row = this.db.one<{ payload: string }>('SELECT payload FROM web_jobs WHERE id = ?', id);
    if (!row) throw new HttpError(404, 'Job not found.');
    return JSON.parse(row.payload);
  }

  private save(job: Job) {
    this.db.run('INSERT INTO web_jobs(id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload',
      job.id, JSON.stringify(job));
  }

  start(input: unknown, resume = true): Job {
    const { command, args } = validateCommand(input);
    if (this.current || this.stopping) throw new HttpError(409, 'Another job is running. Wait or stop it first.');
    if (resume) this.db.setKv('paused', false);
    const job: Job = {
      id: randomUUID(), command, args, status: 'running',
      startedAt: new Date().toISOString(), output: '',
      eventCursor: this.db.one<{ id: number }>('SELECT MAX(id) AS id FROM events')?.id || 0,
    };
    const commandAgent = { ingest: 'ingest', plan: 'planner', produce: null, publish: 'publisher', demo: null, 'auto-cycle': null }[command];
    if (commandAgent) this.db.log(commandAgent, `Bắt đầu ${command}`, null, 'info', 'started');
    this.current = job;
    this.save(job);
    const child = spawn(process.execPath, [path.join(this.root, 'apps/cli/dist/cli.js'), command, ...args], {
      cwd: this.root,
      env: { ...process.env, AUTO_PUBLISHING_ROOT: this.root, FORCE_COLOR: undefined, NO_COLOR: '1' },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this.completion = new Promise<void>((resolve) => {
      const append = (data: Buffer, level: string) => {
        const text = data.toString();
        job.output = (job.output + text).slice(-64000);
        this.save(job);
        this.log({ level, text });
      };
      child.stdout?.on('data', (data: Buffer) => append(data, 'info'));
      child.stderr?.on('data', (data: Buffer) => append(data, 'error'));
      child.on('error', (error) => {
        job.error = error.message;
        this.log({ level: 'error', text: error.message });
      });
      child.on('close', (code, signal) => {
        job.status = this.stopping ? 'stopped' : code === 0 ? 'succeeded' : 'failed';
        job.finishedAt = new Date().toISOString();
        if (job.status !== 'succeeded') {
          job.error ||= `Command ${command} ${signal ? `stopped (${signal})` : `exited with code ${code}`}.`;
        }
        this.save(job);
        if (command === 'auto-cycle' && job.status !== 'succeeded' && !automationState({ db: this.db }).blocked) {
          blockAutomation({ db: this.db }, job.error || 'Chu kỳ tự động thất bại.');
        }
        this.log({ level: job.status === 'succeeded' ? 'info' : 'error',
          text: `${command}: ${job.status}${job.error ? ` — ${job.error}` : ''}` });
        this.child = null;
        this.current = null;
        resolve();
      });
    });
    return job;
  }

  async stop(pause = true) {
    if (pause) {
      this.db.setKv('paused', true);
      this.db.setKv(AUTOMATION_KEY, { ...this.db.getKv(AUTOMATION_KEY, {}), enabled: false });
    }
    if (!this.child) return;
    this.stopping = true;
    const child = this.child;
    const signal = (name: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(name);
        else process.kill(-child.pid, name);
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
      }
    };
    try {
      signal('SIGTERM');
      const timer = setTimeout(() => signal('SIGKILL'), 1500);
      try { await this.completion; } finally { clearTimeout(timer); }
      // Descendants may outlive the CLI parent after SIGTERM.
      signal('SIGKILL');
    } finally {
      this.stopping = false;
    }
  }
}
