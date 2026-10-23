"""TikTok Content Posting API (direct post or inbox draft) + Display API metrics."""

from __future__ import annotations

import math
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

from ..config import Settings
from ..db import DB
from .http import ApiError, http_retry, raise_for_status

AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/"
API = "https://open.tiktokapis.com/v2"
SCOPES = "user.info.basic,video.upload,video.publish,video.list"
TOKENS_KEY = "tiktok_tokens"
MAX_SINGLE_CHUNK = 64 * 1024 * 1024
CHUNK = 10 * 1024 * 1024


def chunk_plan(size: int) -> tuple[int, int]:
    """(chunk_size, total_chunk_count) per TikTok rules: the last chunk absorbs the remainder."""
    if size <= MAX_SINGLE_CHUNK:
        return size, 1
    return CHUNK, math.floor(size / CHUNK)


class TikTok:
    def __init__(self, settings: Settings, db: DB):
        self.settings = settings
        self.db = db

    # --- OAuth ---
    def authorize_url(self, state: str) -> str:
        query = {
            "client_key": self.settings.secret("TIKTOK_CLIENT_KEY"),
            "scope": SCOPES,
            "response_type": "code",
            "redirect_uri": self.settings.secret("TIKTOK_REDIRECT_URI"),
            "state": state,
        }
        return f"{AUTH_URL}?{urlencode(query)}"

    def exchange_code(self, code: str) -> dict:
        return self._token_request(
            grant_type="authorization_code",
            code=code,
            redirect_uri=self.settings.secret("TIKTOK_REDIRECT_URI"),
        )

    def _token_request(self, **form: str) -> dict:
        resp = httpx.post(
            f"{API}/oauth/token/",
            data={
                "client_key": self.settings.secret("TIKTOK_CLIENT_KEY"),
                "client_secret": self.settings.secret("TIKTOK_CLIENT_SECRET"),
                **form,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        data = raise_for_status(resp).json()
        if "access_token" not in data:
            raise ApiError(f"TikTok token error: {data.get('error')} {data.get('error_description')}")
        now = time.time()
        tokens = {
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "open_id": data.get("open_id"),
            "scope": data.get("scope"),
            "expires_at": now + int(data.get("expires_in", 0)),
            "refresh_expires_at": now + int(data.get("refresh_expires_in", 0)),
        }
        self.db.set_kv(TOKENS_KEY, tokens)
        return tokens

    def access_token(self) -> str:
        tokens = self.db.get_kv(TOKENS_KEY)
        if not tokens:
            raise ApiError("TikTok is not authorized yet. Run: endo tiktok-auth")
        if tokens["expires_at"] - time.time() < 300:
            if tokens["refresh_expires_at"] < time.time():
                raise ApiError("TikTok refresh token expired. Run: endo tiktok-auth")
            tokens = self._token_request(grant_type="refresh_token", refresh_token=tokens["refresh_token"])
        return tokens["access_token"]

    # --- API helpers ---
    @http_retry
    def _post(self, path: str, body: dict, params: dict | None = None) -> dict:
        resp = httpx.post(
            f"{API}{path}",
            params=params,
            json=body,
            headers={
                "Authorization": f"Bearer {self.access_token()}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            timeout=60,
        )
        payload = raise_for_status(resp).json()
        err = payload.get("error", {})
        if err.get("code") not in (None, "ok"):
            raise ApiError(f"TikTok {path}: {err.get('code')} {err.get('message')} (log_id={err.get('log_id')})")
        return payload.get("data", {})

    def creator_info(self) -> dict:
        return self._post("/post/publish/creator_info/query/", {})

    # --- publishing ---
    def upload(self, video: Path, caption: str, mode: str, is_aigc: bool, duration: float) -> str:
        size = video.stat().st_size
        chunk_size, chunks = chunk_plan(size)
        source = {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": chunk_size, "total_chunk_count": chunks}

        if mode == "direct":
            info = self.creator_info()
            max_sec = info.get("max_video_post_duration_sec")
            if max_sec and duration > max_sec:
                raise ApiError(f"Video {duration:.0f}s exceeds TikTok limit {max_sec}s for this creator")
            options = info.get("privacy_level_options") or ["SELF_ONLY"]
            privacy = "PUBLIC_TO_EVERYONE" if "PUBLIC_TO_EVERYONE" in options else options[0]
            data = self._post(
                "/post/publish/video/init/",
                {
                    "post_info": {
                        "title": caption[:2200],
                        "privacy_level": privacy,
                        "disable_duet": False,
                        "disable_comment": False,
                        "disable_stitch": False,
                        "video_cover_timestamp_ms": 1500,
                        "is_aigc": is_aigc,
                    },
                    "source_info": source,
                },
            )
        else:
            data = self._post("/post/publish/inbox/video/init/", {"source_info": source})

        self._put_chunks(data["upload_url"], video, size, chunk_size, chunks)
        return data["publish_id"]

    def _put_chunks(self, url: str, video: Path, size: int, chunk_size: int, chunks: int) -> None:
        with video.open("rb") as fh:
            for i in range(chunks):
                start = i * chunk_size
                end = size - 1 if i == chunks - 1 else start + chunk_size - 1
                fh.seek(start)
                body = fh.read(end - start + 1)
                resp = httpx.put(
                    url,
                    content=body,
                    headers={
                        "Content-Type": "video/mp4",
                        "Content-Length": str(len(body)),
                        "Content-Range": f"bytes {start}-{end}/{size}",
                    },
                    timeout=300,
                )
                raise_for_status(resp)

    def status(self, publish_id: str) -> dict:
        return self._post("/post/publish/status/fetch/", {"publish_id": publish_id})

    def wait_until_done(self, publish_id: str, wait_seconds: int = 600) -> dict:
        deadline = time.monotonic() + wait_seconds
        while True:
            data = self.status(publish_id)
            state = data.get("status")
            if state in ("PUBLISH_COMPLETE", "SEND_TO_USER_INBOX"):
                return data
            if state == "FAILED":
                raise ApiError(f"TikTok publish failed: {data.get('fail_reason')}")
            if time.monotonic() > deadline:
                raise ApiError(f"TikTok publish {publish_id} still {state} after {wait_seconds}s")
            time.sleep(10)

    # --- metrics ---
    def video_metrics(self, video_ids: list[str]) -> dict[str, dict]:
        data = self._post(
            "/video/query/",
            {"filters": {"video_ids": video_ids}},
            params={"fields": "id,view_count,like_count,comment_count,share_count"},
        )
        return {
            str(v["id"]): {
                "views": v.get("view_count"),
                "likes": v.get("like_count"),
                "comments": v.get("comment_count"),
                "shares": v.get("share_count"),
                "saves": None,
                "avg_watch_time": None,
                "raw": v,
            }
            for v in data.get("videos", [])
        }
