from collections import defaultdict
from datetime import datetime, timedelta

from conftest import add_article, add_idea

from endo_agents.agents import planner

ALL = ["goi-ten", "ngo-nhan", "thuc-hanh", "doc-cham", "cau-hoi"]


def _seed(ctx, articles=12, mach=1, start=1):
    for n in range(start, start + articles):
        aid = add_article(ctx, n, mach)
        for _ in range(3):
            add_idea(ctx, aid, ALL)


def _now(ctx):
    return datetime(2026, 10, 24, 0, 0, tzinfo=ctx.settings.tz)


def test_ramp_up_plans_three_videos_per_day_for_new_account(ctx):
    _seed(ctx)
    created = planner.run(ctx, now=_now(ctx))
    days = ctx.settings.schedule.queue_days
    assert created == 3 * days
    formats = {r["format"] for r in ctx.db.all("SELECT format FROM videos")}
    assert formats == {"goi-ten", "thuc-hanh", "doc-cham"}


def test_full_schedule_after_ramp_up(ctx):
    _seed(ctx, articles=30)
    ctx.db.set_kv("schedule_start", "2026-09-01")
    created = planner.run(ctx, now=_now(ctx))
    assert created == 5 * ctx.settings.schedule.queue_days


def test_planner_is_idempotent(ctx):
    _seed(ctx)
    planner.run(ctx, now=_now(ctx))
    assert planner.run(ctx, now=_now(ctx)) == 0


def test_same_article_is_spaced_out(ctx):
    _seed(ctx)
    planner.run(ctx, now=_now(ctx))
    by_article = defaultdict(list)
    for r in ctx.db.all("SELECT article_id, slot_at FROM videos"):
        by_article[r["article_id"]].append(datetime.fromisoformat(r["slot_at"]))
    gap = timedelta(days=ctx.settings.schedule.same_article_gap_days)
    for slots in by_article.values():
        slots.sort()
        for a, b in zip(slots, slots[1:], strict=False):
            assert b - a >= gap


def test_journey_starts_with_first_article_of_current_mach(ctx):
    _seed(ctx, articles=5, mach=2, start=31)
    _seed(ctx, articles=5, mach=1, start=1)
    planner.run(ctx, now=_now(ctx))
    first = ctx.db.one("SELECT article_id FROM videos ORDER BY slot_at LIMIT 1")
    assert first["article_id"] == "bai-001"


def test_ideas_are_reserved_and_episodes_increment(ctx):
    _seed(ctx)
    planner.run(ctx, now=_now(ctx))
    used = ctx.db.one("SELECT COUNT(*) AS n FROM ideas WHERE status = 'used'")["n"]
    assert used == ctx.db.one("SELECT COUNT(*) AS n FROM videos")["n"]
    eps = [r["episode"] for r in ctx.db.all("SELECT episode FROM videos WHERE format = 'goi-ten' ORDER BY slot_at")]
    assert eps == list(range(1, len(eps) + 1))


def test_failed_slot_is_refilled(ctx):
    _seed(ctx)
    planner.run(ctx, now=_now(ctx))
    vid = ctx.db.one("SELECT id FROM videos ORDER BY slot_at LIMIT 1")["id"]
    ctx.db.update_video(vid, status="failed")
    assert planner.run(ctx, now=_now(ctx)) == 1
