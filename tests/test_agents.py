"""Writer ↔ critic loop with a fake LLM: no network, real agent logic."""

from conftest import add_article, add_idea

from endo_agents import pipeline
from endo_agents.db import VideoStatus, loads, utcnow
from endo_agents.schemas import Beat, CriticReport, CriticScores, Hook, Script

BODY = " ".join(["Bạn không lười và bạn không làm quá."] * 10)  # ~80 words: inside goi-ten target


def make_script() -> Script:
    return Script(
        hooks=[
            Hook(style="recognition", text="Bạn ngủ đủ. Nhưng sáng dậy vẫn mệt."),
            Hook(style="naming", text="Có một kiểu mệt không phải vì thiếu ngủ."),
            Hook(style="permission", text="Bạn không lười."),
        ],
        beats=[Beat(role="line", text=BODY), Beat(role="question", text="Mình đang mệt vì điều gì thật sự?")],
        caption="Bạn không lười.\nBạn đang mệt vì điều gì?",
        hashtags=["#kietsuc", "#noisinh", "#chualanh"],
        visual_keywords=["window light"],
        self_check="ok",
    )


def report(philosophy: float, violations=None) -> CriticReport:
    return CriticReport(
        best_hook_index=1,
        scores=CriticScores(hook=9, philosophy=philosophy, single_idea=9, voice=9, ending=9, readability=9),
        violations=violations or [],
        feedback=["Beat 2 nên cụ thể hơn."],
    )


class FakeLLM:
    def __init__(self, reports):
        self.reports = list(reports)
        self.writer_prompts: list[str] = []

    def claude(self, model, system, user, schema, **kw):
        self.writer_prompts.append(user)
        return make_script()

    def gpt(self, model, system, user, schema, **kw):
        return self.reports.pop(0)


def _video(ctx) -> int:
    aid = add_article(ctx, 1)
    idea = add_idea(ctx, aid, ["goi-ten"])
    return ctx.db.run(
        """INSERT INTO videos(idea_id, article_id, format, slot_at, episode, status, created_at, updated_at)
           VALUES(?, ?, 'goi-ten', '2030-01-01T00:00:00+00:00', 1, 'planned', ?, ?)""",
        idea,
        aid,
        utcnow(),
        utcnow(),
    )


def _only_writer_and_critic(monkeypatch):
    monkeypatch.setattr(pipeline, "STAGES", pipeline.STAGES[:2])


def test_rejected_draft_goes_back_with_feedback_then_is_approved(ctx, monkeypatch):
    _only_writer_and_critic(monkeypatch)
    vid = _video(ctx)
    llm = FakeLLM([report(philosophy=6, violations=["Hook gây sợ: '...'"]), report(philosophy=10)])

    pipeline.produce(ctx, llm)

    video = ctx.db.video(vid)
    assert video["status"] == VideoStatus.APPROVED
    assert video["critic_rounds"] == 2
    assert video["hook_style"] == "naming"
    assert "Hook gây sợ" in llm.writer_prompts[1]  # the rewrite saw the critic's objection
    script = loads(video["script"])
    assert script["final_beats"][0] == {
        "role": "hook",
        "text": "Có một kiểu mệt không phải vì thiếu ngủ.",
        "emphasis": [],
    }
    assert [h["round"] for h in loads(video["critic"])["history"]] == [1, 2]


def test_idea_is_skipped_after_max_rounds(ctx, monkeypatch):
    _only_writer_and_critic(monkeypatch)
    vid = _video(ctx)
    rounds = ctx.settings.critic.max_rounds
    pipeline.produce(ctx, FakeLLM([report(philosophy=5)] * rounds))

    video = ctx.db.video(vid)
    assert video["status"] == VideoStatus.FAILED
    assert ctx.db.one("SELECT status FROM ideas WHERE id = ?", video["idea_id"])["status"] == "skipped"
