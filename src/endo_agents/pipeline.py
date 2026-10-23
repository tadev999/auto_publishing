"""Orchestrator: moves each video through the production state machine."""

from __future__ import annotations

import fcntl
import os
from collections.abc import Callable, Iterator
from contextlib import contextmanager

from .agents import critic, qa, render, upload, voice, writer
from .config import MissingSecret
from .context import Ctx
from .db import VideoStatus
from .integrations.telegram import notify
from .llm import LLM

# (agent name, input status, handler)
STAGES: list[tuple[str, VideoStatus, Callable]] = [
    ("writer", VideoStatus.PLANNED, lambda ctx, llm, v: writer.run_one(ctx, llm, v)),
    ("critic", VideoStatus.SCRIPTED, lambda ctx, llm, v: critic.run_one(ctx, llm, v)),
    ("voice", VideoStatus.APPROVED, lambda ctx, llm, v: voice.run_one(ctx, v)),
    ("render", VideoStatus.VOICED, lambda ctx, llm, v: render.run_one(ctx, v)),
    ("qa", VideoStatus.RENDERED, lambda ctx, llm, v: qa.run_one(ctx, llm, v)),
    ("upload", VideoStatus.QA_PASSED, lambda ctx, llm, v: upload.run_one(ctx, v)),
]
MAX_STAGE_ATTEMPTS = 3


def _fail(ctx: Ctx, video_id: int, agent: str, exc: Exception) -> None:
    video = ctx.db.video(video_id)
    attempts = video["attempts"] + 1
    if attempts < MAX_STAGE_ATTEMPTS:
        ctx.db.update_video(video_id, attempts=attempts, error=f"{agent}: {exc}")
        ctx.event(
            agent, f"Lỗi (lần {attempts}/{MAX_STAGE_ATTEMPTS}), sẽ thử lại: {exc}", video_id=video_id, level="error"
        )
        return
    ctx.db.update_video(video_id, status=VideoStatus.FAILED, attempts=attempts, error=f"{agent}: {exc}")
    # A technical failure says nothing about the idea, so it goes back to the bank.
    ctx.db.run("UPDATE ideas SET status = 'available' WHERE id = ? AND status = 'used'", video["idea_id"])
    ctx.event(agent, f"THẤT BẠI sau {attempts} lần: {exc}", video_id=video_id, level="error")
    notify(ctx.settings, f"❌ Video #{video_id} thất bại ở bước {agent}: {exc}")


def produce(ctx: Ctx, llm: LLM, limit: int | None = None, video_ids: list[int] | None = None) -> dict[str, int]:
    """Run every stage repeatedly until no video can move further in this run."""
    active = [s.value for _, s, _ in STAGES]
    marks = ",".join("?" * len(active))
    targets = [
        r["id"] for r in ctx.db.all(f"SELECT id FROM videos WHERE status IN ({marks}) ORDER BY slot_at", *active)
    ]
    if video_ids:
        targets = [t for t in targets if t in video_ids]
    if limit is not None:
        targets = targets[:limit]

    stats: dict[str, int] = {name: 0 for name, _, _ in STAGES}
    errored: set[int] = set()
    progressed = True
    while progressed:
        progressed = False
        for name, status, handler in STAGES:
            for vid in targets:
                if vid in errored:
                    continue
                video = ctx.db.video(vid)
                if video["status"] != status.value:
                    continue
                try:
                    handler(ctx, llm, video)
                except MissingSecret:
                    raise
                except Exception as exc:
                    errored.add(vid)
                    _fail(ctx, vid, name, exc)
                    continue
                if ctx.db.video(vid)["status"] != VideoStatus.FAILED.value:
                    ctx.db.update_video(vid, attempts=0, error=None)
                stats[name] += 1
                progressed = True
    return stats


@contextmanager
def single_instance(ctx: Ctx, name: str) -> Iterator[bool]:
    """Non-blocking file lock so overlapping cron runs exit instead of double-processing."""
    lock_dir = ctx.settings.data_dir / "locks"
    lock_dir.mkdir(exist_ok=True)
    fd = os.open(lock_dir / f"{name}.lock", os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
            return
        yield True
    finally:
        os.close(fd)
