from __future__ import annotations

import json
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from enum import Enum, StrEnum
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    id            TEXT PRIMARY KEY,
    mach_slug     TEXT NOT NULL,
    mach_index    INTEGER NOT NULL,
    mach_title    TEXT NOT NULL,
    number        INTEGER NOT NULL,
    title         TEXT NOT NULL,
    path          TEXT NOT NULL,
    content_hash  TEXT NOT NULL,
    ingested_at   TEXT
);

CREATE TABLE IF NOT EXISTS ideas (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id     TEXT NOT NULL REFERENCES articles(id),
    angle          TEXT NOT NULL,
    insight        TEXT NOT NULL,
    quotes         TEXT NOT NULL DEFAULT '[]',
    metaphor       TEXT,
    practice       TEXT,
    question       TEXT,
    emotion        TEXT,
    hook_seed      TEXT,
    formats        TEXT NOT NULL DEFAULT '[]',
    primary_format TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'available',
    created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    idea_id        INTEGER NOT NULL REFERENCES ideas(id),
    article_id     TEXT NOT NULL REFERENCES articles(id),
    format         TEXT NOT NULL,
    slot_at        TEXT NOT NULL,
    episode        INTEGER NOT NULL,
    status         TEXT NOT NULL,
    attempts       INTEGER NOT NULL DEFAULT 0,
    critic_rounds  INTEGER NOT NULL DEFAULT 0,
    remake_of      INTEGER REFERENCES videos(id),
    hook_style     TEXT,
    script         TEXT,
    critic         TEXT,
    media          TEXT NOT NULL DEFAULT '{}',
    r2_key         TEXT,
    error          TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_videos_slot ON videos(slot_at) WHERE status != 'failed';
CREATE INDEX IF NOT EXISTS ix_videos_status ON videos(status);

CREATE TABLE IF NOT EXISTS publications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id      INTEGER NOT NULL REFERENCES videos(id),
    platform      TEXT NOT NULL,
    status        TEXT NOT NULL,
    external_id   TEXT,
    post_id       TEXT,
    permalink     TEXT,
    attempts      INTEGER NOT NULL DEFAULT 0,
    error         TEXT,
    published_at  TEXT,
    UNIQUE(video_id, platform)
);

CREATE TABLE IF NOT EXISTS metrics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    publication_id  INTEGER NOT NULL REFERENCES publications(id),
    checkpoint      TEXT NOT NULL,
    views           INTEGER,
    likes           INTEGER,
    comments        INTEGER,
    shares          INTEGER,
    saves           INTEGER,
    avg_watch_time  REAL,
    score           REAL,
    raw             TEXT,
    fetched_at      TEXT NOT NULL,
    UNIQUE(publication_id, checkpoint)
);

CREATE TABLE IF NOT EXISTS kv (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    video_id  INTEGER,
    agent     TEXT NOT NULL,
    level     TEXT NOT NULL,
    message   TEXT NOT NULL
);
"""


class VideoStatus(StrEnum):
    PLANNED = "planned"
    SCRIPTED = "scripted"
    APPROVED = "approved"
    VOICED = "voiced"
    RENDERED = "rendered"
    QA_PASSED = "qa_passed"
    QUEUED = "queued"
    PUBLISHED = "published"
    MEASURED = "measured"
    FAILED = "failed"


def utcnow() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class DB:
    def __init__(self, path: Path):
        self.path = path
        self.conn = sqlite3.connect(path, timeout=30, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)
        # The DB holds OAuth tokens; keep it private to the owner.
        os.chmod(path, 0o600)

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        self.conn.execute("BEGIN")
        try:
            yield self.conn
            self.conn.execute("COMMIT")
        except Exception:
            self.conn.execute("ROLLBACK")
            raise

    def all(self, sql: str, *params: Any) -> list[sqlite3.Row]:
        return self.conn.execute(sql, params).fetchall()

    def one(self, sql: str, *params: Any) -> sqlite3.Row | None:
        return self.conn.execute(sql, params).fetchone()

    def run(self, sql: str, *params: Any) -> int:
        return self.conn.execute(sql, params).lastrowid or 0

    # --- key/value ---
    def get_kv(self, key: str, default: Any = None) -> Any:
        row = self.one("SELECT value FROM kv WHERE key = ?", key)
        return json.loads(row["value"]) if row else default

    def set_kv(self, key: str, value: Any) -> None:
        self.run(
            "INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            key,
            json.dumps(value, ensure_ascii=False),
        )

    # --- videos ---
    def video(self, video_id: int) -> sqlite3.Row:
        row = self.one("SELECT * FROM videos WHERE id = ?", video_id)
        if row is None:
            raise KeyError(f"video {video_id} not found")
        return row

    def update_video(self, video_id: int, **fields: Any) -> None:
        for k, v in fields.items():
            if isinstance(v, (dict, list)):
                fields[k] = json.dumps(v, ensure_ascii=False)
            elif isinstance(v, Enum):
                fields[k] = v.value
        fields["updated_at"] = utcnow()
        cols = ", ".join(f"{k} = ?" for k in fields)
        self.run(f"UPDATE videos SET {cols} WHERE id = ?", *fields.values(), video_id)

    def log(self, agent: str, message: str, video_id: int | None = None, level: str = "info") -> None:
        self.run(
            "INSERT INTO events(ts, video_id, agent, level, message) VALUES(?, ?, ?, ?, ?)",
            utcnow(),
            video_id,
            agent,
            level,
            message,
        )


def loads(value: str | None, default: Any = None) -> Any:
    return json.loads(value) if value else default
