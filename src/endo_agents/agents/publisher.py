"""Publisher agent: post due videos to Instagram Reels and TikTok."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from ..context import Ctx
from ..db import VideoStatus, loads, utcnow
from ..integrations import storage
from ..integrations.instagram import Instagram
from ..integrations.telegram import notify
from ..integrations.tiktok import TikTok
from ..media import probe, video_dir

AGENT = "publisher"
PAUSE_KEY = "paused"


def build_caption(ctx: Ctx, video: sqlite3.Row, platform: str) -> str:
    script = loads(video["script"])
    tags = list(dict.fromkeys(script.get("hashtags", []) + ctx.settings.brand.get("default_hashtags", [])))
    parts = [script["caption"].strip(), " ".join(tags)]
    if platform == "instagram" and ctx.settings.publish.instagram_ai_disclosure:
        parts.append(ctx.settings.publish.instagram_ai_disclosure)
    return "\n\n".join(p for p in parts if p)


def _publication(ctx: Ctx, video_id: int, platform: str) -> sqlite3.Row:
    ctx.db.run(
        "INSERT OR IGNORE INTO publications(video_id, platform, status) VALUES(?, ?, 'pending')", video_id, platform
    )
    return ctx.db.one("SELECT * FROM publications WHERE video_id = ? AND platform = ?", video_id, platform)


def _publish_instagram(ctx: Ctx, video: sqlite3.Row) -> dict:
    s = ctx.settings
    key = video["r2_key"]
    if not key:
        key = storage.upload(
            s, video_dir(s.data_dir, video["id"]) / "video.mp4", f"videos/{video['id']:05d}-{video['format']}.mp4"
        )
        ctx.db.update_video(video["id"], r2_key=key)
    result = Instagram(s).publish_reel(storage.presigned_url(s, key), build_caption(ctx, video, "instagram"))
    return {"external_id": result["container_id"], "post_id": result["media_id"], "permalink": result["permalink"]}


def _publish_tiktok(ctx: Ctx, video: sqlite3.Row) -> dict:
    s = ctx.settings
    path = video_dir(s.data_dir, video["id"]) / "video.mp4"
    tt = TikTok(s, ctx.db)
    publish_id = tt.upload(
        path,
        build_caption(ctx, video, "tiktok"),
        mode=s.publish.tiktok_mode,
        is_aigc=s.publish.tiktok_ai_label,
        duration=probe(path).duration,
    )
    status = tt.wait_until_done(publish_id)
    post_ids = status.get("publicaly_available_post_id") or []  # sic: TikTok's field name
    return {
        "external_id": publish_id,
        "post_id": str(post_ids[0]) if post_ids else None,
        "permalink": None,
        "inbox": status.get("status") == "SEND_TO_USER_INBOX",
    }


PUBLISHERS = {"instagram": _publish_instagram, "tiktok": _publish_tiktok}


def publish_video(ctx: Ctx, video: sqlite3.Row) -> None:
    s = ctx.settings
    for platform in s.publish.platforms:
        pub = _publication(ctx, video["id"], platform)
        if pub["status"] in ("published", "dry_run", "failed"):
            continue
        if s.publish.dry_run:
            ctx.db.run("UPDATE publications SET status = 'dry_run', published_at = ? WHERE id = ?", utcnow(), pub["id"])
            ctx.event(
                AGENT,
                f"[DRY RUN] {platform}: sẽ đăng lúc này\n{build_caption(ctx, video, platform)}",
                video_id=video["id"],
            )
            continue
        try:
            result = PUBLISHERS[platform](ctx, video)
            ctx.db.run(
                """UPDATE publications SET status = 'published', external_id = ?, post_id = ?, permalink = ?,
                       published_at = ?, error = NULL WHERE id = ?""",
                result["external_id"],
                result["post_id"],
                result["permalink"],
                utcnow(),
                pub["id"],
            )
            where = "hộp thư nháp TikTok (bấm Đăng trong app)" if result.get("inbox") else (result["permalink"] or "")
            ctx.event(AGENT, f"{platform}: đã đăng {where}", video_id=video["id"])
            if result.get("inbox"):
                notify(s, f"📥 Video #{video['id']} đã vào hộp nháp TikTok — mở app và bấm Đăng.")
        except Exception as exc:
            attempts = pub["attempts"] + 1
            final = attempts >= s.publish.max_attempts
            ctx.db.run(
                "UPDATE publications SET attempts = ?, error = ?, status = ? WHERE id = ?",
                attempts,
                str(exc)[:1000],
                "failed" if final else "pending",
                pub["id"],
            )
            ctx.event(AGENT, f"{platform} lỗi (lần {attempts}): {exc}", video_id=video["id"], level="error")
            if final:
                notify(s, f"❌ Đăng {platform} thất bại cho video #{video['id']}: {exc}")

    pubs = ctx.db.all("SELECT status FROM publications WHERE video_id = ?", video["id"])
    states = {p["status"] for p in pubs}
    if states <= {"published", "dry_run", "failed"}:
        ok = states & {"published", "dry_run"}
        ctx.db.update_video(
            video["id"],
            status=VideoStatus.PUBLISHED if ok else VideoStatus.FAILED,
            error=None if ok else "all platforms failed",
        )


def run(ctx: Ctx, now: datetime | None = None) -> int:
    if ctx.db.get_kv(PAUSE_KEY):
        ctx.event(AGENT, "Đang tạm dừng (endo resume để chạy lại)", level="warning")
        return 0
    now_iso = (now or datetime.now(UTC)).astimezone(UTC).isoformat(timespec="seconds")
    due = ctx.db.all(
        "SELECT * FROM videos WHERE status = ? AND slot_at <= ? ORDER BY slot_at", VideoStatus.QUEUED.value, now_iso
    )
    for video in due:
        publish_video(ctx, video)
    return len(due)
