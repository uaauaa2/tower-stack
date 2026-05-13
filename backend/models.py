"""Pydantic models for API request/response."""

from pydantic import BaseModel, field_validator
from typing import Optional

VALID_THEMES = {"classic", "cyberpunk", "ascii", "pixel"}


class ScoreSubmit(BaseModel):
    init_data: str
    score: int
    height: int
    best_combo: int = 0
    perfect_count: int = 0
    duration_ms: int = 0
    theme: str = "classic"

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, v: str) -> str:
        if v not in VALID_THEMES:
            raise ValueError(f"Invalid theme: {v}. Must be one of {VALID_THEMES}")
        return v

    @field_validator("best_combo", "perfect_count")
    @classmethod
    def validate_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Must be non-negative")
        return v

    @field_validator("duration_ms")
    @classmethod
    def validate_duration(cls, v: int) -> int:
        if v < 0 or v > 3600000:  # max 1 hour
            raise ValueError("Invalid duration")
        return v


class ScoreResponse(BaseModel):
    ok: bool
    rank: int
    personal_best: bool
    new_milestones: list[str]


class LeaderboardEntry(BaseModel):
    rank: int
    username: str
    score: int
    height: int
    date: str


class LeaderboardResponse(BaseModel):
    period: str
    entries: list[LeaderboardEntry]


class PlayerStats(BaseModel):
    username: Optional[str] = None
    total_games: int
    best_score: int
    best_height: int
    best_combo: int
    avg_score: int
    avg_height: int
    total_perfects: int
    total_playtime_min: int
    rank: int
    achievements: list[str]


class StatsRequest(BaseModel):
    init_data: str


class HealthResponse(BaseModel):
    status: str
    db: str
