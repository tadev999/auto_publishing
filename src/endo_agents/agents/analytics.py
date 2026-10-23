"""Analytics agent: collect 24h/72h metrics, score by depth (saves/shares), and feed weights back to the writer."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from ..context import Ctx
from ..db import VideoStatus, utcnow
from ..integrations.instagram import Instagram
from ..integrations.telegram import notify
from ..integrations.tiktok import TikTok

AGENT = "analytics"
CHECKPOINTS = {"24h": timedelta(hours=24), "72h": timedelta(hours=72)}


def depth_score(weights: dict[str, float], m: dict) -> float:
    """Weighted engagement per 1,000 views."""
    views = m.get("views") or 0
    if views <= 0:
        return 0.0
    engaged = sum(w * (m.get(k) or 0) for k, w in weights.items())
    return round(engaged / views * 1000, 2)


def _fetch(ctx: Ctx, pub) -> dict | None:
    if pub["platform"] == "instagram":
        return Instagram(ctx.settings).insights(pub["post_id"])
    tt = TikTok(ctx.settings, ctx.db)
    post_id = pub["post_id"]
    if not post_id and pub["external_id"]:
        ids = tt.status(pub["external_id"]).get("publicaly_available_post_id") or []
        if ids:
            post_id = str(ids[0])
            ctx.db.run("UPDATE publications SET post_id = ? WHERE id = ?", post_id, pub["id"])
    if not post_id:
        return None
    return tt.video_metrics([post_id]).get(post_id)


def collect(ctx: Ctx, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    pubs = ctx.db.all("SELECT * FROM publications WHERE status = 'published' AND published_at IS NOT NULL")
    stored = 0
    for pub in pubs:
        age = now - datetime.fromisoformat(pub["published_at"])
        for name, after in CHECKPOINTS.items():
            if age < after or ctx.db.one(
                "SELECT 1 FROM metrics WHERE publication_id = ? AND checkpoint = ?", pub["id"], name
            ):
                continue
            try:
                m = _fetch(ctx, pub)
            except Exception as exc:
                ctx.event(AGENT, f"{pub['platform']} lỗi lấy số liệu: {exc}", video_id=pub["video_id"], level="warning")
                continue
            if m is None:
                continue
            score = depth_score(ctx.settings.analytics.score_weights, m)
            ctx.db.run(
                """INSERT INTO metrics(publication_id, checkpoint, views, likes, comments, shares, saves,
                                       avg_watch_time, score, raw, fetched_at)
                   VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                pub["id"],
                name,
                m.get("views"),
                m.get("likes"),
                m.get("comments"),
                m.get("shares"),
                m.get("saves"),
                m.get("avg_watch_time"),
                score,
                json.dumps(m.get("raw"), ensure_ascii=False),
                utcnow(),
            )
            ctx.event(
                AGENT,
                f"{pub['platform']} {name}: {m.get('views')} views · điểm chiều sâu {score}",
                video_id=pub["video_id"],
            )
            stored += 1

    # A video is "measured" once every successful publication has its 72h checkpoint.
    ctx.db.run(
        """UPDATE videos SET status = ?, updated_at = ? WHERE status = ? AND NOT EXISTS (
               SELECT 1 FROM publications p WHERE p.video_id = videos.id AND p.status = 'published'
                 AND NOT EXISTS (SELECT 1 FROM metrics m WHERE m.publication_id = p.id AND m.checkpoint = '72h'))
             AND EXISTS (SELECT 1 FROM publications p WHERE p.video_id = videos.id AND p.status = 'published')""",
        VideoStatus.MEASURED.value,
        utcnow(),
        VideoStatus.PUBLISHED.value,
    )
    update_weights(ctx)
    return stored


def update_weights(ctx: Ctx) -> None:
    rows = ctx.db.all(
        """SELECT v.hook_style, v.format, AVG(m.score) AS score FROM metrics m
           JOIN publications p ON p.id = m.publication_id JOIN videos v ON v.id = p.video_id
           WHERE m.checkpoint = '72h' GROUP BY v.id"""
    )
    if len(rows) < 10:
        return  # too little data to learn from
    by_style: dict[str, list[float]] = defaultdict(list)
    by_format: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        if r["hook_style"]:
            by_style[r["hook_style"]].append(r["score"])
        by_format[r["format"]].append(r["score"])
    ctx.db.set_kv("hook_style_weights", {k: round(sum(v) / len(v), 2) for k, v in by_style.items() if len(v) >= 3})
    ctx.db.set_kv("format_scores", {k: round(sum(v) / len(v), 2) for k, v in by_format.items()})


def weekly_report(ctx: Ctx, send: bool = True) -> str:
    since = (datetime.now(UTC) - timedelta(days=7)).isoformat(timespec="seconds")
    db = ctx.db
    published = db.one(
        "SELECT COUNT(*) AS n FROM publications WHERE status = 'published' AND published_at >= ?", since
    )["n"]
    failed = db.one("SELECT COUNT(*) AS n FROM videos WHERE status = 'failed' AND updated_at >= ?", since)["n"]
    queued = db.one("SELECT COUNT(*) AS n FROM videos WHERE status = 'queued'")["n"]
    remaining = db.one("SELECT COUNT(*) AS n FROM ideas WHERE status = 'available'")["n"]
    top = db.all(
        """SELECT v.id, v.format, v.hook_style, a.id AS article, p.platform, p.permalink, m.views, m.saves, m.shares, m.score
           FROM metrics m JOIN publications p ON p.id = m.publication_id JOIN videos v ON v.id = p.video_id
           JOIN articles a ON a.id = v.article_id
           WHERE m.checkpoint = '72h' AND m.fetched_at >= ? ORDER BY m.score DESC LIMIT 3""",
        since,
    )
    lines = [
        "🌱 Báo cáo tuần — Endogenism",
        f"Đã đăng: {published} lượt · Lỗi/loại: {failed} · Hàng đợi: {queued} video · Kho ý tưởng còn: {remaining}",
    ]
    if top:
        lines.append("\nChạm sâu nhất (điểm chiều sâu / 1.000 views):")
        for t in top:
            lines.append(
                f"• #{t['id']} {t['format']} [{t['hook_style']}] {t['article']} · {t['platform']} · "
                f"{t['views']} views · {t['saves'] or 0} lưu · {t['shares'] or 0} chia sẻ · {t['score']}"
                + (f"\n  {t['permalink']}" if t["permalink"] else "")
            )
    weights = db.get_kv("hook_style_weights")
    if weights:
        lines.append(
            "\nStyle hook hiệu quả: " + ", ".join(f"{k} {v}" for k, v in sorted(weights.items(), key=lambda x: -x[1]))
        )
    text = "\n".join(lines)
    if send:
        notify(ctx.settings, text)
    return text
