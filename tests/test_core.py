from pathlib import Path

from conftest import add_article, add_idea

from endo_agents import pipeline
from endo_agents.agents.analytics import depth_score
from endo_agents.agents.critic import weighted_total
from endo_agents.agents.ingest import verified_seed
from endo_agents.content import Article
from endo_agents.db import VideoStatus, utcnow
from endo_agents.integrations.tiktok import CHUNK, MAX_SINGLE_CHUNK, chunk_plan
from endo_agents.schemas import CriticReport, CriticScores, IdeaSeed

ARTICLE = Article(
    id="bai-001",
    mach_slug="mach-1",
    mach_index=1,
    mach_title="M1",
    number=1,
    title="T",
    path=Path("/x"),
    body="Bạn không lười. Và bạn **không làm quá**.\n\nCỗ máy không bao giờ tắt.",
)


def test_verified_seed_keeps_only_verbatim_quotes():
    seed = IdeaSeed(
        angle="a",
        insight="i",
        quotes=["Bạn không lười. Và bạn không làm quá.", "Câu bịa ra."],
        question="q",
        emotion="e",
        hook_seed="h",
        formats=["doc-cham", "thuc-hanh", "goi-ten"],
    )
    out = verified_seed(seed, ARTICLE)
    assert out.quotes == ["Bạn không lười. Và bạn không làm quá."]
    assert out.formats == ["doc-cham", "goi-ten"]  # thuc-hanh dropped: no practice


def test_verified_seed_drops_doc_cham_without_quotes():
    seed = IdeaSeed(
        angle="a", insight="i", quotes=["bịa"], question="q", emotion="e", hook_seed="h", formats=["doc-cham"]
    )
    assert verified_seed(seed, ARTICLE).formats == ["goi-ten"]


def test_weighted_total_uses_config_weights(ctx):
    report = CriticReport(
        best_hook_index=0,
        scores=CriticScores(hook=10, philosophy=10, single_idea=10, voice=10, ending=10, readability=0),
        feedback=[],
    )
    assert weighted_total(ctx.settings, report) == 9.0


def test_depth_score_rewards_saves_and_shares():
    w = {"saves": 4, "shares": 3, "comments": 2, "likes": 0.5}
    assert depth_score(w, {"views": 1000, "saves": 10, "shares": 0, "comments": 0, "likes": 0}) == 40.0
    assert depth_score(w, {"views": 0}) == 0.0


def test_tiktok_chunk_plan():
    assert chunk_plan(20_000_000) == (20_000_000, 1)
    size = MAX_SINGLE_CHUNK + 5
    chunk, count = chunk_plan(size)
    assert chunk == CHUNK and count == size // CHUNK


def _planned_video(ctx) -> int:
    aid = add_article(ctx, 1)
    idea = add_idea(ctx, aid, ["goi-ten"])
    ctx.db.run("UPDATE ideas SET status = 'used' WHERE id = ?", idea)
    return ctx.db.run(
        """INSERT INTO videos(idea_id, article_id, format, slot_at, episode, status, created_at, updated_at)
           VALUES(?, ?, 'goi-ten', '2030-01-01T00:00:00+00:00', 1, 'planned', ?, ?)""",
        idea,
        aid,
        utcnow(),
        utcnow(),
    )


def test_pipeline_moves_video_through_all_stages(ctx, monkeypatch):
    vid = _planned_video(ctx)
    order = [s for _, s, _ in pipeline.STAGES] + [VideoStatus.QUEUED]

    def advance(c, llm, v):
        c.db.update_video(v["id"], status=order[order.index(VideoStatus(v["status"])) + 1])

    monkeypatch.setattr(pipeline, "STAGES", [(n, s, advance) for n, s, _ in pipeline.STAGES])
    stats = pipeline.produce(ctx, llm=None)
    assert ctx.db.video(vid)["status"] == "queued"
    assert all(v == 1 for v in stats.values())


def test_pipeline_retries_then_fails_and_returns_idea(ctx, monkeypatch):
    vid = _planned_video(ctx)

    def boom(c, llm, v):
        raise RuntimeError("api down")

    monkeypatch.setattr(pipeline, "STAGES", [("writer", VideoStatus.PLANNED, boom)])
    for _ in range(pipeline.MAX_STAGE_ATTEMPTS):
        pipeline.produce(ctx, llm=None)
    video = ctx.db.video(vid)
    assert video["status"] == "failed"
    assert "api down" in video["error"]
    assert ctx.db.one("SELECT status FROM ideas WHERE id = ?", video["idea_id"])["status"] == "available"
