from endo_agents.captions import mark_emphasis, paginate, spoken_text, words_from_alignment

BEATS = [
    {"role": "hook", "text": "Bạn ngủ đủ", "emphasis": []},
    {"role": "step", "text": "Thở chậm ba lần.", "emphasis": ["thở chậm"]},
    {"role": "step", "text": "Gọi tên nó, không cần sửa.", "emphasis": []},
]


def _uniform_alignment(text: str, per_char: float = 0.05):
    starts = [i * per_char for i in range(len(text))]
    ends = [s + per_char for s in starts]
    return starts, ends


def test_spoken_text_adds_terminal_punctuation_and_spans():
    text, spans = spoken_text(BEATS)
    assert text.startswith("Bạn ngủ đủ. Thở")
    for (s, e), beat in zip(spans, BEATS, strict=True):
        assert text[s:e].rstrip(".") == beat["text"].rstrip(".")


def test_words_carry_beat_index_and_timing():
    text, spans = spoken_text(BEATS)
    words = words_from_alignment(text, *_uniform_alignment(text), spans)
    assert [w.text for w in words[:3]] == ["Bạn", "ngủ", "đủ."]
    assert {w.beat for w in words} == {0, 1, 2}
    assert all(w.end > w.start for w in words)
    assert words == sorted(words, key=lambda w: w.start)


def test_emphasis_is_marked_within_its_beat_only():
    text, spans = spoken_text(BEATS)
    words = words_from_alignment(text, *_uniform_alignment(text), spans)
    mark_emphasis(words, BEATS)
    assert [w.text for w in words if w.emphasis] == ["Thở", "chậm"]


def test_pages_never_cross_beats_and_number_steps():
    text, spans = spoken_text(BEATS)
    words = words_from_alignment(text, *_uniform_alignment(text), spans)
    pages = paginate(words, BEATS, total_duration=10.0)
    for p in pages:
        assert len({w.beat for w in p.words}) == 1
    assert [p.step for p in pages if p.role == "step"][:1] == [1]
    assert max(p.step for p in pages if p.role == "step") == 2
    # Pages tile the timeline with no gaps.
    for a, b in zip(pages, pages[1:], strict=False):
        assert a.end == b.start
    assert pages[-1].end == 10.0


def test_long_beat_is_split_into_short_pages():
    beats = [{"role": "line", "text": " ".join(f"từ{i}" for i in range(20)), "emphasis": []}]
    text, spans = spoken_text(beats)
    words = words_from_alignment(text, *_uniform_alignment(text), spans)
    pages = paginate(words, beats, total_duration=5.0, max_words=7)
    assert all(len(p.words) <= 7 for p in pages)
    assert sum(len(p.words) for p in pages) == 20
