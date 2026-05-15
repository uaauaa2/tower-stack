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

    @field_validator("init_data")
    @classmethod
    def validate_init_data_len(cls, v: str) -> str:
        if len(v) > 4096:
            raise ValueError("init_data too long")
        return v

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, v: str) -> str:
        if v not in VALID_THEMES:
            raise ValueError(f"Invalid theme: {v}. Must be one of {VALID_THEMES}")
        return v

    @field_validator("score")
    @classmethod
    def validate_score_range(cls, v: int) -> int:
        if v < 0 or v > 250000:
            raise ValueError("Score out of range")
        return v

    @field_validator("height")
    @classmethod
    def validate_height_range(cls, v: int) -> int:
        if v < 0 or v > 5000:
            raise ValueError("Height out of range")
        return v

    def model_post_init(self, __context) -> None:
        """Cross-validate score against height."""
        # Allow score=0 with height=0 (no game played)
        if self.height == 0 and self.score == 0:
            return
        # Minimum: at least baseScore per block (very generous floor)
        # Allow 50-10000 per block to cover all combo/perfect/milestone scenarios
        if self.height > 0:
            max_score = self.height * 10000 + 50000
            if self.score > max_score:
                raise ValueError(
                    f"Score {self.score} exceeds maximum for height {self.height}"
                )
        if self.score > 0 and self.height <= 0:
            raise ValueError("Score > 0 requires height > 0")

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
