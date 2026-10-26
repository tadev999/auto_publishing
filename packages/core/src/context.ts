import { getSettings, Settings } from './config.js';
import { DB } from './db.js';

export interface EventOptions {
  videoId?: number | null;
  level?: string;
}

export interface Ctx {
  settings: Settings;
  db: DB;
  event: (
    agent: string,
    message: string,
    videoIdOrOpts?: number | null | EventOptions,
    level?: string
  ) => void;
}

export function makeCtx(customSettings?: Settings): Ctx {
  const settings = customSettings || getSettings();
  const db = new DB(settings.dbPath);

  const event = (
    agent: string,
    message: string,
    videoIdOrOpts?: number | null | EventOptions,
    level = 'info'
  ) => {
    let vid: number | null = null;
    let lvl = level;

    if (typeof videoIdOrOpts === 'number' || videoIdOrOpts === null) {
      vid = videoIdOrOpts ?? null;
    } else if (typeof videoIdOrOpts === 'object' && videoIdOrOpts !== undefined) {
      vid = videoIdOrOpts.videoId ?? null;
      lvl = videoIdOrOpts.level ?? level;
    }

    db.log(agent, message, vid, lvl);
  };

  return { settings, db, event };
}
