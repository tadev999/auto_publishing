import { Settings } from '../config.js';
import { Ctx } from '../context.js';
import { VideoStatus, utcnow } from '../db.js';

export const AGENT = 'planner';

export function isoUtc(dt: Date): string {
  return dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function allowedFormats(settings: Settings, dayIndex: number): string[] {
  const sortedRamp = [...settings.schedule.ramp_up].sort((a, b) => a.until_day - b.until_day);
  for (const step of sortedRamp) {
    if (dayIndex <= step.until_day) {
      return step.formats;
    }
  }
  return settings.schedule.slots.map((s) => s.format);
}

function recentArticles(ctx: Ctx, local: Date): Set<string> {
  const gapMs = ctx.settings.schedule.same_article_gap_days * 24 * 3600 * 1000;
  const minDate = isoUtc(new Date(local.getTime() - gapMs));
  const maxDate = isoUtc(new Date(local.getTime() + gapMs));

  const rows = ctx.db.all<any>(
    "SELECT article_id FROM videos WHERE status != 'failed' AND slot_at > ? AND slot_at < ?",
    minDate,
    maxDate
  );
  return new Set(rows.map((r) => r.article_id));
}

// Simple seedable PRNG (Mulberry32)
function createRng(seedStr: string): () => number {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
  }
  let s = h >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickIdea(
  ctx: Ctx,
  fmt: string,
  local: Date
): { idea: any; remakeOf: number | null } | null {
  const db = ctx.db;
  const recent = recentArticles(ctx, local);

  const allAvailable = db.all<any>(
    `SELECT i.*, a.mach_index, a.number FROM ideas i JOIN articles a ON a.id = i.article_id
     WHERE i.status = 'available' AND EXISTS (SELECT 1 FROM json_each(i.formats) WHERE value = ?)`,
    fmt
  );

  const rows = allAvailable.filter((r) => !recent.has(r.article_id));

  if (rows.length > 0) {
    const minRow = db.one<any>(
      `SELECT MIN(a.mach_index) AS m FROM ideas i JOIN articles a ON a.id = i.article_id
       WHERE i.status = 'available'`
    );
    const currentMach = minRow?.m ?? 0;
    const rng = createRng(isoUtc(local));

    const inCurrent = rows.filter((r) => r.mach_index === currentMach);
    const earlier = rows.filter((r) => r.mach_index < currentMach);

    if (inCurrent.length > 0 && (earlier.length === 0 || rng() < ctx.settings.schedule.current_mach_ratio)) {
      inCurrent.sort((a, b) => {
        if (a.number !== b.number) return a.number - b.number;
        const aFmts: string[] = JSON.parse(a.formats);
        const bFmts: string[] = JSON.parse(b.formats);
        const aIdx = aFmts.indexOf(fmt);
        const bIdx = bFmts.indexOf(fmt);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a.id - b.id;
      });
      return { idea: inCurrent[0], remakeOf: null };
    }

    const pool = earlier.length > 0 ? earlier : inCurrent.length > 0 ? inCurrent : rows;
    const choice = pool[Math.floor(rng() * pool.length)];
    return { idea: choice, remakeOf: null };
  }

  return pickRemake(ctx, fmt, local, recent);
}

function pickRemake(
  ctx: Ctx,
  fmt: string,
  local: Date,
  recent: Set<string>
): { idea: any; remakeOf: number } | null {
  const cfg = ctx.settings;
  const cutoffMs = cfg.schedule.remake_after_days * 24 * 3600 * 1000;
  const cutoff = isoUtc(new Date(local.getTime() - cutoffMs));

  const cands = ctx.db.all<any>(
    `SELECT v.id, v.idea_id, v.article_id, AVG(m.score) AS score
     FROM videos v JOIN publications p ON p.video_id = v.id JOIN metrics m ON m.publication_id = p.id
     WHERE v.format = ? AND v.status IN ('published', 'measured') AND v.slot_at < ?
       AND v.remake_of IS NULL AND NOT EXISTS (SELECT 1 FROM videos r WHERE r.remake_of = v.id)
     GROUP BY v.id ORDER BY score DESC`,
    fmt,
    cutoff
  );

  const topCount = Math.max(1, Math.ceil(cands.length * cfg.analytics.remake_top_ratio));
  const top = cands.slice(0, topCount);

  for (const c of top) {
    if (!recent.has(c.article_id)) {
      const idea = ctx.db.one<any>('SELECT * FROM ideas WHERE id = ?', c.idea_id);
      return { idea, remakeOf: c.id };
    }
  }
  return null;
}

function getLocalDateStr(date: Date, tz = 'Asia/Ho_Chi_Minh'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDays(localDateStr: string, offset: number): string {
  const [y, m, d] = localDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offset));
  return dt.toISOString().slice(0, 10);
}

