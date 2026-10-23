from __future__ import annotations

from functools import lru_cache

import frontmatter

from .config import ROOT

SKILLS_DIR = ROOT / "skills"


@lru_cache
def load_skill(name: str) -> str:
    path = SKILLS_DIR / name / "SKILL.md"
    if not path.exists():
        raise FileNotFoundError(f"Skill not found: {path}")
    return frontmatter.load(path).content.strip()


def bundle(*names: str) -> str:
    return "\n\n---\n\n".join(f'<skill name="{n}">\n{load_skill(n)}\n</skill>' for n in names)
