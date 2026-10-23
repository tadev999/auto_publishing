from __future__ import annotations

import json
import logging

import pytest

from endo_agents.config import get_settings
from endo_agents.context import Ctx
from endo_agents.db import DB, utcnow


@pytest.fixture
def ctx(tmp_path) -> Ctx:
    base = get_settings()
    settings = base.model_copy(update={"paths": {**base.paths, "data_dir": str(tmp_path)}})
    return Ctx(settings=settings, db=DB(tmp_path / "app.db"), logger=logging.getLogger("endo-test"))


def add_article(ctx: Ctx, number: int, mach: int = 1) -> str:
    aid = f"bai-{number:03d}"
    ctx.db.run(
        """INSERT INTO articles(id, mach_slug, mach_index, mach_title, number, title, path, content_hash)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?)""",
        aid,
        f"mach-{mach}-x",
        mach,
        f"Mạch {mach}",
        number,
        f"Bài {number}",
        "/dev/null",
        "h",
    )
    return aid


def add_idea(ctx: Ctx, article_id: str, formats: list[str]) -> int:
    return ctx.db.run(
        """INSERT INTO ideas(article_id, angle, insight, quotes, question, emotion, hook_seed, formats,
                             primary_format, created_at)
           VALUES(?, 'góc', 'ý', '[]', 'hỏi?', 'mệt', 'hook', ?, ?, ?)""",
        article_id,
        json.dumps(formats),
        formats[0],
        utcnow(),
    )
