"""Visual director: pick stock footage (for stock formats) and a background music track."""

from __future__ import annotations

import math
import random
import shutil
import sqlite3
from pathlib import Path

from ..context import Ctx
from ..db import loads
from ..integrations import pexels
from ..media import video_dir

AGENT = "visual"
SECONDS_PER_CLIP = 7
USED_KEY = "pexels_used_ids"


def _pick_music(ctx: Ctx, mood: str, seed: int) -> Path | None:
    root = ctx.settings.path("music_dir")
    tracks = sorted((root / mood).glob("*.mp3")) or sorted(root.rglob("*.mp3"))
    return random.Random(seed).choice(tracks) if tracks else None


def _stock_clips(ctx: Ctx, keywords: list[str], count: int, public: Path) -> list[dict]:
    used: list[int] = ctx.db.get_kv(USED_KEY, [])
    picked: list[dict] = []
    for kw in keywords:
        for item in pexels.search_portrait_videos(ctx.settings, kw):
            if len(picked) >= count:
                break
            if item["id"] in used or any(p["id"] == item["id"] for p in picked):
                continue
            f = pexels.best_file(item)
            if f is None:
                continue
            name = f"clip_{len(picked)}.mp4"
            pexels.download(f["link"], public / name)
            picked.append(
                {
                    "id": item["id"],
                    "file": name,
                    "author": item.get("user", {}).get("name"),
                    "url": item.get("url"),
                    "keyword": kw,
                }
            )
        if len(picked) >= count:
            break
    # Remember recent clips so consecutive videos don't reuse the same footage.
    ctx.db.set_kv(USED_KEY, (used + [p["id"] for p in picked])[-500:])
    return picked


def run_one(ctx: Ctx, video: sqlite3.Row) -> dict:
    fmt = ctx.settings.formats[video["format"]]
    media = loads(video["media"], {})
    public = video_dir(ctx.settings.data_dir, video["id"]) / "public"
    public.mkdir(exist_ok=True)

    if fmt.visual == "stock" and not media.get("clips"):
        script = loads(video["script"])
        count = max(2, min(5, math.ceil(media.get("speech_seconds", 30) / SECONDS_PER_CLIP)))
        media["clips"] = _stock_clips(ctx, script.get("visual_keywords", []) + ["calm window light"], count, public)
        ctx.event(
            AGENT,
            f"{len(media['clips'])} cảnh quay: {', '.join(c['keyword'] for c in media['clips'])}",
            video_id=video["id"],
        )

    if "music" not in media:
        track = _pick_music(ctx, fmt.music_mood, video["id"])
        if track:
            shutil.copyfile(track, public / "music.mp3")
            media["music"] = "music.mp3"
            media["music_track"] = track.name
        else:
            media["music"] = None
            ctx.event(
                AGENT,
                "Chưa có nhạc trong assets/music — video sẽ không có nhạc nền",
                video_id=video["id"],
                level="warning",
            )
    return media
