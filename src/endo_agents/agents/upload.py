"""Upload agent: push the approved MP4 to private R2 storage and put it in the publishing queue."""

from __future__ import annotations

import sqlite3

from ..context import Ctx
from ..db import VideoStatus
from ..integrations import storage
from ..media import video_dir

AGENT = "upload"


def run_one(ctx: Ctx, video: sqlite3.Row) -> None:
    s = ctx.settings
    needs_url = "instagram" in s.publish.platforms and not s.publish.dry_run
    key = None
    if needs_url:
        path = video_dir(s.data_dir, video["id"]) / "video.mp4"
        key = storage.upload(s, path, f"videos/{video['id']:05d}-{video['format']}.mp4")
    ctx.db.update_video(video["id"], status=VideoStatus.QUEUED, r2_key=key)
    ctx.event(AGENT, f"Vào hàng đợi{' · R2 ' + key if key else ''}", video_id=video["id"])
