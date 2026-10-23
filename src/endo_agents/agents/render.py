"""Render agent: visuals + narration + captions → 1080x1920 MP4 via Remotion, then loudness-normalised."""

from __future__ import annotations

import json
import shutil
import sqlite3
import subprocess

from ..context import Ctx
from ..db import VideoStatus
from ..media import MediaError, normalize_loudness, video_dir
from . import visual

AGENT = "render"


def build_props(ctx: Ctx, video: sqlite3.Row, media: dict, captions: dict) -> dict:
    s = ctx.settings
    return {
        "format": video["format"],
        "label": s.formats[video["format"]].label,
        "episode": video["episode"],
        "handle": s.brand.get("handle", ""),
        "pages": captions["pages"],
        "durationInSeconds": captions["duration"],
        "voice": media["voice"],
        "music": media.get("music"),
        "musicVolume": s.render.music_volume,
        "clips": [c["file"] for c in media.get("clips", [])],
        "seed": video["id"],
    }


def run_one(ctx: Ctx, video: sqlite3.Row) -> None:
    media = visual.run_one(ctx, video)
    ctx.db.update_video(video["id"], media=media)

    out = video_dir(ctx.settings.data_dir, video["id"])
    captions = json.loads((out / media["captions"]).read_text(encoding="utf-8"))
    props_path = out / "props.json"
    props_path.write_text(json.dumps(build_props(ctx, video, media, captions), ensure_ascii=False), encoding="utf-8")

    raw = out / "raw.mp4"
    final = out / "video.mp4"
    npx = shutil.which("npx")
    if not npx:
        raise MediaError("npx not found. Install Node.js 18+ and run `npm install` in remotion/.")
    cmd = [
        npx,
        "remotion",
        "render",
        "src/index.ts",
        video["format"],
        str(raw),
        f"--props={props_path}",
        f"--public-dir={out / 'public'}",
        "--codec=h264",
        "--crf=18",
        "--log=error",
    ]
    proc = subprocess.run(cmd, cwd=ctx.settings.path("remotion_dir"), capture_output=True, text=True, timeout=1800)
    if proc.returncode != 0:
        raise MediaError(f"Remotion render failed: {(proc.stderr or proc.stdout).strip()[-1200:]}")

    normalize_loudness(raw, final, ctx.settings.render.loudness_lufs)
    raw.unlink(missing_ok=True)

    media["video"] = "video.mp4"
    ctx.db.update_video(video["id"], status=VideoStatus.RENDERED, media=media)
    size_mb = final.stat().st_size / 1_048_576
    ctx.event(AGENT, f"Dựng xong {captions['duration']:.1f}s · {size_mb:.1f} MB → {final}", video_id=video["id"])
