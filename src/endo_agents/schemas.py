"""Structured outputs exchanged between agents."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

FormatId = Literal["cau-hoi", "goi-ten", "ngo-nhan", "thuc-hanh", "doc-cham"]
HookStyle = Literal["recognition", "naming", "reversal", "question", "permission", "micro_moment"]
BeatRole = Literal["hook", "line", "myth", "truth", "step", "quote", "question", "close"]
FORMATS: tuple[str, ...] = ("cau-hoi", "goi-ten", "ngo-nhan", "thuc-hanh", "doc-cham")


# --- ingest ---
class IdeaSeed(BaseModel):
    angle: str = Field(description="Tên ngắn của góc khai thác, 3–8 chữ.")
    insight: str = Field(description="Ý chính trong 1–2 câu, giọng tác giả.")
    quotes: list[str] = Field(description="1–4 câu trích NGUYÊN VĂN từ bài, mỗi câu ≤ 35 chữ.")
    metaphor: str | None = Field(default=None, description="Ẩn dụ đắt giá trong bài liên quan tới ý này.")
    practice: str | None = Field(default=None, description="Thực hành nhỏ trong bài, nếu có.")
    question: str = Field(description="Một câu hỏi phản tư người xem có thể mang theo.")
    emotion: str = Field(description="Cảm xúc chính người xem đang có khi gặp ý này.")
    hook_seed: str = Field(description="Một gợi ý hook ≤ 14 chữ.")
    formats: list[FormatId] = Field(description="Các format phù hợp, xếp theo mức độ phù hợp giảm dần.")


class IngestResult(BaseModel):
    ideas: list[IdeaSeed] = Field(description="4–6 ý tưởng độc lập, mỗi ý đủ cho một video.")


# --- writer ---
class Hook(BaseModel):
    style: HookStyle
    text: str = Field(description="≤ 14 chữ.")


class Beat(BaseModel):
    role: BeatRole
    text: str = Field(description="Một câu hoặc một cụm câu ngắn, đọc thành tiếng được.")
    emphasis: list[str] = Field(default_factory=list, description="1–2 từ/cụm từ trong text cần làm nổi.")


class Script(BaseModel):
    hooks: list[Hook] = Field(min_length=3, max_length=3, description="Đúng 3 hook, 3 style khác nhau.")
    beats: list[Beat] = Field(description="Phần thân, KHÔNG gồm hook. Theo đúng cấu trúc của format.")
    caption: str = Field(description="Dòng 1: câu bổ sung ≤ 90 ký tự. Dòng 2: câu hỏi mời bình luận.")
    hashtags: list[str] = Field(description="3–5 hashtag, bắt đầu bằng #.")
    visual_keywords: list[str] = Field(
        description="3–5 từ khóa TIẾNG ANH mô tả cảnh quay chậm, tĩnh lặng để tìm stock footage."
    )
    self_check: str = Field(description="1–2 câu tự kiểm tra script đã đúng luật cứng chưa.")


# --- critic ---
class CriticScores(BaseModel):
    hook: float = Field(ge=0, le=10)
    philosophy: float = Field(ge=0, le=10)
    single_idea: float = Field(ge=0, le=10)
    voice: float = Field(ge=0, le=10)
    ending: float = Field(ge=0, le=10)
    readability: float = Field(ge=0, le=10)


class CriticReport(BaseModel):
    best_hook_index: int = Field(ge=0, le=2)
    scores: CriticScores = Field(description="Điểm cho script khi dùng hook tốt nhất.")
    violations: list[str] = Field(default_factory=list, description="Luật cứng bị vi phạm (trích câu cụ thể).")
    feedback: list[str] = Field(description="Góp ý sửa cụ thể, có thể hành động được.")


# --- qa ---
class QAReport(BaseModel):
    passed: bool
    issues: list[str] = Field(default_factory=list)
