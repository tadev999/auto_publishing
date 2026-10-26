import { Settings } from '../config.js';
import { Ctx } from '../context.js';
import { VideoStatus, utcnow } from '../db.js';
import { sameIdea, type IdeaIdentity } from '../ideaIdentity.js';
import { z } from 'zod';
import { agentTask } from '../agentTask.js';
import { getAgentProfile } from '../skills.js';
import { createHash } from 'node:crypto';

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
  local: Date,
  priority: number[] = [],
): { idea: any; remakeOf: number | null } | null {
  const db = ctx.db;
  const recent = recentArticles(ctx, local);

  const allAvailable = db.all<any>(
    `SELECT i.*, a.mach_index, a.number FROM ideas i JOIN articles a ON a.id = i.article_id
     WHERE i.status = 'available' AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.idea_id = i.id)
       AND EXISTS (SELECT 1 FROM json_each(i.formats) WHERE value = ?)`,
    fmt
  );

  const used = db.all<IdeaIdentity>(`SELECT DISTINCT i.article_id, i.angle, i.insight
    FROM ideas i JOIN videos v ON v.idea_id = i.id`);
  const rows = allAvailable.filter((r) => !recent.has(r.article_id) && !used.some((idea) => sameIdea(r, idea)));

  if (rows.length > 0) {
    const preferred = priority.map((id) => rows.find((row) => row.id === id)).find(Boolean);
    if (preferred) return { idea: preferred, remakeOf: null };
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

export function zonedSlot(day: string, hour: number, minute: number, timezone: string): Date {
  const target = Date.parse(`${day}T00:00:00Z`) + (hour * 60 + minute) * 60000;
  let value = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    value += target - local;
  }
  return new Date(value);
}

interface PlanOptions { horizonHours?: number; dailyLimit?: number; priority?: number[] }

export async function runWithProfile(ctx: Ctx, now?: Date, options: PlanOptions = {}): Promise<number> {
  const candidates = ctx.db.all<{ id: number; article_id: string; angle: string; insight: string }>(`SELECT id, article_id, angle, insight FROM ideas i
    WHERE status = 'available' AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.idea_id = i.id) ORDER BY id LIMIT 100`);
  if (!candidates.length) return run(ctx, now, options);
  const signatureFor = (ids: number[]) => createHash('sha256').update(JSON.stringify({
    ids, profile: getAgentProfile(ctx, 'planner'), day: getLocalDateStr(now || new Date(), ctx.settings.timezone),
    options, schedule: ctx.settings.schedule,
  })).digest('hex');
  const signature = signatureFor(candidates.map((idea) => idea.id));
  const cached = ctx.db.getKv<{ signature: string; priority: number[] } | null>('planner_priority', null);
  if (cached?.signature === signature) return run(ctx, now, { ...options, priority: cached.priority });
  const result = await agentTask(ctx, 'planner',
    'Ưu tiên các ý tưởng cho lịch sản xuất. Trả về danh sách ID theo mức ưu tiên, chỉ dùng ID được cung cấp, không lặp ID. Không tạo hoặc đổi lịch, quota hay format. Các ràng buộc lịch và chống trùng vẫn được kiểm tra bằng code.',
    JSON.stringify({ now: (now || new Date()).toISOString(), candidates, horizonHours: options.horizonHours ?? ctx.settings.schedule.queue_days * 24 }),
    z.object({ ideaIds: z.array(z.number().int().positive()).min(1).max(100) }));
  if (new Set(result.ideaIds).size !== result.ideaIds.length || result.ideaIds.some((id) => !candidates.some((idea) => idea.id === id))) {
    throw new Error('Trưởng Ban Nội Dung trả về ID ý tưởng không hợp lệ.');
  }
  ctx.event(AGENT, 'Đã áp dụng hồ sơ để ưu tiên đề tài.');
  const created = run(ctx, now, { ...options, priority: result.ideaIds });
  const remaining = ctx.db.all<{ id: number }>(`SELECT id FROM ideas i WHERE status = 'available'
    AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.idea_id = i.id) ORDER BY id LIMIT 100`);
  ctx.db.setKv('planner_priority', { signature: signatureFor(remaining.map((idea) => idea.id)), priority: result.ideaIds });
  return created;
}

export function run(ctx: Ctx, now?: Date, options: PlanOptions = {}): number {
  return ctx.db.tx(() => plan(ctx, now, options));
}

function plan(ctx: Ctx, now: Date | undefined, options: PlanOptions): number {
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
  const days = options.horizonHours ? Math.ceil(options.horizonHours / 24) + 1 : s.schedule.queue_days;
  for (let offset = 0; offset < days; offset++) {
    const dayStr = addDays(nowLocalDate, offset);
    const dayDate = new Date(dayStr + 'T00:00:00Z');
    const dayIndex = Math.floor((dayDate.getTime() - startDate.getTime()) / 86400000) + 1;
    const allowed = allowedFormats(s, dayIndex);

    for (const slot of s.schedule.slots) {
      if (!allowed.includes(slot.format)) {
        continue;
      }

      const [h, m] = slot.time.split(':').map(Number);
      const slotDate = zonedSlot(dayStr, h, m, tz);
      if (slotDate.getTime() <= currentNow.getTime()) {
        continue;
      }
      if (options.horizonHours && slotDate.getTime() > currentNow.getTime() + options.horizonHours * 3600000) continue;

      const slotAt = isoUtc(slotDate);
      const exists = ctx.db.one<any>(
        "SELECT 1 FROM videos WHERE slot_at = ? AND status != 'failed'",
        slotAt
      );
      if (exists) {
        continue;
      }

      if (options.dailyLimit !== undefined) {
        const count = ctx.db.all<{ slot_at: string }>('SELECT slot_at FROM videos WHERE julianday(slot_at) IS NOT NULL')
          .filter((video) => getLocalDateStr(new Date(video.slot_at), tz) === dayStr).length;
        if (count >= options.dailyLimit) continue;
      }
      const choice = pickIdea(ctx, slot.format, slotDate, options.priority);
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
