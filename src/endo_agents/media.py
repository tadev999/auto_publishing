"""Thin wrappers around ffmpeg / ffprobe."""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


class MediaError(RuntimeError):
    pass


def video_dir(data_dir: Path, video_id: int) -> Path:
    d = data_dir / "media" / f"{video_id:05d}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def require(binary: str) -> str:
    path = shutil.which(binary)
    if not path:
        raise MediaError(f"'{binary}' not found in PATH. Install ffmpeg (brew install ffmpeg / apt install ffmpeg).")
    return path


def _run(args: list[str], timeout: int = 600) -> subprocess.CompletedProcess:
    proc = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise MediaError(f"{Path(args[0]).name} failed: {proc.stderr.strip()[-800:]}")
    return proc


@dataclass
class Probe:
    duration: float
    width: int
    height: int
    has_audio: bool


def probe(path: Path) -> Probe:
    out = _run([require("ffprobe"), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)])
    data = json.loads(out.stdout)
    video = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    if video is None:
        raise MediaError(f"No video stream in {path}")
    return Probe(
        duration=float(data["format"]["duration"]),
        width=int(video["width"]),
        height=int(video["height"]),
        has_audio=any(s["codec_type"] == "audio" for s in data["streams"]),
    )


def audio_duration(path: Path) -> float:
    out = _run([require("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return float(out.stdout.strip())


def normalize_loudness(src: Path, dest: Path, lufs: float) -> Path:
    _run(
        [
            require("ffmpeg"),
            "-y",
            "-i",
            str(src),
            "-c:v",
            "copy",
            "-af",
            f"loudnorm=I={lufs}:TP=-1.5:LRA=11",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-movflags",
            "+faststart",
            str(dest),
        ]
    )
    return dest


def extract_frames(path: Path, times: list[float], out_dir: Path, width: int = 540) -> list[bytes]:
    out_dir.mkdir(parents=True, exist_ok=True)
    frames: list[bytes] = []
    for i, t in enumerate(times):
        target = out_dir / f"frame_{i}.jpg"
        _run(
            [
                require("ffmpeg"),
                "-y",
                "-ss",
                f"{t:.2f}",
                "-i",
                str(path),
                "-frames:v",
                "1",
                "-vf",
                f"scale={width}:-2",
                "-q:v",
                "4",
                str(target),
            ]
        )
        frames.append(target.read_bytes())
    return frames
