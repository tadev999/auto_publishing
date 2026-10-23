from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

import frontmatter

_MACH_RE = re.compile(r"^mach-(\d+)-")
_BAI_RE = re.compile(r"^bai-(\d+)\.md$")


@dataclass(frozen=True)
class Article:
    id: str
    mach_slug: str
    mach_index: int
    mach_title: str
    number: int
    title: str
    path: Path
    body: str

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.body.encode("utf-8")).hexdigest()


def _ordered(folder: Path, names: list[str]) -> list[str]:
    meta = folder / "_meta.json"
    if not meta.exists():
        return sorted(names)
    order: dict[str, int] = json.loads(meta.read_text(encoding="utf-8")).get("order", {})
    return sorted(names, key=lambda n: (order.get(n, 10_000), n))


def load_articles(content_dir: Path) -> list[Article]:
    machs = [p.name for p in content_dir.iterdir() if p.is_dir() and _MACH_RE.match(p.name)]
    articles: list[Article] = []
    for mach_slug in _ordered(content_dir, machs):
        folder = content_dir / mach_slug
        mach_index = int(_MACH_RE.match(mach_slug).group(1))  # type: ignore[union-attr]
        mach_title = json.loads((folder / "_meta.json").read_text(encoding="utf-8")).get("title", mach_slug)
        files = [p.name for p in folder.iterdir() if _BAI_RE.match(p.name)]
        for name in _ordered(folder, files):
            post = frontmatter.load(folder / name)
            articles.append(
                Article(
                    id=name.removesuffix(".md"),
                    mach_slug=mach_slug,
                    mach_index=mach_index,
                    mach_title=mach_title,
                    number=int(_BAI_RE.match(name).group(1)),  # type: ignore[union-attr]
                    title=str(post.get("title", name)),
                    path=folder / name,
                    body=post.content.strip(),
                )
            )
    return articles


def article_body(ctx, article_id: str) -> str:
    row = ctx.db.one("SELECT path FROM articles WHERE id = ?", article_id)
    if row is None:
        raise KeyError(f"Article {article_id} has not been ingested")
    return frontmatter.load(row["path"]).content.strip()


def normalize(text: str) -> str:
    """Collapse whitespace and markdown emphasis so verbatim quotes can be matched against the source."""
    text = re.sub(r"[*_`>#]", "", text)
    return re.sub(r"\s+", " ", text).strip().lower()
