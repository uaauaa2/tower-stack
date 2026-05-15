"""Tower Stack Backend — FastAPI application."""

import os
import time
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import init_db, get_db, upsert_player, save_game, get_player_stats, get_leaderboard
from auth import validate_init_data
from achievements import check_achievements
from bot import handle_update
from models import (
    ScoreSubmit, ScoreResponse,
    LeaderboardResponse, LeaderboardEntry,
    PlayerStats, StatsRequest,
    HealthResponse,
)
import logging

logger = logging.getLogger("towerstack")

# Config
BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://uaauaa2.github.io/tower-stack")
RATE_LIMIT_SECONDS = 5

app = FastAPI(title="Tower Stack API", version="1.0.0")

# CORS — allow GitHub Pages and Telegram
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://uaauaa2.github.io",
        "https://t.me",
        "https://web.telegram.org",
        "http://localhost:*",
        "http://127.0.0.1:*",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def allow_null_origin(request: Request, call_next):
    """Allow 'null' origin from Telegram iOS WebApp."""
    response = await call_next(request)
    if request.headers.get("origin") == "null":
        response.headers["Access-Control-Allow-Origin"] = "null"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST"
        response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# Simple in-memory rate limiter: {telegram_id: last_submit_timestamp}
_rate_limits: dict[int, float] = {}
RATE_LIMIT_MAX_ENTRIES = 10000


def _evict_rate_limits():
    """Evict expired entries from rate limiter to prevent unbounded growth."""
    global _rate_limits
    if len(_rate_limits) > RATE_LIMIT_MAX_ENTRIES:
        now = time.time()
        _rate_limits = {k: v for k, v in _rate_limits.items() if now - v < RATE_LIMIT_SECONDS}


@app.on_event("startup")
def startup():
    init_db()
    print(f"[API] Server started. WEBAPP_URL={WEBAPP_URL}")


# ── Health ──────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
def health():
    try:
        conn = get_db()
        conn.execute("SELECT 1")
        conn.close()
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return {"status": "degraded", "db": f"error: {e}"}


# ── Submit Score ────────────────────────────────────────────────

@app.post("/api/score", response_model=ScoreResponse)
def submit_score(body: ScoreSubmit):
    user = validate_init_data(body.init_data, BOT_TOKEN)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Invalid Telegram auth")

    telegram_id = user["id"]

    # Rate limit eviction
    _evict_rate_limits()

    # Rate limit
    now = time.time()
    last = _rate_limits.get(telegram_id, 0)
    if now - last < RATE_LIMIT_SECONDS:
        raise HTTPException(status_code=429, detail="Too fast, slow down")
    _rate_limits[telegram_id] = now

    # Basic sanity: score can't exceed ~250k (generous upper bound for very long games)
    if body.score < 0 or body.score > 250000:
        raise HTTPException(status_code=400, detail="Invalid score")
    if body.height < 0 or body.height > 500:
        raise HTTPException(status_code=400, detail="Invalid height")

    game_data = body.model_dump()
    del game_data["init_data"]

    conn = get_db()
    try:
        player_id = upsert_player(conn, telegram_id, user.get("username"), user.get("first_name"))

        # Check personal best before saving
        prev_stats = get_player_stats(conn, player_id)
        prev_best = prev_stats["best_score"]

        game_id = save_game(conn, player_id, game_data)

        # Get updated stats for achievements
        new_stats = get_player_stats(conn, player_id)

        # Check achievements
        new_achievements = check_achievements(conn, player_id, game_data, new_stats)

        # Get rank
        rank = new_stats["rank"]
        personal_best = body.score > prev_best

        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Score submission error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        conn.close()

    return ScoreResponse(
        ok=True,
        rank=rank,
        personal_best=personal_best,
        new_milestones=new_achievements,
    )


# ── Leaderboard ────────────────────────────────────────────────

@app.get("/api/leaderboard", response_model=LeaderboardResponse)
def leaderboard(period: str = "all", limit: int = 10):
    if period not in ("all", "weekly"):
        period = "all"
    limit = max(1, min(50, limit))

    conn = get_db()
    try:
        entries = get_leaderboard(conn, period, limit)
    finally:
        conn.close()

    return LeaderboardResponse(period=period, entries=entries)


# ── Player Stats ────────────────────────────────────────────────

@app.post("/api/stats", response_model=PlayerStats)
def player_stats(body: StatsRequest):
    user = validate_init_data(body.init_data, BOT_TOKEN)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Invalid Telegram auth")

    telegram_id = user["id"]
    conn = get_db()
    try:
        player_id = upsert_player(conn, telegram_id, user.get("username"), user.get("first_name"))
        stats = get_player_stats(conn, player_id)
        stats["username"] = user.get("username") or user.get("first_name", f"Player #{telegram_id}")
    finally:
        conn.close()

    return PlayerStats(**stats)


# ── Telegram Webhook ────────────────────────────────────────────

@app.post("/webhook")
async def telegram_webhook(request: Request):
    """Receive Telegram updates via webhook."""
    update = await request.json()

    # Verify it's from Telegram via secret token (REQUIRED)
    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    expected_secret = os.environ.get("WEBHOOK_SECRET")
    if not expected_secret:
        logger.error("WEBHOOK_SECRET not set — webhook endpoint disabled")
        return JSONResponse(status_code=503, content={"error": "Service misconfigured"})
    if secret != expected_secret:
        logger.warning("Webhook received with invalid secret")
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    result = await handle_update(update, BOT_TOKEN, WEBAPP_URL)
    return JSONResponse(content=result)
