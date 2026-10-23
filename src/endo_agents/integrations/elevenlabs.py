from __future__ import annotations

import base64
from dataclasses import dataclass

import httpx

from ..config import Settings
from .http import http_retry, raise_for_status

BASE = "https://api.elevenlabs.io/v1"


@dataclass
class Speech:
    audio: bytes
    characters: list[str]
    starts: list[float]
    ends: list[float]


@http_retry
def synthesize(settings: Settings, text: str) -> Speech:
    v = settings.voice
    resp = httpx.post(
        f"{BASE}/text-to-speech/{settings.secret('ELEVENLABS_VOICE_ID')}/with-timestamps",
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": settings.secret("ELEVENLABS_API_KEY")},
        json={
            "text": text,
            "model_id": v.model_id,
            "language_code": v.language_code,
            "voice_settings": {
                "stability": v.stability,
                "similarity_boost": v.similarity_boost,
                "style": v.style,
                "use_speaker_boost": True,
                "speed": v.speed,
            },
        },
        timeout=180,
    )
    data = raise_for_status(resp).json()
    alignment = data.get("alignment") or data.get("normalized_alignment")
    if not alignment:
        raise RuntimeError("ElevenLabs response has no alignment data")
    return Speech(
        audio=base64.b64decode(data["audio_base64"]),
        characters=alignment["characters"],
        starts=alignment["character_start_times_seconds"],
        ends=alignment["character_end_times_seconds"],
    )
