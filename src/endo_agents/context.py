from __future__ import annotations

import logging
from dataclasses import dataclass

from rich.logging import RichHandler

from .config import Settings, get_settings
from .db import DB


def setup_logging(settings: Settings, verbose: bool = False) -> logging.Logger:
    logger = logging.getLogger("endo")
    if logger.handlers:
        return logger
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    console = RichHandler(rich_tracebacks=True, show_path=False, markup=False)
    console.setFormatter(logging.Formatter("%(message)s"))
    log_dir = settings.data_dir / "logs"
    log_dir.mkdir(exist_ok=True)
    file = logging.FileHandler(log_dir / "endo.log", encoding="utf-8")
    file.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(console)
    logger.addHandler(file)
    return logger


@dataclass
class Ctx:
    settings: Settings
    db: DB
    logger: logging.Logger

    def event(self, agent: str, message: str, video_id: int | None = None, level: str = "info") -> None:
        prefix = f"[{agent}]" + (f" #{video_id}" if video_id else "")
        self.logger.log(logging.getLevelName(level.upper()), f"{prefix} {message}")
        self.db.log(agent, message, video_id=video_id, level=level)


def make_ctx(verbose: bool = False) -> Ctx:
    settings = get_settings()
    return Ctx(settings=settings, db=DB(settings.db_path), logger=setup_logging(settings, verbose))
