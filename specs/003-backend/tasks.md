# Tower Stack — Backend Tasks

> **Spec ID:** 003-backend
> **Branch:** feature/003-backend
> **Status:** Pending

---

## Phase 1: Backend Core

- [x] T-B01: Scaffold `backend/` — `main.py`, `requirements.txt`, `render.yaml`
- [x] T-B02: `database.py` — SQLite schema init (players, games, achievements tables)
- [x] T-B03: `auth.py` — Telegram initData HMAC-SHA256 validation
- [x] T-B04: `models.py` — Pydantic request/response models
- [x] T-B05: `POST /api/score` — save game, update player, check achievements
- [x] T-B06: `GET /api/leaderboard` — top N with all-time/weekly filter
- [x] T-B07: `GET /api/stats` — aggregate player statistics
- [x] T-B08: `GET /api/health` — health check endpoint
- [x] T-B09: CORS config — allow GitHub Pages + Telegram origins
- [ ] T-B10: Deploy to Render.com — connect repo, set env vars, verify health

## Phase 2: Telegram Bot

- [x] T-B11: Create new bot via BotFather, get token
- [x] T-B12: `bot.py` — webhook endpoint on FastAPI, route updates
- [x] T-B13: `/play` handler — reply with game link + inline keyboard
- [x] T-B14: `/top` handler — query top-5, format as text leaderboard
- [x] T-B15: `/stats` handler — query player stats, format reply
- [ ] T-B16: Set bot commands, menu button, Mini App URL via BotFather API
- [ ] T-B17: Test all bot commands end-to-end

## Phase 3: Frontend Integration

- [x] T-B18: Add `API` module to `index.html` (baseUrl, fetch wrappers, initData extraction)
- [x] T-B19: Detect Telegram environment, conditionally load SDK
- [x] T-B20: Call `Telegram.WebApp.ready()`, `expand()` on init in TG
- [x] T-B21: Score submission on game over (if in Telegram)
- [x] T-B22: Leaderboard screen (`STATES.LEADERBOARD`) — fetch + render with tabs
- [x] T-B23: Personal stats display (settings or dedicated screen)
- [x] T-B24: Haptic feedback — impact on drop, perfect, game over
- [x] T-B25: Offline fallback — silent localStorage when API unreachable

## Phase 4: Achievements & Polish

- [ ] T-B26: `achievements.py` — define 13 achievements, check function
- [ ] T-B27: Achievement unlock on score submission, return new unlocks
- [ ] T-B28: Achievement popup in frontend (toast notification)
- [ ] T-B29: "New Personal Best" badge in game over screen
- [ ] T-B30: Leaderboard button in menu + game over
- [ ] T-B31: DB backup strategy — periodic dumps, restore docs

---

## Progress

| Phase | Total | Done | % |
|-------|-------|------|---|
| Phase 1: Backend Core | 10 | 9 | 90% |
| Phase 2: Telegram Bot | 7 | 5 | 71% |
| Phase 3: Frontend | 8 | 8 | 100% |
| Phase 4: Achievements | 6 | 0 | 0% |
| **Total** | **31** | **22** | **71%** |
