from __future__ import annotations

import logging

import httpx

from ..config import Settings

log = logging.getLogger("endo")


def notify(settings: Settings, text: str) -> None:
    """Best-effort Telegram message; silently skipped when not configured."""
    token = settings.secret("TELEGRAM_BOT_TOKEN", required=False)
    chat_id = settings.secret("TELEGRAM_CHAT_ID", required=False)
    if not (token and chat_id):
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text[:4000], "disable_web_page_preview": True},
            timeout=15,
        ).raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("Telegram notify failed: %s", type(exc).__name__)
