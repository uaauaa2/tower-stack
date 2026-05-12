# Tower Stack — Backend Implementation Plan

> **Spec ID:** 003-backend
> **Branch:** feature/003-backend

---

## Phase 1: Backend Core (API + DB)

### Step 1: Project Scaffold
- Create `backend/` directory with FastAPI app structure
- `requirements.txt`: fastapi, uvicorn, python-telegram-bot
- `render.yaml` for Render.com deployment
- `.env` for bot token (not committed)

### Step 2: Database Setup
- SQLite file: `data/towerstack.db`
- Auto-create tables on startup if not exist
- Schema: `players`, `games`, `achievements` (see spec)
- Connection pooling via `aiosqlite` or simple per-request connection

### Step 3: Auth Module
- `auth.py`: validate Telegram `initData`
  - Parse query string
  - Compute HMAC-SHA256 with bot token
  - Compare hashes
  - Extract user data (id, username, first_name)
- Fallback: reject requests with invalid/missing auth

### Step 4: API Endpoints
- `POST /api/score` — validate, save game, check achievements, return rank
- `GET /api/leaderboard` — query top N with period filter
- `GET /api/stats` — aggregate player stats
- `GET /api/health` — basic health check
- All endpoints with proper error handling and CORS

### Step 5: Deploy to Render.com
- Connect GitHub repo
- Render auto-detects FastAPI via `render.yaml`
- Set env vars: `BOT_TOKEN`, `WEBAPP_URL`
- Verify health endpoint responds

---

## Phase 2: Telegram Bot

### Step 6: Bot Setup
- Create new bot via BotFather
- Set commands: `/play`, `/top`, `/stats`
- Configure Mini App URL (GitHub Pages)
- Set menu button to launch game

### Step 7: Webhook Handler
- `bot.py`: register webhook endpoint on FastAPI
- Handle incoming updates from Telegram
- Route to command handlers

### Step 8: Command Handlers
- `/play` → reply with game link + inline button
- `/top` → query DB, format top-5 leaderboard, reply
- `/stats` → query player stats by telegram_id, reply

---

## Phase 3: Frontend Integration

### Step 9: API Module
- Add `API` object to `index.html` with fetch wrappers
- Detect Telegram environment, extract initData
- Graceful fallback when not in Telegram

### Step 10: Score Submission
- On game over: if Telegram → submit score via API
- Show submission status (success/rank/personal best)
- If API fails → silent fallback to localStorage

### Step 11: Leaderboard Screen
- New `STATES.LEADERBOARD`
- Fetch from API on enter
- Two tabs: All-time / Weekly
- Highlight current player row
- Accessible from menu and game over

### Step 12: Personal Stats Display
- Show in settings or dedicated stats screen
- Fetch from API on enter
- Fallback to local stats if offline

### Step 13: Telegram WebApp SDK
- Conditionally load script
- Call `ready()`, `expand()` on init
- Haptic feedback on events
- Apply Telegram theme colors (optional)

---

## Phase 4: Achievements & Polish

### Step 14: Achievement System
- Define 13 achievements (see spec)
- Check on every score submission
- Return newly unlocked achievements
- Show achievement popup in frontend

### Step 15: Leaderboard in Game Over
- Show player rank after submission
- "New Personal Best!" badge
- Quick link to full leaderboard

### Step 16: Backup Strategy
- Daily DB dump to `/data/backups/`
- Optional: push backup to GitHub repo via cron
- Document restore procedure

---

## Deployment Flow

```
1. Push to GitHub
2. Render.com auto-deploys backend (watch branch or main)
3. GitHub Pages auto-deploys frontend (on master merge)
4. Bot webhook stays pointed at Render URL
```

## Environment Variables

| Var | Description | Example |
|-----|-------------|---------|
| `BOT_TOKEN` | Telegram bot token | `123456:ABC-DEF...` |
| `WEBAPP_URL` | Frontend URL | `https://uaauaa2.github.io/tower-stack` |
| `RENDER_EXTERNAL_URL` | Auto-set by Render | `https://tower-stack-api.onrender.com` |

---

*Plan version: 1.0*
*Created: 2026-05-12*
