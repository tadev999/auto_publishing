"""Turn character-level TTS alignment into word timings and on-screen caption pages."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field

_WORD_STRIP = re.compile(r"^[\W_]+|[\W_]+$", re.UNICODE)
_SENTENCE_END = re.compile(r"[.!?…:;,—]$")


@dataclass
class Word:
    text: str
    start: float
    end: float
    beat: int
    emphasis: bool = False


@dataclass
class Page:
    beat: int
    role: str
    start: float
    end: float
    words: list[Word] = field(default_factory=list)
    step: int | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def spoken_text(beats: list[dict]) -> tuple[str, list[tuple[int, int]]]:
    """Join beat texts into one TTS input and return each beat's [start, end) character span."""
    parts: list[str] = []
    spans: list[tuple[int, int]] = []
    cursor = 0
    for beat in beats:
        text = beat["text"].strip()
        if text and text[-1] not in ".!?…":
            text += "."
        if parts:
            parts.append(" ")
            cursor += 1
        spans.append((cursor, cursor + len(text)))
        parts.append(text)
        cursor += len(text)
    return "".join(parts), spans


def words_from_alignment(
    text: str,
    starts: list[float],
    ends: list[float],
    spans: list[tuple[int, int]],
) -> list[Word]:
    if not (len(text) == len(starts) == len(ends)):
        raise ValueError("alignment length does not match text length")

    def beat_of(idx: int) -> int:
        for b, (s, e) in enumerate(spans):
            if s <= idx < e:
                return b
        return len(spans) - 1

    words: list[Word] = []
    i = 0
    while i < len(text):
        if text[i].isspace():
            i += 1
            continue
        j = i
        while j < len(text) and not text[j].isspace():
            j += 1
        words.append(Word(text=text[i:j], start=starts[i], end=ends[j - 1], beat=beat_of(i)))
        i = j
    return words


def _norm(token: str) -> str:
    return _WORD_STRIP.sub("", token).lower()


def mark_emphasis(words: list[Word], beats: list[dict]) -> None:
    for b, beat in enumerate(beats):
        targets = {_norm(t) for phrase in beat.get("emphasis", []) for t in phrase.split()}
        targets.discard("")
        for w in words:
            if w.beat == b and _norm(w.text) in targets:
                w.emphasis = True


def paginate(
    words: list[Word],
    beats: list[dict],
    total_duration: float,
    max_words: int = 7,
) -> list[Page]:
    """Group words into short pages. Pages never span two beats and prefer to break at punctuation."""
    pages: list[Page] = []
    step_counter = 0
    current: list[Word] = []

    def flush() -> None:
        nonlocal step_counter
        if not current:
            return
        b = current[0].beat
        role = beats[b]["role"]
        step = None
        if role == "step":
            if not pages or pages[-1].beat != b:
                step_counter += 1
            step = step_counter
        pages.append(
            Page(beat=b, role=role, start=current[0].start, end=current[-1].end, words=list(current), step=step)
        )
        current.clear()

    for w in words:
        if current and (w.beat != current[0].beat or len(current) >= max_words):
            flush()
        current.append(w)
        if len(current) >= 3 and _SENTENCE_END.search(w.text):
            flush()
    flush()

    # Each page stays on screen until the next one starts.
    for a, b in zip(pages, pages[1:], strict=False):
        a.end = b.start
    if pages:
        pages[-1].end = total_duration
    return pages
