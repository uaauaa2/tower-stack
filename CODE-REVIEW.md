# CODE REVIEW — Tower Stack

```
+====================================================================+
| CODE REVIEW — BRANCH: master                                        |
+====================================================================+
| Repository: tower-stack (Telegram Mini App game)                     |
| Files reviewed:                                                     |
|   index.html (3100 lines, vanilla JS + Canvas)                      |
|   backend/main.py (183 lines, FastAPI)                              |
|   backend/database.py (167 lines, SQLite)                           |
|   backend/auth.py (77 lines, Telegram HMAC validation)              |
|   backend/models.py (57 lines, Pydantic)                            |
|   backend/achievements.py (48 lines)                                |
|   backend/bot.py (114 lines, Telegram bot commands)                 |
|   backend/render.yaml (12 lines, deployment config)                 |
|   backend/.env (2 lines, COMMITTED SECRET)                          |
|   backend/requirements.txt (4 lines)                                |
+--------------------------------------------------------------------+
| Files changed (last 5 commits): 2 (68 insertions, 30 deletions)     |
| Total lines of code: ~3,746                                         |
+--------------------------------------------------------------------+
| Reviewer: Paranoid Staff Engineer Mode                               |
| Date: 2026-05-13                                                    |
+====================================================================+
```

---

## CRITICAL ISSUES (5)

### [C1] Bot Token Committed to Git
**Location:** `backend/.env` line 1
**Evidence:**
```
BOT_TOKEN=8975490170:AAH-JmNVA9ALmDeizBlTl9BFtZpC6HJm0-A
```
**Impact:** The Telegram bot token is committed to the git repository. Anyone with repo access (including public if repo goes public) can control the bot — send messages as the bot, set webhooks, read user data. The `.gitignore` exists but was added *after* `.env` was already committed, so the token is in git history.
**Fix:**
1. Revoke this token immediately via @BotFather
2. Remove `.env` from git history: `git filter-branch` or BFG Repo Cleaner
3. Use Render environment variables (already configured in `render.yaml`) — never commit secrets

