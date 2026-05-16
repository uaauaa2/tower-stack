from __future__ import annotations
"""Database setup — Turso (libSQL) with SQLite fallback for local dev."""

import os
import json
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("towerstack.db")

# ── Turso libSQL with SQLite fallback ──────────────────────────

try:
    from libsql_experimental import connect as _libsql_connect
    import sqlite3 as _sqlite3
    HAS_LIBSQL = True
except ImportError:
    import sqlite3 as _sqlite3
    HAS_LIBSQL = False


class _Row:
    """Dict-like row wrapper for libsql_experimental (returns tuples by default)."""
    __slots__ = ("_data", "_map")

    def __init__(self, description, values):
        self._map = {desc[0]: i for i, desc in enumerate(description)}
        self._data = values

    def __getitem__(self, key):
        if isinstance(key, str):
            return self._data[self._map[key]]
        return self._data[key]

    def __repr__(self):
        return repr(dict(self._map))


class _LibsqlCursor:
    """Wraps a libsql cursor to return _Row instead of tuple."""

    def __init__(self, cursor):
        self._cursor = cursor

    @property
    def description(self):
        return self._cursor.description

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        if self._cursor.description:
            return _Row(self._cursor.description, row)
        return row

    def fetchall(self):
        rows = self._cursor.fetchall()
        if self._cursor.description:
            return [_Row(self._cursor.description, r) for r in rows]
        return rows

    def execute(self, sql, params=None):
        if params:
            self._cursor = self._cursor.execute(sql, params)
        else:
            self._cursor = self._cursor.execute(sql)
        return self

    def executemany(self, sql, params_list):
        self._cursor.executemany(sql, params_list)
        return self

    @property
    def lastrowid(self):
        return self._cursor.lastrowid


class _LibsqlConnection:
    """Wraps a libsql_experimental connection to return _Row objects."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=None):
        if params:
            cur = self._conn.execute(sql, params)
        else:
            cur = self._conn.execute(sql)
        return _LibsqlCursor(cur)

    def executescript(self, sql):
        # libsql doesn't support executescript natively; split and run each
        for stmt in sql.split(";"):
            stmt = stmt.strip()
            if stmt:
                self._conn.execute(stmt)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


# ── Connection config ──────────────────────────────────────────

TURSO_URL = os.environ.get("TURSO_URL", "")       # e.g. libsql://tower-stack-xxx.turso.io
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")
LOCAL_DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "data", "towerstack.db"))


def get_db():
    """Get a database connection. Caller must close it."""
    if HAS_LIBSQL and TURSO_URL:
        raw = _libsql_connect(TURSO_URL, auth_token=TURSO_AUTH_TOKEN)
        return _LibsqlConnection(raw)
    else:
        os.makedirs(os.path.dirname(LOCAL_DB_PATH), exist_ok=True)
        conn = _sqlite3.connect(LOCAL_DB_PATH, timeout=30.0)
        conn.row_factory = _sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE NOT NULL,
            username TEXT,
            first_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL REFERENCES players(id),
            score INTEGER NOT NULL,
            height INTEGER NOT NULL,
            best_combo INTEGER NOT NULL DEFAULT 0,
            perfect_count INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            theme TEXT DEFAULT 'classic',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL REFERENCES players(id),
            key TEXT NOT NULL,
            unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(player_id, key)
        );

        CREATE INDEX IF NOT EXISTS idx_games_player_score ON games(player_id, score DESC);
        CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at);
        CREATE INDEX IF NOT EXISTS idx_players_telegram ON players(telegram_id);
        CREATE INDEX IF NOT EXISTS idx_achievements_player ON achievements(player_id);
    """)
    conn.commit()
    conn.close()
    backend = "Turso" if (HAS_LIBSQL and TURSO_URL) else f"SQLite ({LOCAL_DB_PATH})"
    print(f"[DB] Initialized at {backend}")


