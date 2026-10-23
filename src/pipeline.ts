import fs from 'node:fs';
import path from 'node:path';
import * as critic from './agents/critic.js';
import * as qa from './agents/qa.js';
import * as render from './agents/render.js';
import * as upload from './agents/upload.js';
import * as voice from './agents/voice.js';
import * as writer from './agents/writer.js';
import { MissingSecret } from './config.js';
import { Ctx } from './context.js';
import { VideoStatus } from './db.js';
import { notify } from './integrations/telegram.js';
import { LLM } from './llm.js';

export type StageHandler = (ctx: Ctx, llm: LLM, video: any) => Promise<void>;

export interface Stage {
  name: string;
  status: VideoStatus;
  handler: StageHandler;
}

export const STAGES: Stage[] = [
  {
    name: 'writer',
    status: VideoStatus.PLANNED,
    handler: async (ctx, llm, v) => writer.runOne(ctx, llm, v),
  },
  {
    name: 'critic',
    status: VideoStatus.SCRIPTED,
    handler: async (ctx, llm, v) => critic.runOne(ctx, llm, v),
  },
  {
    name: 'voice',
    status: VideoStatus.APPROVED,
    handler: async (ctx, _llm, v) => voice.runOne(ctx, v),
  },
  {
    name: 'render',
    status: VideoStatus.VOICED,
    handler: async (ctx, _llm, v) => render.runOne(ctx, v),
  },
  {
    name: 'qa',
    status: VideoStatus.RENDERED,
    handler: async (ctx, llm, v) => qa.runOne(ctx, llm, v),
  },
  {
    name: 'upload',
    status: VideoStatus.QA_PASSED,
    handler: async (ctx, _llm, v) => upload.runOne(ctx, v),
  },
];

export const MAX_STAGE_ATTEMPTS = 3;

async function failStage(ctx: Ctx, videoId: number, agent: string, exc: any): Promise<void> {
  const video = ctx.db.video(videoId);
  const attempts = (video.attempts || 0) + 1;
  const msg = exc.message || String(exc);

  if (attempts < MAX_STAGE_ATTEMPTS) {
    ctx.db.updateVideo(videoId, {
      attempts,
      error: `${agent}: ${msg}`,
    });
    ctx.event(agent, `Lỗi (lần ${attempts}/${MAX_STAGE_ATTEMPTS}), sẽ thử lại: ${msg}`, {
      videoId,
      level: 'error',
    });
    return;
  }

  ctx.db.updateVideo(videoId, {
    status: VideoStatus.FAILED,
    attempts,
    error: `${agent}: ${msg}`,
  });
  ctx.db.run("UPDATE ideas SET status = 'available' WHERE id = ? AND status = 'used'", video.idea_id);
  ctx.event(agent, `THẤT BẠI sau ${attempts} lần: ${msg}`, {
    videoId,
    level: 'error',
  });
  await notify(ctx.settings, `❌ Video #${videoId} thất bại ở bước ${agent}: ${msg}`);
}

export async function produce(
  ctx: Ctx,
  llm: LLM,
  options: { limit?: number; videoIds?: number[] } = {}
): Promise<Record<string, number>> {
  const { limit, videoIds } = options;
  const activeStatuses = STAGES.map((s) => s.status);
  const marks = activeStatuses.map(() => '?').join(',');

  const allRows = ctx.db.all<any>(
    `SELECT id FROM videos WHERE status IN (${marks}) ORDER BY slot_at`,
    ...activeStatuses
  );

  let targets = allRows.map((r) => r.id as number);
  if (videoIds && videoIds.length > 0) {
    targets = targets.filter((id) => videoIds.includes(id));
  }
  if (limit !== undefined) {
    targets = targets.slice(0, limit);
  }

  const stats: Record<string, number> = {};
  for (const s of STAGES) {
    stats[s.name] = 0;
  }

  const errored = new Set<number>();
  let progressed = true;

  while (progressed) {
    progressed = false;

    for (const stage of STAGES) {
      for (const vid of targets) {
        if (errored.has(vid)) {
          continue;
        }

        const video = ctx.db.video(vid);
        if (!video || video.status !== stage.status) {
          continue;
        }

        try {
          await stage.handler(ctx, llm, video);
        } catch (exc: any) {
          if (exc instanceof MissingSecret) {
            throw exc;
          }
          errored.add(vid);
          await failStage(ctx, vid, stage.name, exc);
          continue;
        }

        const fresh = ctx.db.video(vid);
        if (fresh && fresh.status !== VideoStatus.FAILED) {
          ctx.db.updateVideo(vid, { attempts: 0, error: null });
        }

        stats[stage.name]++;
        progressed = true;
      }
    }
  }

  return stats;
}

export async function withLock<T>(
  ctx: Ctx,
  name: string,
  fn: () => Promise<T>
): Promise<{ acquired: boolean; result?: T }> {
  const lockDir = path.join(ctx.settings.dataDir, 'locks');
  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }

  const lockFile = path.join(lockDir, `${name}.lock`);
  let fd: number;

  try {
    fd = fs.openSync(lockFile, 'wx');
    fs.writeSync(fd, `${process.pid}\n`);
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      try {
        const content = fs.readFileSync(lockFile, 'utf-8').trim();
        const pid = parseInt(content, 10);
        if (pid && !isNaN(pid)) {
          // Check if process is still alive
          try {
            process.kill(pid, 0);
            return { acquired: false };
          } catch {
            // Process dead, remove stale lock
            fs.unlinkSync(lockFile);
            return withLock(ctx, name, fn);
          }
        }
      } catch {
        return { acquired: false };
      }
    }
    return { acquired: false };
  }

  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    try {
      fs.closeSync(fd);
      fs.unlinkSync(lockFile);
    } catch {}
  }
}
