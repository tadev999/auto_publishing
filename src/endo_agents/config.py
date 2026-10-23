from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]


class Slot(BaseModel):
    time: str
    format: str


class RampStep(BaseModel):
    until_day: int
    formats: list[str]


class ScheduleCfg(BaseModel):
    queue_days: int = 7
    slots: list[Slot]
    ramp_up: list[RampStep] = []
    current_mach_ratio: float = 0.6
    same_article_gap_days: int = 3
    remake_after_days: int = 60


class FormatCfg(BaseModel):
    label: str
    duration: tuple[int, int]
    visual: str
    music_mood: str


class CriticCfg(BaseModel):
    max_rounds: int = 3
    pass_total: float = 8.0
    pass_philosophy: float = 9
    weights: dict[str, float]


class RenderCfg(BaseModel):
    fps: int = 30
    width: int = 1080
    height: int = 1920
    tail_seconds: float = 1.8
    music_volume: float = 0.12
    loudness_lufs: float = -14
    duration_slack: tuple[float, float] = (3, 8)


class PublishCfg(BaseModel):
    platforms: list[str]
    dry_run: bool = True
    instagram_graph_version: str = "v23.0"
    instagram_ai_disclosure: str = ""
    tiktok_mode: str = "inbox"
    tiktok_ai_label: bool = True
    max_attempts: int = 3


class AnalyticsCfg(BaseModel):
    score_weights: dict[str, float]
    remake_top_ratio: float = 0.2


class VoiceCfg(BaseModel):
    model_id: str
    language_code: str = "vi"
    stability: float = 0.55
    similarity_boost: float = 0.8
    style: float = 0.0
    speed: float = 1.0


class Settings(BaseModel):
    timezone: str
    brand: dict
    paths: dict[str, str]
    models: dict[str, str]
    voice: VoiceCfg
    schedule: ScheduleCfg
    formats: dict[str, FormatCfg]
    critic: CriticCfg
    render: RenderCfg
    publish: PublishCfg
    analytics: AnalyticsCfg
    env: dict[str, str] = Field(default_factory=dict, exclude=True)

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    def path(self, key: str) -> Path:
        p = Path(self.paths[key])
        return p if p.is_absolute() else ROOT / p

    @property
    def data_dir(self) -> Path:
        d = self.path("data_dir")
        d.mkdir(parents=True, exist_ok=True)
        return d

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.db"

    def secret(self, name: str, required: bool = True) -> str:
        value = self.env.get(name, "")
        if required and not value:
            raise MissingSecret(name)
        return value


class MissingSecret(RuntimeError):
    def __init__(self, name: str):
        super().__init__(f"Missing secret {name}. Add it to .env (see .env.example).")
        self.name = name


SECRET_NAMES = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_VOICE_ID",
    "PEXELS_API_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "IG_USER_ID",
    "IG_ACCESS_TOKEN",
    "TIKTOK_CLIENT_KEY",
    "TIKTOK_CLIENT_SECRET",
    "TIKTOK_REDIRECT_URI",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
]


@lru_cache
def get_settings(config_path: str | None = None) -> Settings:
    load_dotenv(ROOT / ".env")
    path = Path(config_path) if config_path else ROOT / "config" / "settings.yaml"
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    raw["env"] = {k: os.environ.get(k, "") for k in SECRET_NAMES}
    return Settings.model_validate(raw)
