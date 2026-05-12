# Tower Stack — Backend & Telegram Mini App Specification

> **Spec ID:** 003-backend
> **Status:** Draft
> **Branch:** feature/003-backend
> **Source:** User request 2026-05-12

---

## Summary

Add a Python backend (FastAPI + SQLite) that powers Telegram Mini App integration, a global leaderboard, and per-player game statistics. The frontend remains a single HTML file served via GitHub Pages, communicating with the backend via REST API.

---

## Architecture

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────┐
│  Telegram Bot   │──────▶│  FastAPI Backend  │◀──────│  Frontend   │
│  (new bot)      │ webhook│  (Render.com)     │ REST  │  (GH Pages) │
└─────────────────┘       │                    │       └─────────────┘
                          │  ┌──────────────┐  │
                          │  │   SQLite DB   │  │
                          │  └──────────────┘  │
                          └──────────────────┘
```

- **Frontend**: GitHub Pages (existing `index.html`), adds API calls
- **Backend**: FastAPI on Render.com free tier, SQLite for persistence
- **Bot**: New Telegram bot via BotFather, webhook → backend

---

## User Stories

- **US-B01:** As a Telegram user, I want to launch the game from a bot `/play` command so there's zero friction.
- **US-B02:** As a player, I want my scores automatically submitted after each game so I appear on the leaderboard.
- **US-B03:** As a competitive player, I want to see a global leaderboard so I can compare with others.
- **US-B04:** As a player, I want to see my personal stats (games played, best score, avg height, etc.) so I track my progress.
- **US-B05:** As a Telegram user, I want `/top` to show the leaderboard right in the chat.
- **US-B06:** As a player, I want my data tied to my Telegram account so it persists across devices.

---

## Telegram Mini App Integration

### Bot Setup

1. New bot created via BotFather (e.g. `@TowerStackGameBot`)
2. Bot commands: `/play` (launch game), `/top` (leaderboard in chat), `/stats` (personal stats)
3. Mini App URL configured via BotFather → points to GitHub Pages URL
4. Bot menu button configured to launch the game

### Frontend Integration

- On load, check for `window.Telegram?.WebApp` to detect Telegram environment
- If in Telegram: call `Telegram.WebApp.ready()`, `Telegram.WebApp.expand()`
- Extract `Telegram.WebApp.initData` for authentication on every API call
- If NOT in Telegram: play locally with localStorage (no API calls), or offer a "guest" mode with limited leaderboard access

### Authentication

- Backend validates `initData` using bot token + HMAC-SHA256 (official Telegram spec)
- Extracts `user.id`, `user.username`, `user.first_name` from validated data
- No separate registration needed — Telegram identity IS the account

---

## API Endpoints

### `POST /api/score`
Submit a game result.

**Auth:** Telegram `initData` (required)

**Request:**
```json
{
  "init_data": "...",
  "score": 4200,
  "height": 32,
  "best_combo": 5,
  "perfect_count": 8,
  "duration_ms": 45000
}
```

**Response:**
```json
{
  "ok": true,
  "rank": 14,
  "personal_best": true,
  "new_milestones": ["first_30"]
}
```

### `GET /api/leaderboard`
Get global leaderboard.

**Query params:** `period=all|weekly` (default: all), `limit=10` (default: 10)

**Response:**
```json
{
  "period": "all",
  "entries": [
    {"rank": 1, "username": "player1", "score": 12500, "height": 58, "date": "2026-05-10"},
    {"rank": 2, "username": "player2", "score": 9800, "height": 45, "date": "2026-05-11"}
  ]
}
```

### `GET /api/stats`
Get personal stats.

**Auth:** Telegram `initData` (required)

**Response:**
```json
{
  "username": "uaauaa2",
  "total_games": 42,
  "best_score": 8700,
  "best_height": 38,
  "best_combo": 7,
  "avg_score": 3200,
  "avg_height": 18,
  "total_perfects": 156,
  "total_playtime_min": 45,
  "rank": 5,
  "achievements": ["first_game", "height_30", "combo_5"]
}
```

### `GET /api/health`
Health check.

**Response:** `{"status": "ok", "db": "ok"}`

---

## Database Schema

### `players`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| telegram_id | INTEGER UNIQUE | Telegram user ID |
| username | TEXT | @username (nullable) |
| first_name | TEXT | Display name |
| created_at | DATETIME | First seen |
| last_seen | DATETIME | Last activity |

### `games`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| player_id | INTEGER FK → players.id | |
| score | INTEGER | Final score |
| height | INTEGER | Blocks stacked |
| best_combo | INTEGER | Best combo in this game |
| perfect_count | INTEGER | Perfect landings |
| duration_ms | INTEGER | Game duration |
| theme | TEXT | Theme used |
| created_at | DATETIME | When played |

### `achievements`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| player_id | INTEGER FK → players.id | |
| key | TEXT | Achievement identifier |
| unlocked_at | DATETIME | When earned |

### Indexes
- `games(player_id, score DESC)` — leaderboard queries
- `games(created_at)` — weekly filtering
- `players(telegram_id)` — auth lookup

---

## Leaderboard

### Periods
- **All-time**: top scores ever
- **Weekly**: scores from last 7 days (resets every Monday)

### Rules
- One entry per game (not per player) — player can appear multiple times
- Leaderboard shows: rank, username (or "Player #id" if no username), score, height, date
- Weekly leaderboard auto-expires old entries

---

## Achievements

Unlocked based on game results. Stored in DB, returned in stats.

| Key | Name | Condition |
|-----|------|-----------|
| `first_game` | First Steps | Play first game |
| `height_10` | Getting Started | Stack 10 blocks |
| `height_25` | Reaching High | Stack 25 blocks |
| `height_50` | Sky Scraper | Stack 50 blocks |
| `combo_3` | On Fire | 3× combo |
| `combo_5` | Unstoppable | 5× combo |
| `combo_10` | Perfect Machine | 10× combo |
| `score_1000` | Points! | Score 1000+ |
| `score_5000` | High Roller | Score 5000+ |
| `score_10000` | Legend | Score 10000+ |
| `games_10` | Dedicated | Play 10 games |
| `games_50` | Addicted | Play 50 games |
| `perfect_10` | Sharp Eye | 10 perfects in one game |

---

## Frontend Changes

### New: API Module (inline in index.html)
```javascript
const API = {
  baseUrl: 'https://tower-stack-api.onrender.com',
  
  async submitScore(gameData) { ... },
  async getLeaderboard(period = 'all') { ... },
  async getStats() { ... },
  
  getInitData() {
    return window.Telegram?.WebApp?.initData || null;
  },
  
  isTelegram() {
    return !!window.Telegram?.WebApp;
  }
};
```

### Modified: Game Over Screen
- After game over, if in Telegram: auto-submit score via API
- Show rank and "New Personal Best!" badge if applicable
- Add "Leaderboard" button

### New: Leaderboard Screen
- New state `STATES.LEADERBOARD`
- Shows top 10 (all-time + weekly tabs)
- Highlight current player's entry

### Modified: Settings Screen
- Add "Leaderboard" button (always visible)
- In Telegram: show player username and rank

### Telegram WebApp SDK
- Conditionally load `telegram-web-app.js` via `<script>` with detection
- On load in TG: `ready()`, `expand()`, apply TG theme params
- Haptic feedback on: block drop (`notification.impactOccurred('medium')`), perfect (`notification.impactOccurred('heavy')`), game over (`notification.impactOccurred('light')`)

---

## Hosting

| Component | Service | Cost |
|-----------|---------|------|
| Frontend | GitHub Pages (existing) | Free |
| Backend | Render.com free tier | Free |
| Database | SQLite on Render disk | Free (ephemeral on free tier — see below) |
| Bot | Same backend (webhook mode) | Free |

### Render.com Notes
- Free tier: 750 hours/month, sleeps after 15min inactivity
- SQLite on ephemeral disk — data lost on restart
- **Mitigation:** Periodic DB dumps to GitHub repo (backup strategy)
- If data persistence becomes critical → migrate to Render PostgreSQL (free 90-day trial, then $7/mo) or use external SQLite hosting

### Alternative: Always-on free hosting
If Render sleep becomes annoying:
- **Koyeb** (1 free nano service, no sleep)
- **Fly.io** (free tier, 3 VMs)
- Migration is easy — just change deploy target

---

## Bot Commands (in-chat)

### `/play`
- Opens Mini App with game
- Short text: "🎮 Click to play Tower Stack!"

### `/top`
- Shows inline top-5 leaderboard
- Format:
  ```
  🏆 Tower Stack Leaderboard
  1. @player1 — 12,500 pts (58 floors)
  2. @player2 — 9,800 pts (45 floors)
  3. @player3 — 7,200 pts (33 floors)
  ...
  Play now: /play
  ```

### `/stats`
- Shows personal stats for the user
- Format:
  ```
  📊 Your Stats
  Games: 42 | Best: 8,700 pts
  Highest tower: 38 floors
  Best combo: ×7
  Rank: #5
  ```

---

## Security

- **initData validation**: Every write endpoint validates Telegram HMAC-SHA256 signature
- **Score validation**: Basic sanity checks (score ≤ theoretical max based on height)
- **Rate limiting**: Max 1 score submission per 5 seconds per player
- **CORS**: Allow only GitHub Pages origin + Telegram WebApp
- **No admin panel** — keep it simple, manage DB directly if needed

---

## File Structure

```
tower-stack/
├── index.html              (existing, modified for API integration)
├── backend/
│   ├── main.py             (FastAPI app, routes, Telegram webhook)
│   ├── database.py         (SQLite setup, schema init)
│   ├── auth.py             (Telegram initData validation)
│   ├── models.py           (Pydantic models)
│   ├── achievements.py     (Achievement definitions + checking logic)
│   ├── bot.py              (Telegram bot command handlers)
│   ├── requirements.txt    (fastapi, uvicorn, python-telegram-bot)
│   └── render.yaml         (Render.com deploy config)
├── specs/
│   └── 003-backend/
│       ├── spec.md
│       ├── plan.md
│       └── tasks.md
└── ...
```

---

## Constitution Compliance

| Principle | Status |
|-----------|--------|
| C-01: Single Tap | ✅ Backend doesn't change input model |
| C-02: Mobile First | ✅ API designed for mobile latency |
| C-03: Zero Dependencies | ✅ Frontend still zero deps; backend is separate |
| C-04: Performance Budget | ✅ API calls only on game over, not during gameplay |
| C-05: Telegram Ready | ✅ Core feature of this spec |
| C-06: Data Local First | ✅ localStorage still works; API is enhancement |

---

## Success Criteria

- **SC-B01:** Bot responds to `/play`, `/top`, `/stats` within 2 seconds
- **SC-B02:** Score submission takes < 500ms
- **SC-B03:** Leaderboard loads in < 1 second
- **SC-B04:** Game works offline (localStorage fallback) when backend is unreachable
- **SC-B05:** initData validation rejects tampered scores
- **SC-B06:** Render.com free tier handles 100+ concurrent players
- **SC-B07:** Weekly leaderboard resets correctly every Monday
- **SC-B08:** Achievements unlock correctly and persist
- **SC-B09:** Game works identically in browser and Telegram Mini App

---

*Spec version: 1.0*
*Created: 2026-05-12*
