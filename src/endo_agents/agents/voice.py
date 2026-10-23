"""Voice agent: approved script → cloned-voice narration + word timings + caption pages."""

from __future__ import annotations

import json
import sqlite3

from ..captions import mark_emphasis, paginate, spoken_text, words_from_alignment
from ..context import Ctx
from ..db import VideoStatus, loads
from ..integrations import elevenlabs
from ..media import video_dir

AGENT = "voice"


def run_one(ctx: Ctx, video: sqlite3.Row) -> None:
    beats = loads(video["script"])["final_beats"]
    text, spans = spoken_text(beats)
    speech = elevenlabs.synthesize(ctx.settings, text)

    aligned = "".join(speech.characters)
    if aligned != text:
        # The API may normalise characters; realign spans to the returned text when lengths differ.
        text, spans = aligned, _rescale_spans(spans, len(text), len(aligned))
    words = words_from_alignment(text, speech.starts, speech.ends, spans)
    mark_emphasis(words, beats)
    speech_end = speech.ends[-1] if speech.ends else 0.0
    duration = speech_end + ctx.settings.render.tail_seconds
    pages = paginate(words, beats, total_duration=duration)

    out = video_dir(ctx.settings.data_dir, video["id"])
    public = out / "public"
    public.mkdir(exist_ok=True)
    (public / "voice.mp3").write_bytes(speech.audio)
    (out / "captions.json").write_text(
        json.dumps(
            {"speech_end": speech_end, "duration": duration, "pages": [p.to_dict() for p in pages]},
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    media = loads(video["media"], {})
    media.update({"voice": "voice.mp3", "captions": "captions.json", "speech_seconds": round(speech_end, 2)})
    ctx.db.update_video(video["id"], status=VideoStatus.VOICED, media=media)
    ctx.event(AGENT, f"Giọng đọc {speech_end:.1f}s · {len(words)} từ · {len(pages)} khung phụ đề", video_id=video["id"])


def _rescale_spans(spans: list[tuple[int, int]], old_len: int, new_len: int) -> list[tuple[int, int]]:
    ratio = new_len / max(old_len, 1)
    return [(round(s * ratio), round(e * ratio)) for s, e in spans]
