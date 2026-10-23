"""Ingest agent: split each article into 4–6 independent video ideas ("seeds")."""

from __future__ import annotations

import json

from ..config import MissingSecret
from ..content import Article, load_articles, normalize
from ..context import Ctx
from ..db import utcnow
from ..llm import LLM
from ..schemas import IdeaSeed, IngestResult
from ..skills import bundle

AGENT = "ingest"

ROLE = """Bạn là biên tập viên nội dung của dự án Endogenism (Nội Sinh).
Nhiệm vụ: đọc MỘT bài viết và tách thành 4–6 ý tưởng video ngắn ĐỘC LẬP (mỗi ý tưởng đủ cho một video 15–60 giây).

Yêu cầu:
- Mỗi ý tưởng một góc khác nhau, không trùng lặp.
- `quotes` phải là câu trích NGUYÊN VĂN từ bài (giữ nguyên chữ và dấu câu, có thể bỏ ký hiệu markdown). Không sửa, không bịa.
- `practice` chỉ điền nếu bài thực sự có một thực hành cụ thể.
- `formats`: chọn trong cau-hoi, goi-ten, ngo-nhan, thuc-hanh, doc-cham, xếp theo mức phù hợp.
  - thuc-hanh chỉ khi có `practice`.
  - doc-cham chỉ khi có đoạn trích đọc to lên nghe đẹp.
  - ngo-nhan khi bài phá một niềm tin phổ biến.
- Cố gắng để các ý tưởng của bài phủ được nhiều format khác nhau.
- Mọi ý tưởng phải tuân thủ luật cứng của Endogenism."""


def _user_prompt(article: Article) -> str:
    return (
        f"Mạch {article.mach_index}: {article.mach_title}\n"
        f"Bài {article.number}: {article.title}\n\n"
        f"<article>\n{article.body}\n</article>"
    )


def verified_seed(seed: IdeaSeed, article: Article) -> IdeaSeed:
    """Drop quotes that are not verbatim in the source, and formats that depend on missing material."""
    source = normalize(article.body)
    quotes = [q for q in seed.quotes if normalize(q) and normalize(q) in source]
    formats = list(dict.fromkeys(seed.formats))
    if not quotes and "doc-cham" in formats:
        formats.remove("doc-cham")
    if not seed.practice and "thuc-hanh" in formats:
        formats.remove("thuc-hanh")
    return seed.model_copy(update={"quotes": quotes, "formats": formats or ["goi-ten"]})


def ingest_article(ctx: Ctx, llm: LLM, article: Article) -> int:
    result = llm.claude(
        model=ctx.settings.models["ingest"],
        system=[bundle("endogenism-guardrails", "endogenism-voice"), ROLE],
        user=_user_prompt(article),
        schema=IngestResult,
        max_tokens=6000,
        temperature=0.4,
    )
    seeds = [verified_seed(s, article) for s in result.ideas]
    db = ctx.db
    with db.tx():
        db.run(
            """INSERT INTO articles(id, mach_slug, mach_index, mach_title, number, title, path, content_hash, ingested_at)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_hash=excluded.content_hash,
                   ingested_at=excluded.ingested_at, path=excluded.path""",
            article.id,
            article.mach_slug,
            article.mach_index,
            article.mach_title,
            article.number,
            article.title,
            str(article.path),
            article.content_hash,
            utcnow(),
        )
        # Ideas already turned into videos are kept for history; only unused ones are replaced.
        db.run("DELETE FROM ideas WHERE article_id = ? AND status = 'available'", article.id)
        for s in seeds:
            db.run(
                """INSERT INTO ideas(article_id, angle, insight, quotes, metaphor, practice, question, emotion,
                                     hook_seed, formats, primary_format, created_at)
                   VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                article.id,
                s.angle,
                s.insight,
                json.dumps(s.quotes, ensure_ascii=False),
                s.metaphor,
                s.practice,
                s.question,
                s.emotion,
                s.hook_seed,
                json.dumps(s.formats),
                s.formats[0],
                utcnow(),
            )
    return len(seeds)


def run(ctx: Ctx, llm: LLM, force: bool = False, limit: int | None = None, only: str | None = None) -> int:
    articles = load_articles(ctx.settings.path("content_dir"))
    if only:
        articles = [a for a in articles if a.id == only]
    done = 0
    for article in articles:
        if limit is not None and done >= limit:
            break
        row = ctx.db.one("SELECT content_hash FROM articles WHERE id = ?", article.id)
        if row and row["content_hash"] == article.content_hash and not force:
            continue
        try:
            n = ingest_article(ctx, llm, article)
            ctx.event(AGENT, f"{article.id} → {n} ý tưởng")
            done += 1
        except MissingSecret:
            raise
        except Exception as exc:  # one bad article must not stop the batch
            ctx.event(AGENT, f"{article.id} lỗi: {exc}", level="error")
    total = ctx.db.one("SELECT COUNT(*) AS n FROM ideas")["n"]
    ctx.event(AGENT, f"Hoàn tất: {done} bài mới/cập nhật, kho có {total} ý tưởng")
    return done
