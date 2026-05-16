"""Tower Stack Backend — FastAPI application."""

import os
import re
import time
import uuid
from contextlib import contextmanager
from enum import Enum

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

# ── Config ──────────────────────────────────────────────────────

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://uaauaa2.github.io/tower-stack")
RATE_LIMIT_SECONDS = 5
MAX_REQUEST_BYTES = 1 * 1024 * 1024  # 1 MB

IS_PRODUCTION = os.environ.get("ENV", "development") == "production"

app = FastAPI(title="Tower Stack API", version="1.0.0")

# ── CORS ────────────────────────────────────────────────────────

_production_origins = [
    "https://uaauaa2.github.io",
    "https://t.me",
    "https://web.telegram.org",
]
_dev_origins = _production_origins + [
    "http://localhost:3000",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_production_origins if IS_PRODUCTION else _dev_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Middleware ───────────────────────────────────────────────────

@app.middleware("http")
async def global_middleware(request: Request, call_next):
    # 1. Request size limit
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BYTES:
        return JSONResponse(status_code=413, content={"error": "Payload too large"})

    # 2. Request ID
    request_id = str(uuid.uuid4())[:8]
    request.state.request_id = request_id

    # 3. Process request
    response = await call_next(request)

    # 4. Null origin (Telegram iOS WebApp)
    if request.headers.get("origin") == "null":
        response.headers["Access-Control-Allow-Origin"] = "null"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST"
        response.headers["Access-Control-Allow-Headers"] = "*"

    # 5. Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Request-ID"] = request_id

    return response


# ── Rate limiter (in-memory, per-process) ───────────────────────
# NOTE: Only effective in single-worker deployment.
# For multi-worker, use Redis-backed rate limiting.

_rate_limits: dict[int, float] = {}
RATE_LIMIT_MAX_ENTRIES = 10000


def _evict_rate_limits():
    """Evict expired entries from rate limiter to prevent unbounded growth."""
    global _rate_limits
    if len(_rate_limits) > RATE_LIMIT_MAX_ENTRIES:
        now = time.time()
        _rate_limits = {k: v for k, v in _rate_limits.items() if now - v < RATE_LIMIT_SECONDS}


# ── DB context manager ──────────────────────────────────────────

@contextmanager
def db_transaction():
    """Get a DB connection with auto-commit/rollback/close."""
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def db_read():
    """Get a DB connection for read-only operations. Caller must close."""
    return get_db()


# ── Input sanitization ──────────────────────────────────────────

def sanitize_text(text: str | None, max_len: int = 64) -> str | None:
    """Strip HTML tags and truncate user-supplied text."""
    if not text:
        return None
    cleaned = re.sub(r'<[^>]*>', '', text)
    return cleaned[:max_len].strip() or None


# ── Startup ─────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()
    if not BOT_TOKEN:
        logger.error("BOT_TOKEN is not set — authentication will fail!")
    logger.info(f"Server started. WEBAPP_URL={WEBAPP_URL} ENV={'production' if IS_PRODUCTION else 'development'}")


# ── Health ──────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
def health():
    try:
        conn = db_read()
        conn.execute("SELECT 1")
        conn.close()
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        logger.error(f"Health check DB failure: {e}")
        return {"status": "degraded", "db": "error"}


# ── Submit Score ────────────────────────────────────────────────

@app.post("/api/score", response_model=ScoreResponse)
def submit_score(body: ScoreSubmit):
    user = validate_init_data(body.init_data, BOT_TOKEN)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Invalid Telegram auth")

    telegram_id = user["id"]

    # Rate limit
    _evict_rate_limits()
    now = time.time()
    last = _rate_limits.get(telegram_id, 0)
    if now - last < RATE_LIMIT_SECONDS:
        raise HTTPException(status_code=429, detail="Too fast, slow down")
    _rate_limits[telegram_id] = now

    # Sanity checks (redundant with Pydantic, defense in depth)
    if body.score < 0 or body.score > 250000:
        raise HTTPException(status_code=400, detail="Invalid score")
    if body.height < 0 or body.height > 500:
        raise HTTPException(status_code=400, detail="Invalid height")

    game_data = body.model_dump()
    del game_data["init_data"]

    username = sanitize_text(user.get("username"), 50)
    first_name = sanitize_text(user.get("first_name"), 64)

    try:
        with db_transaction() as conn:
            player_id = upsert_player(conn, telegram_id, username, first_name)

            prev_stats = get_player_stats(conn, player_id)
            prev_best = prev_stats["best_score"]

            save_game(conn, player_id, game_data)

            new_stats = get_player_stats(conn, player_id)
            new_achievements = check_achievements(conn, player_id, game_data, new_stats)

            rank = new_stats["rank"]
            personal_best = body.score > prev_best
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Score submission error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

    return ScoreResponse(
        ok=True,
        rank=rank,
        personal_best=personal_best,
        new_milestones=new_achievements,
    )


# ── Leaderboard ────────────────────────────────────────────────

class LeaderboardPeriod(str, Enum):
    all = "all"
    weekly = "weekly"


@app.get("/api/leaderboard", response_model=LeaderboardResponse)
def leaderboard(period: LeaderboardPeriod = LeaderboardPeriod.all, limit: int = 10):
    limit = max(1, min(50, limit))

    conn = db_read()
    try:
        entries = get_leaderboard(conn, period.value, limit)
    finally:
        conn.close()

    return LeaderboardResponse(period=period.value, entries=entries)


# ── Player Stats ────────────────────────────────────────────────

@app.post("/api/stats", response_model=PlayerStats)
def player_stats(body: StatsRequest):
    user = validate_init_data(body.init_data, BOT_TOKEN)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Invalid Telegram auth")

    telegram_id = user["id"]
    username = sanitize_text(user.get("username"), 50)
    first_name = sanitize_text(user.get("first_name"), 64)

    conn = db_read()
    try:
        player_id = upsert_player(conn, telegram_id, username, first_name)
        conn.commit()
        stats = get_player_stats(conn, player_id)
        stats["username"] = username or first_name or f"Player #{telegram_id}"
    finally:
        conn.close()

    return PlayerStats(**stats)


# ── Telegram Webhook ────────────────────────────────────────────

@app.post("/webhook")
async def telegram_webhook(request: Request):
    """Receive Telegram updates via webhook."""
    update = await request.json()

    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    expected_secret = os.environ.get("WEBHOOK_SECRET")
    if not expected_secret:
        logger.error("WEBHOOK_SECRET not set — webhook endpoint disabled")
        return JSONResponse(status_code=503, content={"error": "Service misconfigured"})
    if secret != expected_secret:
        logger.warning(f"Webhook invalid secret from {request.client.host if request.client else 'unknown'}")
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    result = await handle_update(update, BOT_TOKEN, WEBAPP_URL)
    return JSONResponse(content=result)
