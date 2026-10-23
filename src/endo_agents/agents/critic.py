"""Critic + Philosophy Guardian: score a script against the rubric; approve, send back, or reject."""

from __future__ import annotations

import json
import sqlite3

from ..config import Settings
from ..content import article_body, normalize
from ..context import Ctx
from ..db import VideoStatus, loads
from ..llm import LLM
from ..schemas import CriticReport, Script
from ..skills import bundle
from .writer import target_words

AGENT = "critic"

ROLE = """Bạn là biên tập viên khó tính kiêm "Người giữ triết lý" của dự án Endogenism.
Bạn KHÔNG viết lại script. Bạn chấm điểm và góp ý để người viết tự sửa.

Thang điểm 0–10 cho từng tiêu chí (chấm trên script khi dùng hook tốt nhất):
- hook: dừng được ngón tay lướt trong 2 giây VÀ giúp người xem nhận ra mình (không dọa, không giật tít).
- philosophy: đúng tinh thần Endogenism, không vi phạm luật cứng nào. Chỉ cho 9–10 khi hoàn toàn sạch.
- single_idea: một video một ý, mạch rõ, không lan man.
- voice: nghe như chính tác giả (ấm, ngang hàng, câu ngắn, ẩn dụ đời thường), không giọng coach/MC.
- ending: câu kết mở ra phản tư hoặc mời bình luận, không ra lệnh; tốt nhất có callback về hook.
- readability: dễ đọc thành tiếng, đúng độ dài mục tiêu, đúng cấu trúc beats của format.

Chấm nghiêm khắc: 8 là "tốt, đăng được", 9–10 là "xuất sắc". Đừng cho điểm cao vì lịch sự.
`violations`: liệt kê từng vi phạm luật cứng kèm câu trích cụ thể; để trống nếu không có.
`feedback`: 2–5 góp ý cụ thể bằng tiếng Việt, mỗi góp ý chỉ rõ beat nào và sửa thế nào."""


def weighted_total(settings: Settings, report: CriticReport) -> float:
    scores = report.scores.model_dump()
    weights = settings.critic.weights
    return round(sum(scores[k] * w for k, w in weights.items()) / sum(weights.values()), 2)


def deterministic_checks(ctx: Ctx, video: sqlite3.Row, script: Script) -> list[str]:
    """Rules that code can verify more reliably than an LLM."""
    issues: list[str] = []
    fmt = ctx.settings.formats[video["format"]]
    lo, hi = target_words(fmt.duration)
    words = len(" ".join(b.text for b in script.beats).split()) + max(len(h.text.split()) for h in script.hooks)
    if words > hi * 1.15:
        issues.append(f"Script dài {words} từ, vượt mục tiêu {lo}–{hi} từ. Cắt bớt beat yếu nhất.")
    if words < lo * 0.8:
        issues.append(f"Script chỉ {words} từ, ngắn hơn mục tiêu {lo}–{hi} từ.")
    if len({h.style for h in script.hooks}) < 3:
        issues.append("3 hook phải thuộc 3 style khác nhau.")
    if video["format"] == "doc-cham":
        source = normalize(article_body(ctx, video["article_id"]))
        for b in script.beats:
            if b.role == "quote" and normalize(b.text) not in source:
                issues.append(f'Beat quote không phải nguyên văn bài gốc: "{b.text}"')
    return issues


def run_one(ctx: Ctx, llm: LLM, video: sqlite3.Row) -> None:
    script = Script.model_validate(loads(video["script"]))
    fmt = ctx.settings.formats[video["format"]]
    lo, hi = target_words(fmt.duration)
    idea = ctx.db.one("SELECT insight, quotes FROM ideas WHERE id = ?", video["idea_id"])

    report = llm.gpt(
        model=ctx.settings.models["critic"],
        system="\n\n".join(
            [
                ROLE,
                bundle(
                    "endogenism-guardrails",
                    "endogenism-voice",
                    "hook-writing",
                    "short-form-retention",
                    f"format-{video['format']}",
                ),
            ]
        ),
        user=(
            f"FORMAT: {video['format']} — {fmt.label} — mục tiêu {lo}–{hi} từ.\n"
            f"Ý chính của bài gốc: {idea['insight']}\n"
            f"Trích dẫn gốc: {idea['quotes']}\n\n"
            f"SCRIPT:\n{json.dumps(script.model_dump(), ensure_ascii=False, indent=2)}"
        ),
        schema=CriticReport,
    )

    checks = deterministic_checks(ctx, video, script)
    total = weighted_total(ctx.settings, report)
    philosophy = report.scores.philosophy
    passed = (
        total >= ctx.settings.critic.pass_total
        and philosophy >= ctx.settings.critic.pass_philosophy
        and not report.violations
        and not checks
    )
    round_no = video["critic_rounds"] + 1
    hook = script.hooks[report.best_hook_index]
    review = {
        "round": round_no,
        "total": total,
        "passed": passed,
        "scores": report.scores.model_dump(),
        "best_hook_index": report.best_hook_index,
        "violations": report.violations,
        "feedback": checks + report.feedback,
        "history": loads(video["critic"], {}).get("history", [])
        + [{"round": round_no, "total": total, "philosophy": philosophy}],
    }
    verdict = f"vòng {round_no}: {total}/10 (triết lý {philosophy})"

    if passed:
        final = script.model_dump()
        final["final_beats"] = [{"role": "hook", "text": hook.text, "emphasis": []}] + final["beats"]
        ctx.db.update_video(
            video["id"],
            status=VideoStatus.APPROVED,
            script=final,
            critic=review,
            critic_rounds=round_no,
            hook_style=hook.style,
        )
        ctx.event(AGENT, f'DUYỆT {verdict} · hook [{hook.style}] "{hook.text}"', video_id=video["id"])
        return

    reasons = "; ".join((report.violations + checks + report.feedback)[:3])
    if round_no >= ctx.settings.critic.max_rounds:
        ctx.db.update_video(
            video["id"],
            status=VideoStatus.FAILED,
            critic=review,
            critic_rounds=round_no,
            error=f"critic_rejected after {round_no} rounds",
        )
        ctx.db.run("UPDATE ideas SET status = 'skipped' WHERE id = ?", video["idea_id"])
        ctx.event(AGENT, f"LOẠI sau {round_no} vòng ({verdict}). {reasons}", video_id=video["id"], level="warning")
        return

    ctx.db.update_video(video["id"], status=VideoStatus.PLANNED, critic=review, critic_rounds=round_no)
    ctx.event(AGENT, f"TRẢ LẠI {verdict}. {reasons}", video_id=video["id"])