def upsert_player(conn, telegram_id: int, username: str | None, first_name: str | None) -> int:
    """Insert or update a player. Returns player id."""
    now = datetime.now(timezone.utc).isoformat()
    row = conn.execute("SELECT id FROM players WHERE telegram_id = ?", (telegram_id,)).fetchone()
    if row:
        conn.execute(
            "UPDATE players SET username=?, first_name=?, last_seen=? WHERE telegram_id=?",
            (username, first_name, now, telegram_id),
        )
        return row["id"]
    else:
        cur = conn.execute(
            "INSERT INTO players (telegram_id, username, first_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)",
            (telegram_id, username, first_name, now, now),
        )
        return cur.lastrowid


def save_game(conn, player_id: int, data: dict) -> int:
    """Insert a game record. Returns game id."""
    cur = conn.execute(
        """INSERT INTO games (player_id, score, height, best_combo, perfect_count, duration_ms, theme)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (player_id, data["score"], data["height"], data.get("best_combo", 0),
         data.get("perfect_count", 0), data.get("duration_ms", 0), data.get("theme", "classic")),
    )
    return cur.lastrowid


def get_player_stats(conn, player_id: int) -> dict:
    """Aggregate player statistics."""
    row = conn.execute("""
        SELECT
            COUNT(*) as total_games,
            COALESCE(MAX(score), 0) as best_score,
            COALESCE(MAX(height), 0) as best_height,
            COALESCE(MAX(best_combo), 0) as best_combo,
            COALESCE(AVG(score), 0) as avg_score,
            COALESCE(AVG(height), 0) as avg_height,
            COALESCE(SUM(perfect_count), 0) as total_perfects,
            COALESCE(SUM(duration_ms), 0) as total_duration_ms
        FROM games WHERE player_id = ?
    """, (player_id,)).fetchone()

    rank_row = conn.execute("""
        SELECT COUNT(*) + 1 as rank FROM players p
        WHERE (SELECT COALESCE(MAX(score), 0) FROM games WHERE player_id = p.id)
            > (SELECT COALESCE(MAX(score), 0) FROM games WHERE player_id = ?)
    """, (player_id,)).fetchone()

    ach_rows = conn.execute(
        "SELECT key FROM achievements WHERE player_id = ?",
        (player_id,)
    ).fetchall()

    return {
        "total_games": row["total_games"],
        "best_score": row["best_score"],
        "best_height": row["best_height"],
        "best_combo": row["best_combo"],
        "avg_score": round(row["avg_score"]),
        "avg_height": round(row["avg_height"]),
        "total_perfects": row["total_perfects"],
        "total_playtime_min": round(row["total_duration_ms"] / 60000),
        "rank": rank_row["rank"],
        "achievements": [r["key"] for r in ach_rows],
    }


def get_leaderboard(conn, period: str = "all", limit: int = 10) -> list:
    """Get top scores. period: 'all' or 'weekly'. Allows multiple entries per player."""
    if period == "weekly":
        cutoff = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        days_since_monday = cutoff.weekday()
        cutoff = cutoff - timedelta(days=days_since_monday)
        cutoff_str = cutoff.isoformat()
        rows = conn.execute("""
            SELECT g.score, g.height, g.created_at,
                   p.username, p.first_name, p.id as player_id
            FROM games g JOIN players p ON g.player_id = p.id
            WHERE g.created_at >= ?
            ORDER BY g.score DESC LIMIT ?
        """, (cutoff_str, limit)).fetchall()
    else:
        rows = conn.execute("""
            SELECT g.score, g.height, g.created_at,
                   p.username, p.first_name, p.id as player_id
            FROM games g JOIN players p ON g.player_id = p.id
            ORDER BY g.score DESC LIMIT ?
        """, (limit,)).fetchall()

    result = []
    for i, r in enumerate(rows):
        name = r["username"] or r["first_name"] or f"Player {r['player_id']}"
        result.append({
            "rank": i + 1,
            "username": name,
            "score": r["score"],
            "height": r["height"],
            "date": r["created_at"][:10] if r["created_at"] else "",
        })
    return result
