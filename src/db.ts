import fs from 'node:fs';
import Database from 'better-sqlite3';
import { VideoStatus } from './schemas.js';

export { VideoStatus };

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS articles (
    id            TEXT PRIMARY KEY,
    mach_slug     TEXT NOT NULL,
    mach_index    INTEGER NOT NULL,
    mach_title    TEXT NOT NULL,
    number        INTEGER NOT NULL,
    title         TEXT NOT NULL,
    path          TEXT NOT NULL,
    content_hash  TEXT NOT NULL,
    ingested_at   TEXT
);

CREATE TABLE IF NOT EXISTS ideas (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id     TEXT NOT NULL REFERENCES articles(id),
    angle          TEXT NOT NULL,
    insight        TEXT NOT NULL,
    quotes         TEXT NOT NULL DEFAULT '[]',
    metaphor       TEXT,
    practice       TEXT,
    question       TEXT,
    emotion        TEXT,
    hook_seed      TEXT,
    formats        TEXT NOT NULL DEFAULT '[]',
    primary_format TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'available',
    created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    idea_id        INTEGER NOT NULL REFERENCES ideas(id),
    article_id     TEXT NOT NULL REFERENCES articles(id),
    format         TEXT NOT NULL,
    slot_at        TEXT NOT NULL,
    episode        INTEGER NOT NULL,
    status         TEXT NOT NULL,
    attempts       INTEGER NOT NULL DEFAULT 0,
    critic_rounds  INTEGER NOT NULL DEFAULT 0,
    remake_of      INTEGER REFERENCES videos(id),
    hook_style     TEXT,
    script         TEXT,
    critic         TEXT,
    media          TEXT NOT NULL DEFAULT '{}',
    r2_key         TEXT,
    error          TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_videos_slot ON videos(slot_at) WHERE status != 'failed';
CREATE INDEX IF NOT EXISTS ix_videos_status ON videos(status);

CREATE TABLE IF NOT EXISTS publications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id      INTEGER NOT NULL REFERENCES videos(id),
    platform      TEXT NOT NULL,
    status        TEXT NOT NULL,
    external_id   TEXT,
    post_id       TEXT,
    permalink     TEXT,
    attempts      INTEGER NOT NULL DEFAULT 0,
    error         TEXT,
    published_at  TEXT,
    UNIQUE(video_id, platform)
);

CREATE TABLE IF NOT EXISTS metrics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    publication_id  INTEGER NOT NULL REFERENCES publications(id),
    checkpoint      TEXT NOT NULL,
    views           INTEGER,
    likes           INTEGER,
    comments        INTEGER,
    shares          INTEGER,
    saves           INTEGER,
    avg_watch_time  REAL,
    score           REAL,
    raw             TEXT,
    fetched_at      TEXT NOT NULL,
    UNIQUE(publication_id, checkpoint)
);

CREATE TABLE IF NOT EXISTS kv (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    video_id  INTEGER,
    agent     TEXT NOT NULL,
    level     TEXT NOT NULL,
    message   TEXT NOT NULL
);
`;

export function utcnow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

export function loads<T = any>(val: string | null | undefined, defaultValue: T = null as any): T {
  if (!val) return defaultValue;
  try {
    return JSON.parse(val);
  } catch {
    return defaultValue;
  }
}

export class DB {
  public conn: Database.Database;

  constructor(public readonly dbPath: string) {
    this.conn = new Database(dbPath, { timeout: 30000 });
    this.conn.pragma('journal_mode = WAL');
    this.conn.pragma('foreign_keys = ON');
    this.conn.exec(SCHEMA);

    try {
      fs.chmodSync(dbPath, 0o600);
    } catch {}
  }

  tx<T>(fn: () => T): T {
    return this.conn.transaction(fn)();
  }

  all<T = any>(sql: string, ...params: any[]): T[] {
    return this.conn.prepare(sql).all(...params) as T[];
  }

  one<T = any>(sql: string, ...params: any[]): T | null {
    const row = this.conn.prepare(sql).get(...params);
    return (row as T) || null;
  }

  run(sql: string, ...params: any[]): number {
    const info = this.conn.prepare(sql).run(...params);
    return Number(info.lastInsertRowid);
  }

  // --- Key / Value ---
  getKv<T = any>(key: string, defaultValue: T = null as any): T {
    const row = this.one<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    return row ? loads<T>(row.value, defaultValue) : defaultValue;
  }

  setKv(key: string, value: any): void {
    this.run(
      'INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      JSON.stringify(value)
    );
  }

  // --- Videos ---
  video(videoId: number): any {
    const row = this.one('SELECT * FROM videos WHERE id = ?', videoId);
    if (!row) {
      throw new Error(`Video #${videoId} not found`);
    }
    return row;
  }

  updateVideo(videoId: number, fields: Record<string, any>): void {
    const entries: [string, any][] = Object.entries(fields).map(([k, v]) => {
      if (v !== null && typeof v === 'object') {
        return [k, JSON.stringify(v)];
      }
      return [k, v];
    });

    entries.push(['updated_at', utcnow()]);
    const cols = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);

    this.run(`UPDATE videos SET ${cols} WHERE id = ?`, ...values, videoId);
  }

  log(agent: string, message: string, videoId: number | null = null, level = 'info'): void {
    this.run(
      'INSERT INTO events(ts, video_id, agent, level, message) VALUES(?, ?, ?, ?, ?)',
      utcnow(),
      videoId,
      agent,
      level,
      message
    );
  }
}
