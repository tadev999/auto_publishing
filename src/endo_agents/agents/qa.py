"""QA agent: technical checks with ffprobe + visual check of sampled frames with a vision model."""

from __future__ import annotations

import sqlite3

from ..context import Ctx
from ..db import VideoStatus, loads
from ..llm import LLM
from ..media import extract_frames, probe, video_dir
from ..schemas import QAReport

AGENT = "qa"

VISION_PROMPT = """Bạn kiểm tra chất lượng khung hình của một video dọc 9:16 cho TikTok/Reels.
Ảnh là 4 khung hình lấy ở 15%, 40%, 65%, 90% thời lượng.

Chỉ đánh FAIL khi có lỗi RÕ RÀNG:
- Chữ bị cắt khỏi khung, chồng lên nhau, hoặc không đọc được.
- Chữ chính nằm trong vùng bị giao diện app che: 10% trên cùng, 22% dưới cùng, 12% mép phải.
- Lỗi hình (khung đen toàn bộ khi đáng lẽ có nội dung, hình vỡ, méo).
- Hình ảnh không phù hợp với nội dung tĩnh lặng, chữa lành (bạo lực, phản cảm, quảng cáo, logo thương hiệu nổi bật).
Lỗi dấu tiếng Việt hiển thị sai cũng là FAIL.
Nếu không có lỗi rõ ràng, passed = true. `issues` mô tả ngắn bằng tiếng Việt."""


def send_back(ctx: Ctx, video: sqlite3.Row, feedback: list[str], agent: str) -> None:
    """Return a video to the writer with feedback; counts as one critic round."""
    review = loads(video["critic"], {})
    review["feedback"] = feedback
    review["violations"] = []
    rounds = video["critic_rounds"] + 1
    if rounds > ctx.settings.critic.max_rounds:
        ctx.db.update_video(
            video["id"], status=VideoStatus.FAILED, critic=review, error=f"{agent}: {'; '.join(feedback)}"
        )
        ctx.db.run("UPDATE ideas SET status = 'skipped' WHERE id = ?", video["idea_id"])
        ctx.event(agent, f"LOẠI: {'; '.join(feedback)}", video_id=video["id"], level="warning")
        return
    # Old media no longer matches the new script.
    ctx.db.update_video(video["id"], status=VideoStatus.PLANNED, critic=review, critic_rounds=rounds, media={})
    ctx.event(agent, f"Trả về writer: {'; '.join(feedback)}", video_id=video["id"])


def run_one(ctx: Ctx, llm: LLM, video: sqlite3.Row) -> None:
    s = ctx.settings
    out = video_dir(s.data_dir, video["id"])
    path = out / "video.mp4"
    info = probe(path)

    lo, hi = s.formats[video["format"]].duration
    min_d, max_d = lo - s.render.duration_slack[0], hi + s.render.duration_slack[1]
    if not (min_d <= info.duration <= max_d):
        words_hint = "Rút gọn" if info.duration > max_d else "Mở rộng"
        send_back(
            ctx, video, [f"Video dài {info.duration:.1f}s, cần {lo}–{hi}s. {words_hint} script cho đúng độ dài."], AGENT
        )
        return

    tech: list[str] = []
    if (info.width, info.height) != (s.render.width, s.render.height):
        tech.append(f"Sai kích thước {info.width}x{info.height}")
    if not info.has_audio:
        tech.append("Không có âm thanh")
    if tech:
        raise RuntimeError("; ".join(tech))

    frames = extract_frames(path, [info.duration * p for p in (0.15, 0.4, 0.65, 0.9)], out / "frames")
    report = llm.gpt(
        model=s.models["qa_vision"],
        system=VISION_PROMPT,
        user="Kiểm tra 4 khung hình sau.",
        schema=QAReport,
        images=frames,
        temperature=0,
    )
    if not report.passed:
        send_back(ctx, video, [f"QA hình ảnh: {i}" for i in report.issues] or ["QA hình ảnh không đạt"], AGENT)
        return

    ctx.db.update_video(video["id"], status=VideoStatus.QA_PASSED)
    ctx.event(AGENT, f"Đạt · {info.duration:.1f}s · {info.width}x{info.height}", video_id=video["id"])