export function run(ctx: Ctx, now?: Date): number {
  const s = ctx.settings;
  const currentNow = now || new Date();
  const tz = s.timezone || 'Asia/Ho_Chi_Minh';
  const nowLocalDate = getLocalDateStr(currentNow, tz);

  let startRaw = ctx.db.getKv<string>('schedule_start');
  if (!startRaw) {
    startRaw = nowLocalDate;
    ctx.db.setKv('schedule_start', startRaw);
  }
  const startDate = new Date(startRaw + 'T00:00:00Z');

  let created = 0;
  for (let offset = 0; offset < s.schedule.queue_days; offset++) {
    const dayStr = addDays(nowLocalDate, offset);
    const dayDate = new Date(dayStr + 'T00:00:00Z');
    const dayIndex = Math.floor((dayDate.getTime() - startDate.getTime()) / 86400000) + 1;
    const allowed = allowedFormats(s, dayIndex);

    for (const slot of s.schedule.slots) {
      if (!allowed.includes(slot.format)) {
        continue;
      }

      // Slot local time: assume GMT+7 (or UTC offset configured in s.schedule.timezone)
      // Parse slot.time e.g. "07:30"
      const [h, m] = slot.time.split(':').map(Number);
      // Construct date in Asia/Ho_Chi_Minh (+07:00)
      const slotDate = new Date(`${dayStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`);
      if (slotDate.getTime() <= currentNow.getTime()) {
        continue;
      }

      const slotAt = isoUtc(slotDate);
      const exists = ctx.db.one<any>(
        "SELECT 1 FROM videos WHERE slot_at = ? AND status != 'failed'",
        slotAt
      );
      if (exists) {
        continue;
      }

      const choice = pickIdea(ctx, slot.format, slotDate);
      if (!choice) {
        ctx.event(
          AGENT,
          `Không còn ý tưởng phù hợp cho ${slot.format} lúc ${dayStr} ${slot.time}`,
          { level: 'warning' }
        );
        continue;
      }

      const { idea, remakeOf } = choice;
      const countRow = ctx.db.one<any>(
        "SELECT COUNT(*) AS n FROM videos WHERE format = ? AND status != 'failed'",
        slot.format
      );
      const episode = (countRow?.n ?? 0) + 1;

      let vid = 0;
      ctx.db.tx(() => {
        vid = ctx.db.run(
          `INSERT INTO videos(idea_id, article_id, format, slot_at, episode, status, remake_of,
                                created_at, updated_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          idea.id,
          idea.article_id,
          slot.format,
          slotAt,
          episode,
          VideoStatus.PLANNED,
          remakeOf,
          utcnow(),
          utcnow()
        );
        ctx.db.run("UPDATE ideas SET status = 'used' WHERE id = ?", idea.id);
      });

      const label = s.formats[slot.format]?.label || slot.format;
      const tag = remakeOf ? ` (làm lại #${remakeOf})` : '';
      ctx.event(
        AGENT,
        `${dayStr} ${slot.time} · ${label} #${episode} ← ${idea.article_id}: ${idea.angle}${tag}`,
        { videoId: vid }
      );
      created++;
    }
  }

  ctx.event(AGENT, `Đã lên lịch ${created} video mới`);
  return created;
}