### [C2] No Authentication on Leaderboard Endpoint — Score Spoofing Possible Without Telegram
**Location:** `backend/main.py` line 148 (`/api/leaderboard`)
**Evidence:** The leaderboard endpoint has no authentication. While the score submission requires valid Telegram init_data, the entire trust model depends on the client honestly sending its score. A sophisticated attacker can:
1. Play the game locally
2. Observe the `init_data` from a legitimate Telegram session
3. Submit arbitrary scores with that init_data (it's valid for ~1 hour)
**Impact:** Leaderboard pollution. The rate limiter is in-memory only and trivially bypassed.
**Fix:** Add server-side game state validation or at minimum, verify score/height consistency (e.g., height * base_score should roughly equal score range).

### [C3] SQLite Under Concurrent Load — Data Corruption Risk
**Location:** `backend/database.py` `get_db()`
**Evidence:** Each request opens a new SQLite connection with `conn.close()` in `finally` blocks. SQLite in WAL mode handles reads concurrently but writes serialize on a single lock. Under concurrent score submissions:
- `submit_score` does: read player → read stats → save game → check achievements → commit
- This multi-step transaction holds the connection for the entire duration
- The in-memory rate limiter doesn't protect across server restarts or multiple instances
**Impact:** On Render free tier (spins down after inactivity), the server could cold-start with a burst of requests. SQLite will handle this (WAL mode), but the in-memory `_rate_limits` dict resets on restart, allowing replay attacks.
**Fix:**
1. Move rate limiting to the database or use Redis
2. Consider connection pooling instead of per-request `get_db()`
3. Add an `auth_date` check in `validate_init_data` to reject stale init_data (>24h old)

### [C4] Webhook Endpoint Has No Authentication
**Location:** `backend/main.py` lines 162-168 (`/webhook`)
**Evidence:**
```python
@app.post("/webhook")
async def telegram_webhook(request: Request):
    update = await request.json()
    # Verify it's from Telegram (simple secret check)
    # In production, validate with secret_token set on webhook registration
    result = await handle_update(update, BOT_TOKEN, WEBAPP_URL)
```
The comment says "in production" but there is NO verification. Anyone who discovers the webhook URL can send crafted updates.
**Impact:** Attacker can inject fake messages, trigger `/top` and `/stats` commands arbitrarily, or cause unexpected behavior by sending malformed updates.
**Fix:** Use Telegram's `secret_token` webhook parameter and validate `X-Telegram-Bot-Api-Secret-Token` header on every webhook request.

### [C5] XSS via Username in Leaderboard — Both Backend and Frontend
**Location:** `backend/database.py` lines 145-150, `backend/bot.py` lines 12-20, `index.html` leaderboard rendering
**Evidence:**
- Telegram usernames are stored directly in `players` table without sanitization
- Bot responses use `parse_mode="HTML"` with unsanitized usernames: `f"<b>{e['username']}</b>"`
- Frontend renders usernames to Canvas (safe) but the API returns raw usernames
- A username like `<script>alert(1)</script>` would break the bot's HTML responses
**Impact:** In the Telegram bot context, HTML injection in bot messages could potentially exploit Telegram clients or at minimum break formatting.
**Fix:** Sanitize usernames before using in HTML context: `html.escape(username)` in bot.py.

---

## HIGH ISSUES (7)

### [H1] Rank Calculation is O(N²) — Scales Poorly
**Location:** `backend/database.py` `get_player_stats()` lines 109-113
**Evidence:**
```sql
SELECT COUNT(*) + 1 as rank FROM players p
WHERE (SELECT COALESCE(MAX(score), 0) FROM games WHERE player_id = p.id)
    > (SELECT COALESCE(MAX(score), 0) FROM games WHERE player_id = ?)
```
This runs two correlated subqueries for *every player in the database*. With 1,000 players, that's 2,000 subqueries.
**Impact:** Response time degrades quadratically. At 10K players, this query alone could take seconds.
**Fix:** Pre-compute ranks, or use a window function:
```sql
WITH ranked AS (
  SELECT p.id, ROW_NUMBER() OVER (ORDER BY max_score DESC) as rank
  FROM players p JOIN (SELECT player_id, MAX(score) as max_score FROM games GROUP BY player_id) g ON p.id = g.player_id
)
SELECT rank FROM ranked WHERE id = ?
```

### [H2] Ephemeral Storage on Render — Database Lost on Restart
**Location:** `backend/render.yaml` lines 8-12, `backend/database.py` DB_PATH
**Evidence:**
```yaml
disk:
  name: data
  mountPath: /opt/render/project/src/data
```
But `DB_PATH` defaults to `os.path.join(os.path.dirname(__file__), "data", "towerstack.db")` which resolves to the project src directory, which IS the disk mount. However:
- Render free tier disks are ephemeral on some plans
- The `render.yaml` doesn't specify a persistent disk plan
- No backup strategy exists
**Impact:** Database could be lost on redeployment or instance restart.
**Fix:**
1. Verify Render disk persistence is enabled
2. Add automated SQLite backups (`.backup` command)
3. Consider PostgreSQL for production (Render supports it)

### [H3] Frontend Sends `perfectCount: combo` Instead of Actual Perfect Count
**Location:** `index.html` `gameOver()` function
**Evidence:**
```javascript
API.submitScore({
    score, height, bestCombo, perfectCount: combo, durationMs: 0,
})
```
`combo` is the *current* combo counter at game end (which is 0 after a miss causes game over). The variable `perfectCount` is never tracked during gameplay. This means `perfect_count` is always sent as 0 (or incorrect value).
**Impact:** The "Sharp Eye" achievement (10 perfects) is unreachable because perfect_count is never correctly reported.
**Fix:** Track total perfect placements during the game in a `perfectCount` variable, send that instead.

### [H4] `durationMs: 0` — Game Duration Never Tracked
**Location:** `index.html` `gameOver()` function
**Evidence:** `durationMs: 0` is hardcoded. The game never tracks how long the player played.
**Impact:** `total_playtime_min` stat is always 0. The "Dedicated" and "Addicted" achievements based on games played work, but playtime stats are meaningless.
**Fix:** Track game start time, compute duration on game over: `durationMs: Date.now() - gameStartTime`.

### [H5] No `auth_date` Validation — Replay Attacks on init_data
**Location:** `backend/auth.py`
**Evidence:** The `validate_init_data` function validates the HMAC signature but never checks the `auth_date` parameter. Telegram init_data includes `auth_date` (Unix timestamp).
**Impact:** A captured `init_data` string is valid forever (as long as the bot token doesn't change). An attacker can replay old init_data to submit scores on behalf of other users.
**Fix:**
```python
auth_date = int(params.get("auth_date", 0))
if abs(time.time() - auth_date) > 86400:  # Reject older than 24h
    return None
```

### [H6] Unbounded Memory Growth — Sprite Cache Never Evicted
**Location:** `index.html` `SPRITE_CACHE` object
**Evidence:**
```javascript
const SPRITE_CACHE = {};
function getBlockSprite(themeId, color, isPerfect, size) {
  const key = `${themeId}_${color}_${isPerfect ? 1 : 0}_${size}`;
  if (SPRITE_CACHE[key]) return SPRITE_CACHE[key];
  // ... creates new canvas element each time
  SPRITE_CACHE[key] = oc;
  return oc;
}
```
On resize, `BS` changes, generating new cache entries. Old entries are never cleaned. With 4 themes × 6 colors × 2 states = 48 entries per BS value, resizing the window repeatedly creates unbounded offscreen canvases.
**Impact:** Memory leak on window resize. Not critical for mobile (no resize) but affects desktop debugging.
**Fix:** Clear cache on resize (already done in `applySettings` but not in the `resize` handler).

### [H7] Leaderboard Fetch Has No Error Timeout — UI Can Hang
**Location:** `index.html` `drawLeaderboardScreen()`
**Evidence:**
```javascript
if (!leaderboardData && t - _lbFetchTimer > 2) {
    _lbFetchTimer = t;
    API.getLeaderboard(leaderboardTab, 10).then(data => {
        leaderboardData = data;
    });
}
```
`getLeaderboard` uses `fetch` without an `AbortController` timeout (unlike `submitScore` which has a 15s timeout). On a slow connection, this hangs indefinitely.
**Impact:** Leaderboard screen shows "Loading..." forever if the backend is unreachable.
**Fix:** Add AbortController with timeout, matching the pattern used in `submitScore`.

---

## MEDIUM ISSUES (8)

### [M1] `datetime.utcnow()` is Deprecated
**Location:** `backend/database.py` lines 65, 136
**Evidence:** Python 3.12 (specified in render.yaml) deprecates `datetime.utcnow()`.
**Fix:** Use `datetime.now(datetime.UTC)` or `datetime.now(timezone.utc)`.

### [M2] No Input Validation on `theme` Field
**Location:** `backend/models.py` `ScoreSubmit`
**Evidence:** `theme: str = "classic"` accepts any string. It's stored in the database but never validated against known themes.
**Impact:** Minor — theme is only stored, not used server-side. But could store arbitrary strings in DB.
**Fix:** Add `Field(pattern=r'^[a-z]+$')` or validate against known theme list.

### [M3] `perfect_count` Sent as `combo` in Submit — Semantic Confusion
**Location:** `index.html` `gameOver()`, `backend/models.py`
**Evidence:** The frontend variable naming is confusing. The payload uses `perfect_count` but the comment in gameOver says `perfectCount: combo`. The backend model expects `perfect_count` which comes from `body.perfect_count`.
**Impact:** Not a bug per se (since both are 0/wrong), but the naming makes it hard to fix H3 correctly.
**Fix:** Rename to be consistent and actually track perfect placements.

### [M4] Bot Command `/stats` Creates Player Records Without auth_date Check
**Location:** `backend/bot.py` `/stats` handler
**Evidence:** When a user sends `/stats` via the bot, `upsert_player` is called, creating/updating a player record. This is fine for bot interactions (Telegram validates the user identity), but the pattern means every `/top` or `/stats` call hits the database.
**Impact:** Unnecessary writes on read operations.
**Fix:** Only `upsert_player` when actually needed, or add a separate read-only player lookup.

### [M5] CORS Allows `null` Origin — Overly Permissive
**Location:** `backend/main.py` lines 37-46
**Evidence:** The custom middleware explicitly allows `null` origin (from Telegram iOS WebApp running in an iframe). While this is necessary for Telegram, it also means any sandboxed iframe can make requests.
**Impact:** Minor — Telegram requires this. But be aware that any iframe on any page could make API calls.
**Fix:** Accept as necessary for Telegram. Add rate limiting to mitigate abuse.

### [M6] Frontend Has No Content Security Policy
**Location:** `index.html` `<head>`
**Evidence:** No CSP headers. The page loads `telegram-web-app.js` from `telegram.org` but has no restrictions on other script sources.
**Impact:** If the hosting is compromised, arbitrary scripts could run.
**Fix:** Add `<meta>` CSP tag restricting script sources.

### [M7] Sprite Cache Key Collision Potential
**Location:** `index.html` `getBlockSprite()`
**Evidence:** Cache key is `${themeId}_${color}_${isPerfect ? 1 : 0}_${size}`. If two different colors produce the same hex value in different themes, they'd share a sprite (unlikely but possible).
**Impact:** Negligible — themeId is part of the key.
**Fix:** No action needed, noting for completeness.

### [M8] Background Objects Array Never Regenerated
**Location:** `index.html` `initBgObjects()`
**Evidence:** `bgObjects` is initialized once at load time with random positions. The objects use modular arithmetic for wrapping, so they loop correctly. But with ~200+ objects checked every frame, this could be optimized.
**Impact:** Minor performance concern. Each frame iterates all bgObjects and checks zone visibility.
**Fix:** Could partition bgObjects by zone and only iterate relevant zones.

---

## LOW ISSUES (5)

### [L1] Hardcoded API URL in Frontend
**Location:** `index.html` `API.init()`
**Evidence:** `this.baseUrl = 'https://tower-stack-qyyd.onrender.com';` is hardcoded. If the backend URL changes, the frontend must be updated.
**Fix:** Use a relative URL or configurable endpoint.

### [L2] No `requirements.txt` Version Pinning for Some Dependencies
**Location:** `backend/requirements.txt`
**Evidence:** Versions are pinned (`==`), which is good. But `python-telegram-bot==21.10` is imported but never actually used (bot uses raw HTTP responses, not the library).
**Fix:** Remove unused `python-telegram-bot` dependency.

### [L3] No Automated Tests for Backend
**Location:** `tests/` directory
**Evidence:** Tests exist only for frontend physics visualization. No pytest files for backend API endpoints.
**Fix:** Add unit tests for auth validation, score submission, leaderboard, and edge cases.

### [L4] `allow_origins` Includes `localhost` in Production CORS
**Location:** `backend/main.py` line 30
**Evidence:** `"http://localhost:*"` and `"http://127.0.0.1:*"` are always allowed.
**Impact:** Not a security issue (localhost only accessible locally), but sloppy for production.
**Fix:** Conditionally add localhost origins based on environment.

### [L5] Frontend `_lastApiResult` and `_lastApiError` on `window`
**Location:** `index.html` `gameOver()` function
**Evidence:** `window._lastApiResult = result` and `window._lastApiError = err` pollute global scope for debug display.
**Impact:** Minor — only visible in game over screen.
**Fix:** Use a proper state object instead of window globals.

---

## TESTING GAPS

1. **No backend tests at all** — Critical endpoints (auth, score submission, leaderboard) have zero test coverage
2. **No edge case testing:** score=0, score=100001, negative heights, duplicate telegram_id
3. **No concurrency testing:** What happens when two score submissions arrive simultaneously for the same player?
4. **No auth edge cases:** expired init_data, malformed init_data, missing user field
5. **No database migration strategy:** Schema changes would require manual intervention
6. **Frontend tests are visualization tools**, not automated test suites — they require human inspection

---

## DEPLOYMENT RISKS

1. **Single instance SQLite** — Will break if scaled to multiple instances (Render can spin up multiple)
2. **No health monitoring** — `/api/health` exists but no alerting configured
3. **No graceful shutdown** — In-flight requests could be interrupted during deploy
4. **Render free tier cold starts** — 50s+ spin-up time; first request will timeout
5. **Database on same disk as code** — redeployment could affect data
6. **No backup/restore strategy** — SQLite data loss is permanent

---

## WHAT'S GOOD

- **Auth implementation is correct** — HMAC-SHA256 validation follows Telegram's spec exactly
- **SQL injection prevention** — All queries use parameterized statements (`?` placeholders)
- **WAL mode enabled** — SQLite configured for concurrent reads
- **Foreign keys enabled** — Data integrity constraints in place
- **Pydantic validation** — Request/response models with type checking
- **Error handling in score submission** — rollback on failure, finally block for connection cleanup
- **Sprite caching** — Smart performance optimization for block rendering
- **Theme system** — Well-structured with clean separation
- **Frontend physics** — Well-tuned game feel with proper dt capping (`Math.min(dt, 1/30)`)

---

## HEALTH SCORE

```
  Security:     ████████░░  35/100  (committed secrets, no webhook auth, replay attacks)
  Reliability:  ██████░░░░  55/100  (SQLite is OK for scale, but no backups, cold starts)
  Performance:  █████░░░░░  50/100  (O(N²) rank query, unbounded sprite cache)
  Correctness:  ███████░░░  60/100  (perfect_count/durationMs always wrong, combo tracking bug)
  Testability:  ██░░░░░░░░  20/100  (zero backend tests, frontend tests are manual)

  OVERALL:      █████░░░░░  44/100
```

---

## SHIP READINESS: **NOT READY**

5 critical issues must be addressed before production deployment.

## RECOMMENDATIONS

1. **IMMEDIATE:** Revoke and rotate the committed bot token (C1)
2. **IMMEDIATE:** Add webhook secret validation (C4)
3. **IMMEDIATE:** Add `auth_date` validation to prevent replay attacks (C5)
4. **THIS SPRINT:** Fix `perfectCount` and `durationMs` tracking (H3, H4)
5. **THIS SPRINT:** Fix the O(N²) rank query (H1)
6. **THIS SPRINT:** Sanitize usernames in bot HTML responses (C5)
7. **NEXT SPRINT:** Add backend test suite (unit + integration)
8. **NEXT SPRINT:** Add database backup strategy
9. **BACKLOG:** Consider PostgreSQL migration for production
10. **BACKLOG:** Remove unused `python-telegram-bot` dependency
