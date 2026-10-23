import { Ctx } from '../context.js';
import { VideoStatus, utcnow } from '../db.js';
import { Instagram } from '../integrations/instagram.js';
import { notify } from '../integrations/telegram.js';
import { TikTok } from '../integrations/tiktok.js';

export const AGENT = 'analytics';

export const CHECKPOINTS: Record<string, number> = {
  '24h': 24 * 3600 * 1000,
  '72h': 72 * 3600 * 1000,
};

export function depthScore(weights: Record<string, number>, m: Record<string, any>): number {
  const views = m.views || 0;
  if (views <= 0) return 0.0;
  let engaged = 0;
  for (const [k, w] of Object.entries(weights)) {
    engaged += w * (m[k] || 0);
  }
  return Number(((engaged / views) * 1000).toFixed(2));
}

async function fetchMetrics(ctx: Ctx, pub: any): Promise<any | null> {
  if (pub.platform === 'instagram') {
    return new Instagram(ctx.settings).insights(pub.post_id);
  }

  const tt = new TikTok(ctx.settings, ctx.db);
  let postId = pub.post_id;
  if (!postId && pub.external_id) {
    const statusData = await tt.status(pub.external_id);
    const ids = statusData.publicaly_available_post_id || [];
    if (ids.length > 0) {
      postId = String(ids[0]);
      ctx.db.run('UPDATE publications SET post_id = ? WHERE id = ?', postId, pub.id);
    }
  }
  if (!postId) return null;
  const metrics = await tt.videoMetrics([postId]);
  return metrics[postId] || null;
}

export async function collect(ctx: Ctx, now?: Date): Promise<number> {
  const currentNow = now || new Date();
  const pubs = ctx.db.all<any>(
    "SELECT * FROM publications WHERE status = 'published' AND published_at IS NOT NULL"
  );
  let stored = 0;

  for (const pub of pubs) {
    const publishedAt = new Date(pub.published_at);
    const ageMs = currentNow.getTime() - publishedAt.getTime();

    for (const [name, afterMs] of Object.entries(CHECKPOINTS)) {
      if (ageMs < afterMs) continue;
      const exists = ctx.db.one<any>(
        'SELECT 1 FROM metrics WHERE publication_id = ? AND checkpoint = ?',
        pub.id,
        name
      );
      if (exists) continue;

      let m: any = null;
      try {
        m = await fetchMetrics(ctx, pub);
      } catch (exc: any) {
        ctx.event(AGENT, `${pub.platform} lỗi lấy số liệu: ${exc.message}`, {
          videoId: pub.video_id,
          level: 'warning',
        });
        continue;
      }
      if (!m) continue;

      const score = depthScore(ctx.settings.analytics.score_weights, m);
      ctx.db.run(
        `INSERT INTO metrics(publication_id, checkpoint, views, likes, comments, shares, saves,
                               avg_watch_time, score, raw, fetched_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        pub.id,
        name,
        m.views,
        m.likes,
        m.comments,
        m.shares,
        m.saves,
        m.avg_watch_time,
        score,
        JSON.stringify(m.raw),
        utcnow()
      );

      ctx.event(
        AGENT,
        `${pub.platform} ${name}: ${m.views} views · điểm chiều sâu ${score}`,
        { videoId: pub.video_id }
      );
      stored++;
    }
  }

  ctx.db.run(
    `UPDATE videos SET status = ?, updated_at = ? WHERE status = ? AND NOT EXISTS (
       SELECT 1 FROM publications p WHERE p.video_id = videos.id AND p.status = 'published'
         AND NOT EXISTS (SELECT 1 FROM metrics m WHERE m.publication_id = p.id AND m.checkpoint = '72h'))
     AND EXISTS (SELECT 1 FROM publications p WHERE p.video_id = videos.id AND p.status = 'published')`,
    VideoStatus.MEASURED,
    utcnow(),
    VideoStatus.PUBLISHED
  );

  updateWeights(ctx);
  return stored;
}

export function updateWeights(ctx: Ctx): void {
  const rows = ctx.db.all<any>(
    `SELECT v.hook_style, v.format, AVG(m.score) AS score FROM metrics m
     JOIN publications p ON p.id = m.publication_id JOIN videos v ON v.id = p.video_id
     WHERE m.checkpoint = '72h' GROUP BY v.id`
  );

  if (rows.length < 10) return;

  const byStyle: Record<string, number[]> = {};
  const byFormat: Record<string, number[]> = {};

  for (const r of rows) {
    if (r.hook_style) {
      if (!byStyle[r.hook_style]) byStyle[r.hook_style] = [];
      byStyle[r.hook_style].push(r.score);
    }
    if (!byFormat[r.format]) byFormat[r.format] = [];
    byFormat[r.format].push(r.score);
  }

  const hookWeights: Record<string, number> = {};
  for (const [k, v] of Object.entries(byStyle)) {
    if (v.length >= 3) {
      const avg = v.reduce((a, b) => a + b, 0) / v.length;
      hookWeights[k] = Number(avg.toFixed(2));
    }
  }
  ctx.db.setKv('hook_style_weights', hookWeights);

  const formatScores: Record<string, number> = {};
  for (const [k, v] of Object.entries(byFormat)) {
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    formatScores[k] = Number(avg.toFixed(2));
  }
  ctx.db.setKv('format_scores', formatScores);
}

export async function weeklyReport(ctx: Ctx, send: boolean = true): Promise<string> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const db = ctx.db;

  const published = db.one<any>(
    "SELECT COUNT(*) AS n FROM publications WHERE status = 'published' AND published_at >= ?",
    since
  ).n;
  const failed = db.one<any>(
    "SELECT COUNT(*) AS n FROM videos WHERE status = 'failed' AND updated_at >= ?",
    since
  ).n;
  const queued = db.one<any>("SELECT COUNT(*) AS n FROM videos WHERE status = 'queued'").n;
  const remaining = db.one<any>("SELECT COUNT(*) AS n FROM ideas WHERE status = 'available'").n;

  const top = db.all<any>(
    `SELECT v.id, v.format, v.hook_style, a.id AS article, p.platform, p.permalink, m.views, m.saves, m.shares, m.score
     FROM metrics m JOIN publications p ON p.id = m.publication_id JOIN videos v ON v.id = p.video_id
     JOIN articles a ON a.id = v.article_id
     WHERE m.checkpoint = '72h' AND m.fetched_at >= ? ORDER BY m.score DESC LIMIT 3`,
    since
  );

  const lines = [
    '🌱 Báo cáo tuần — Endogenism',
    `Đã đăng: ${published} lượt · Lỗi/loại: ${failed} · Hàng đợi: ${queued} video · Kho ý tưởng còn: ${remaining}`,
  ];

  if (top.length > 0) {
    lines.push('\nChạm sâu nhất (điểm chiều sâu / 1.000 views):');
    for (const t of top) {
      lines.push(
        `• #${t.id} ${t.format} [${t.hook_style}] ${t.article} · ${t.platform} · ` +
        `${t.views} views · ${t.saves || 0} lưu · ${t.shares || 0} chia sẻ · ${t.score}` +
        (t.permalink ? `\n  ${t.permalink}` : '')
      );
    }
  }

  const weights = db.getKv<Record<string, number>>('hook_style_weights');
  if (weights) {
    const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
    lines.push('\nStyle hook hiệu quả: ' + sorted.map(([k, v]) => `${k} ${v}`).join(', '));
  }

  const text = lines.join('\n');
  if (send) {
    await notify(ctx.settings, text);
  }
  return text;
}
