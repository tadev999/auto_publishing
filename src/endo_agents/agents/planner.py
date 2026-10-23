"""Planner agent: fill the next N days of posting slots with ideas from the idea bank."""

from __future__ import annotations

import json
import math
import random
import sqlite3
from datetime import UTC, date, datetime, time, timedelta

from ..config import Settings
from ..context import Ctx
from ..db import VideoStatus, utcnow

AGENT = "planner"


def iso_utc(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat(timespec="seconds")


def allowed_formats(settings: Settings, day_index: int) -> list[str]:
    for step in sorted(settings.schedule.ramp_up, key=lambda s: s.until_day):
        if day_index <= step.until_day:
            return step.formats
    return [s.format for s in settings.schedule.slots]


def _recent_articles(ctx: Ctx, local: datetime) -> set[str]:
    gap = timedelta(days=ctx.settings.schedule.same_article_gap_days)
    rows = ctx.db.all(
        "SELECT article_id FROM videos WHERE status != 'failed' AND slot_at > ? AND slot_at < ?",
        iso_utc(local - gap),
        iso_utc(local + gap),
    )
    return {r["article_id"] for r in rows}


def pick_idea(ctx: Ctx, fmt: str, local: datetime) -> tuple[sqlite3.Row, int | None] | None:
    """Return (idea, remake_of_video_id) for a slot, or None when nothing fits."""
    db = ctx.db
    recent = _recent_articles(ctx, local)
    rows = [
        r
        for r in db.all(
            """SELECT i.*, a.mach_index, a.number FROM ideas i JOIN articles a ON a.id = i.article_id
               WHERE i.status = 'available' AND EXISTS (SELECT 1 FROM json_each(i.formats) WHERE value = ?)""",
            fmt,
        )
        if r["article_id"] not in recent
    ]
    if rows:
        current = db.one(
            """SELECT MIN(a.mach_index) AS m FROM ideas i JOIN articles a ON a.id = i.article_id
               WHERE i.status = 'available'"""
        )["m"]
        rng = random.Random(iso_utc(local))
        in_current = [r for r in rows if r["mach_index"] == current]
        earlier = [r for r in rows if r["mach_index"] < current]
        if in_current and (not earlier or rng.random() < ctx.settings.schedule.current_mach_ratio):
            # The current mach is walked in article order, so the journey unfolds like the book.
            in_current.sort(key=lambda r: (r["number"], json.loads(r["formats"]).index(fmt), r["id"]))
            return in_current[0], None
        return rng.choice(earlier or in_current or rows), None

    return _pick_remake(ctx, fmt, local, recent)


def _pick_remake(ctx: Ctx, fmt: str, local: datetime, recent: set[str]) -> tuple[sqlite3.Row, int] | None:
    cfg = ctx.settings
    cutoff = iso_utc(local - timedelta(days=cfg.schedule.remake_after_days))
    cands = ctx.db.all(
        """SELECT v.id, v.idea_id, v.article_id, AVG(m.score) AS score
           FROM videos v JOIN publications p ON p.video_id = v.id JOIN metrics m ON m.publication_id = p.id
           WHERE v.format = ? AND v.status IN ('published', 'measured') AND v.slot_at < ?
             AND v.remake_of IS NULL AND NOT EXISTS (SELECT 1 FROM videos r WHERE r.remake_of = v.id)
           GROUP BY v.id ORDER BY score DESC""",
        fmt,
        cutoff,
    )
    top = cands[: max(1, math.ceil(len(cands) * cfg.analytics.remake_top_ratio))]
    for c in top:
        if c["article_id"] not in recent:
            idea = ctx.db.one("SELECT * FROM ideas WHERE id = ?", c["idea_id"])
            return idea, c["id"]
    return None


def run(ctx: Ctx, now: datetime | None = None) -> int:
    s = ctx.settings
    tz = s.tz
    now = now or datetime.now(tz)
    start_raw = ctx.db.get_kv("schedule_start")
    if not start_raw:
        start_raw = now.date().isoformat()
        ctx.db.set_kv("schedule_start", start_raw)
    start = date.fromisoformat(start_raw)

    created = 0
    for offset in range(s.schedule.queue_days):
        day = now.date() + timedelta(days=offset)
        allowed = allowed_formats(s, (day - start).days + 1)
        for slot in s.schedule.slots:
            if slot.format not in allowed:
                continue
            local = datetime.combine(day, time.fromisoformat(slot.time), tzinfo=tz)
            if local <= now:
                continue
            slot_at = iso_utc(local)
            if ctx.db.one("SELECT 1 FROM videos WHERE slot_at = ? AND status != 'failed'", slot_at):
                continue
            choice = pick_idea(ctx, slot.format, local)
            if choice is None:
                ctx.event(
                    AGENT, f"Không còn ý tưởng phù hợp cho {slot.format} lúc {local:%d/%m %H:%M}", level="warning"
                )
                continue
            idea, remake_of = choice
            episode = (
                ctx.db.one("SELECT COUNT(*) AS n FROM videos WHERE format = ? AND status != 'failed'", slot.format)["n"]
                + 1
            )
            with ctx.db.tx():
                vid = ctx.db.run(
                    """INSERT INTO videos(idea_id, article_id, format, slot_at, episode, status, remake_of,
                                          created_at, updated_at)
                       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    idea["id"],
                    idea["article_id"],
                    slot.format,
                    slot_at,
                    episode,
                    VideoStatus.PLANNED.value,
                    remake_of,
                    utcnow(),
                    utcnow(),
                )
                ctx.db.run("UPDATE ideas SET status = 'used' WHERE id = ?", idea["id"])
            label = s.formats[slot.format].label
            tag = f" (làm lại #{remake_of})" if remake_of else ""
            ctx.event(
                AGENT,
                f"{local:%a %d/%m %H:%M} · {label} #{episode} ← {idea['article_id']}: {idea['angle']}{tag}",
                video_id=vid,
            )
            created += 1
    ctx.event(AGENT, f"Đã lên lịch {created} video mới")
    return created
