from __future__ import annotations

from pathlib import Path

import httpx

from ..config import Settings
from .http import http_retry, raise_for_status


@http_retry
def search_portrait_videos(settings: Settings, query: str, per_page: int = 15) -> list[dict]:
    resp = httpx.get(
        "https://api.pexels.com/videos/search",
        params={"query": query, "orientation": "portrait", "size": "medium", "per_page": per_page},
        headers={"Authorization": settings.secret("PEXELS_API_KEY")},
        timeout=30,
    )
    return raise_for_status(resp).json().get("videos", [])


def best_file(video: dict, min_height: int = 1280) -> dict | None:
    """Smallest portrait MP4 that is still at least `min_height` tall."""
    files = [
        f
        for f in video.get("video_files", [])
        if f.get("file_type") == "video/mp4"
        and (f.get("height") or 0) >= min_height
        and (f.get("height") or 0) > (f.get("width") or 0)
    ]
    return min(files, key=lambda f: f["height"]) if files else None


@http_retry
def download(url: str, dest: Path) -> Path:
    with httpx.stream("GET", url, timeout=120, follow_redirects=True) as resp:
        if resp.is_error:
            resp.read()
        raise_for_status(resp)
        with dest.open("wb") as fh:
            for chunk in resp.iter_bytes():
                fh.write(chunk)
    return dest
