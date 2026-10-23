"""Instagram Graph API — Reels publishing and insights (Business/Creator account)."""

from __future__ import annotations

import time

import httpx

from ..config import Settings
from .http import ApiError, http_retry, raise_for_status


class Instagram:
    def __init__(self, settings: Settings):
        self.base = f"https://graph.facebook.com/{settings.publish.instagram_graph_version}"
        self.user_id = settings.secret("IG_USER_ID")
        self.token = settings.secret("IG_ACCESS_TOKEN")

    @http_retry
    def _get(self, path: str, **params) -> dict:
        resp = httpx.get(f"{self.base}/{path}", params={**params, "access_token": self.token}, timeout=60)
        return raise_for_status(resp).json()

    @http_retry
    def _post(self, path: str, **data) -> dict:
        return self._post_once(path, **data)

    def _post_once(self, path: str, **data) -> dict:
        resp = httpx.post(f"{self.base}/{path}", data={**data, "access_token": self.token}, timeout=60)
        return raise_for_status(resp).json()

    def quota_left(self) -> int | None:
        data = self._get(f"{self.user_id}/content_publishing_limit", fields="quota_usage,config")
        items = data.get("data") or []
        if not items:
            return None
        cfg = items[0].get("config", {})
        return int(cfg.get("quota_total", 0)) - int(items[0].get("quota_usage", 0))

    def publish_reel(self, video_url: str, caption: str, wait_seconds: int = 600) -> dict:
        container = self._post(
            f"{self.user_id}/media",
            media_type="REELS",
            video_url=video_url,
            caption=caption,
            share_to_feed="true",
        )["id"]

        deadline = time.monotonic() + wait_seconds
        while True:
            status = self._get(container, fields="status_code,status").get("status_code")
            if status == "FINISHED":
                break
            if status in ("ERROR", "EXPIRED"):
                raise ApiError(f"Instagram container {container} status {status}")
            if time.monotonic() > deadline:
                raise ApiError(f"Instagram container {container} not ready after {wait_seconds}s")
            time.sleep(10)

        # Not retried: a retry after a lost response could publish the reel twice.
        media_id = self._post_once(f"{self.user_id}/media_publish", creation_id=container)["id"]
        permalink = self._get(media_id, fields="permalink").get("permalink")
        return {"container_id": container, "media_id": media_id, "permalink": permalink}

    def insights(self, media_id: str) -> dict:
        metrics = "views,likes,comments,shares,saved,ig_reels_avg_watch_time"
        data = self._get(f"{media_id}/insights", metric=metrics).get("data", [])
        values = {m["name"]: (m.get("values") or [{}])[0].get("value") for m in data}
        watch_ms = values.get("ig_reels_avg_watch_time")
        return {
            "views": values.get("views"),
            "likes": values.get("likes"),
            "comments": values.get("comments"),
            "shares": values.get("shares"),
            "saves": values.get("saved"),
            "avg_watch_time": (watch_ms / 1000) if watch_ms else None,
            "raw": values,
        }
