"""Writer agent: idea + source article → script with 3 hook variants."""

from __future__ import annotations

import json
import sqlite3

from ..content import article_body
from ..context import Ctx
from ..db import VideoStatus, loads
from ..llm import LLM
from ..schemas import Script
from ..skills import bundle

AGENT = "writer"
WORDS_PER_SECOND = 2.4

ROLE = """Bạn là người viết kịch bản video ngắn (Reels/TikTok) cho dự án Endogenism, viết bằng giọng của chính tác giả.
Bạn nhận một ý tưởng đã được tách từ bài viết gốc, cùng toàn văn bài viết.

Yêu cầu bắt buộc:
- Tuân thủ tuyệt đối LUẬT CỨNG của Endogenism.
- Viết đúng cấu trúc beats của format được giao. `beats` KHÔNG chứa hook (hook nằm riêng trong `hooks`).
- Đúng 3 hook, 3 style khác nhau. Phần thân phải nối tự nhiên với bất kỳ hook nào.
- Ưu tiên dùng câu chữ, ẩn dụ của bài gốc. Không bịa số liệu, nghiên cứu hay trích dẫn.
- Viết để ĐỌC THÀNH TIẾNG: câu ngắn, không ký hiệu, không emoji, không viết tắt.
- Độ dài tổng (hook + beats) nằm trong khoảng số từ mục tiêu.
- caption và hashtags theo skill short-form-retention."""


def target_words(duration: tuple[int, int]) -> tuple[int, int]:
    return round(duration[0] * WORDS_PER_SECOND), round(duration[1] * WORDS_PER_SECOND)


def _user_prompt(ctx: Ctx, video: sqlite3.Row, idea: sqlite3.Row, article_body: str) -> str:
    fmt = ctx.settings.formats[video["format"]]
    lo, hi = target_words(fmt.duration)
    idea_view = {
        "angle": idea["angle"],
        "insight": idea["insight"],
        "quotes": loads(idea["quotes"], []),
        "metaphor": idea["metaphor"],
        "practice": idea["practice"],
        "question": idea["question"],
        "emotion": idea["emotion"],
        "hook_seed": idea["hook_seed"],
    }
    parts = [
        f"FORMAT: {video['format']} — {fmt.label} — {fmt.duration[0]}–{fmt.duration[1]} giây ≈ {lo}–{hi} từ.",
        f"Ý TƯỞNG:\n{json.dumps(idea_view, ensure_ascii=False, indent=2)}",
    ]

    weights = ctx.db.get_kv("hook_style_weights") or {}
    if weights:
        best = sorted(weights, key=weights.get, reverse=True)[:2]
        parts.append(
            f"Dữ liệu thực tế: các style hook đang được khán giả lưu/chia sẻ nhiều nhất: {', '.join(best)}. "
            "Nên có ít nhất một hook thuộc các style này."
        )

    if video["remake_of"]:
        old = loads(ctx.db.video(video["remake_of"])["script"], {})
        parts.append(
            "ĐÂY LÀ BẢN LÀM LẠI của một video được yêu thích. Giữ tinh thần, nhưng hook và cách triển khai phải MỚI. "
            f"Không lặp lại các hook cũ: {json.dumps([h['text'] for h in old.get('hooks', [])], ensure_ascii=False)}"
        )

    review = loads(video["critic"], {})
    if review.get("feedback") or review.get("violations"):
        parts.append(
            "BẢN TRƯỚC CHƯA ĐẠT. Sửa theo góp ý sau:\n"
            + "\n".join(f"- {x}" for x in review.get("violations", []) + review.get("feedback", []))
        )

    parts.append(f"BÀI VIẾT GỐC:\n<article>\n{article_body}\n</article>")
    return "\n\n".join(parts)


def run_one(ctx: Ctx, llm: LLM, video: sqlite3.Row) -> None:
    idea = ctx.db.one("SELECT * FROM ideas WHERE id = ?", video["idea_id"])
    body = article_body(ctx, video["article_id"])
    script = llm.claude(
        model=ctx.settings.models["writer"],
        system=[
            bundle(
                "endogenism-guardrails",
                "endogenism-voice",
                "hook-writing",
                "short-form-retention",
                f"format-{video['format']}",
            ),
            ROLE,
        ],
        user=_user_prompt(ctx, video, idea, body),
        schema=Script,
        max_tokens=3000,
        temperature=0.85,
    )
    round_no = video["critic_rounds"] + 1
    ctx.db.update_video(video["id"], status=VideoStatus.SCRIPTED, script=script.model_dump())
    hooks = " | ".join(f"[{h.style}] {h.text}" for h in script.hooks)
    ctx.event(AGENT, f"Bản nháp vòng {round_no}: {hooks}", video_id=video["id"])
