"""Pydantic models for API request/response."""

from pydantic import BaseModel
from typing import Optional


class ScoreSubmit(BaseModel):
    init_data: str
    score: int
    height: int
    best_combo: int = 0
    perfect_count: int = 0
    duration_ms: int = 0
    theme: str = "classic"


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
