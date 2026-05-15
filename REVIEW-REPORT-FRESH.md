# Code Review: Tower Stack

**Date:** 2025-05-15  
**Reviewer:** gstack-review (automated)  
**Files reviewed:** `index.html` (3118 lines), `backend/main.py`, `backend/auth.py`, `backend/database.py`, `backend/models.py`, `backend/achievements.py`, `backend/bot.py`

---

## Findings

### CRITICAL

**[C1] SECURITY** (confidence: 9/10) `auth.py:47-87` — Authentication bypass when `telegram_webapp_auth` library is not installed AND `HMAC_VALIDATE=true` (default).

The HMAC path at line 131 (`if hmac_enabled`) uses `hmac.new(b"WebAppData", bot_token.encode(), ...)` which is the **legacy method** — but the comment says "currently broken." If `_HAS_LIB=False` and `hmac_enabled=True`, it falls into the HMAC path which *does* validate, but the code comment suggests it was broken at some point. More critically, if `_HAS_LIB=False` and the user sets `HMAC_VALIDATE=false`, the fallback at line 54 parses init_data **without any cryptographic verification** — just freshness check. An attacker can forge any user ID.

**Fix:** Remove the unverified fallback entirely. If neither Ed25519 nor HMAC can be used, reject the request. Never accept unsigned init_data as authentic.

---

**[C2] SECURITY** (confidence: 10/10) `index.html:3115-3117` — Debug endpoint `/api/debug-auth` exposes full HMAC secrets, data-check strings, and hash comparison results to any caller.

The endpoint returns `hash_sha256_token`, `hash_hmac_webappdata`, and match results. An attacker can submit crafted init_data and see the expected hash, effectively getting oracle access to the HMAC. It also leaks `BOT_TOKEN` processing details.

**Fix:** Remove the debug endpoint entirely from production. Gate it behind an environment variable like `DEBUG_ENABLED=true` or restrict to specific IPs.

---

**[C3] SECURITY** (confidence: 8/10) `index.html:gameOver()` — Client sends score directly to the backend. No server-side game validation.

The `submitScore` payload sends `score`, `height`, `best_combo`, `perfect_count`, `duration_ms` all client-provided. A malicious client can submit any score value. The only server-side check is `score < 250000`.

**Fix:** Either implement server-side replay validation (verify score matches height/combo math), or accept this is a casual leaderboard and mitigate with rate limiting + anomaly detection. At minimum, add cross-validation: `score` should roughly equal `height * baseScore` plus combo bonuses.

---

### HIGH

**[H1] SECURITY** (confidence: 8/10) `auth.py:38-43` — `bot_id` extraction from `bot_token` leaks the token into memory and process args.

`bot_token.split(":")[0]` is fine, but the bot_token itself is passed to `validate_init_data` unnecessarily when using Ed25519. The token should only be needed for HMAC fallback.

**Fix:** Only pass `bot_token` when HMAC validation is actually going to be used.

---

**[H2] SECURITY** (confidence: 7/10) `bot.py:55-60` — Webhook response sends raw HTML user-controlled data without sanitization.

`format_leaderboard_text` and `format_stats_text` use `<b>{e['username']}</b>` and similar. If a user sets their Telegram first_name to `<script>alert(1)</script>` or `</b><b>evil`, it could break the HTML. Telegram's HTML parser is limited, but injection of closing tags is possible.

**Fix:** Escape HTML entities in username/first_name before embedding in HTML. Use `html.escape()`.

---

**[H3] BUG** (confidence: 8/10) `index.html:landBlock()` — Non-perfect combo multiplier calculation is inconsistent.

When a block lands non-perfectly: `const multiplier = combo + 1; score += CFG.baseScore * multiplier;` — but `combo` was NOT reset on non-perfect land (combo is only reset on miss). So non-perfect placements also benefit from the combo counter. Later: `const floatEarned = isPerfect ? ... : CFG.baseScore * (combo + 1);` — this uses `combo + 1` after combo was potentially incremented (if perfect). The float text and actual score may not match.

**Fix:** Decide clearly: does combo reset on non-perfect? If yes, reset it. If no, the multiplier naming is confusing. Also ensure `floatEarned` matches the actual earned amount.

---

**[H4] BUG** (confidence: 7/10) `index.html:drawFallingBlock()` — Wobble transform applied to falling block but collision uses raw coordinates.

`landBlock()` calculates overlap using `fb.x` and `top.x` (raw world coords), but both the tower and falling block are rendered with wobble rotation. When wobble is large, the visual position diverges from the physics position. The code comment acknowledges this was intentional for consistency, but it means the *gameplay* overlap doesn't match what the player *sees*. At high wobble angles this could make blocks appear to land where they shouldn't (or vice versa).

**Fix:** Either apply wobble rotation to collision math, or remove wobble from the falling block rendering. The current "same visual transform" approach is correct for *visual* consistency but the landing check should ideally be in the same coordinate space.

---

**[H5] PERFORMANCE** (confidence: 9/10) `index.html:drawBackgroundClassic()` — Iterates over all `bgObjects` (200+ objects) every frame with zone filtering.

Each frame, `drawBackgroundClassic` loops through all background objects checking zone and screen bounds. With 200+ objects this is ~200 comparisons per frame — not terrible, but the `initBgObjects()` generates objects for ALL zones upfront.

**Fix:** Pre-partition bgObjects by zone for O(1) zone lookup. Only iterate objects in current + adjacent zones.

---

**[H6] BUG** (confidence: 7/10) `database.py:get_leaderboard()` — Weekly leaderboard `cutoff` calculation is wrong.

```python
cutoff = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
days_since_monday = cutoff.weekday()
cutoff = cutoff - timedelta(days=days_since_monday)
```

This gives Monday 00:00 UTC, but `weekday()` returns 0=Monday. So if today is Wednesday (weekday=2), cutoff goes back to Monday. That's correct. However, `datetime.utcnow()` is deprecated since Python 3.12 and the leaderboard uses string comparison for `created_at` which is stored as ISO format from `datetime.utcnow().isoformat()`. The string comparison works because ISO format is lexicographically sortable, but only if all timestamps use the same timezone (they do — all UTC).

**Fix:** Use `datetime.now(timezone.utc)` instead of deprecated `utcnow()`. Also `created_at` should store timezone-aware datetimes.

---

### MEDIUM

**[M1] BUG** (confidence: 6/10) `index.html:handleAction()` — Game over state immediately restarts on tap with no confirmation.

`case STATES.GAME_OVER: startGame(); break;` — tapping anywhere during game over immediately starts a new game. There's a `gameOverTimer` but it's only used for the slide-up animation, not as a debounce for input.

**Fix:** Add a minimum delay (e.g., 0.5s) before accepting restart taps, or require tapping the RETRY button specifically.

---

**[M2] PERFORMANCE** (confidence: 7/10) `index.html:SPRITE_CACHE` — Sprite cache key includes theme+color+perfect+size. On resize, `Object.keys(SPRITE_CACHE).forEach(k => delete SPRITE_CACHE[k])` clears all entries. But during gameplay, sprites are only invalidated by settings changes.

Actually the cache is well-managed. The issue is that `getBlockSprite` creates a new offscreen canvas for every unique combination, and with 6 colors × 2 states × variable sizes, there could be many entries. Not a real leak though.

**Verdict:** Minor, not worth fixing.

---

**[M3] CODE QUALITY** (confidence: 9/10) `index.html` — 3118 lines in a single file with no module separation.

All game logic, rendering, UI screens, input handling, API calls, storage, and settings are in one monolithic `<script>` block. Makes the code hard to maintain and test.

**Fix:** Split into modules: `config.js`, `game.js`, `renderer.js`, `api.js`, `storage.js`, `input.js`. Use ES modules or a bundler.

---

**[M4] CODE QUALITY** (confidence: 8/10) `index.html` — No TypeScript, no linting, no build step.

Magic numbers scattered throughout rendering code. `90 * 4` instead of named constants. The `CFG` object helps but many hardcoded values remain in draw functions.

---

**[M5] SECURITY** (confidence: 6/10) `main.py:CORS` — `allow_origins` includes `http://localhost:*` and `http://127.0.0.1:*` with wildcard ports.

This is fine for development but should be removed in production. CORS wildcards on localhost allow any local application to make requests to the API.

**Fix:** Gate localhost origins behind a `DEBUG` environment variable.

---

**[M6] BUG** (confidence: 6/10) `index.html:drawLeaderboardScreen()` — Leaderboard fetch has no loading state management.

The `_lbFetchTimer` prevents re-fetching for 2 seconds, but if the fetch fails, `leaderboardData` stays `null` and the "Loading..." message persists forever. The catch sets `leaderboardData = { period, entries: [] }` so actually after the first failure it shows "No games played yet!" which is misleading.

**Fix:** Track loading/error state separately. Show "Failed to load" on error.

---

**[M7] BUG** (confidence: 5/10) `index.html:dropBlock()` — Block position uses hook + offset rotation, but `fallingBlock.x` doesn't account for the rotation offset correctly.

The block center is computed as `blockCenterX = hookX + (BS/2) * sin(angle)`. When the block then falls with rotation, the physics assumes `fb.x` is the top-left corner: `blockCenterX - BS/2`. But the visual rendering in `drawCrane` draws the block at `hookX - BS/2` rotated by `-angle`. There's a subtle discrepancy between where the block appears on the crane and where `dropBlock()` places it.

**Fix:** Verify the coordinate math matches between crane rendering and drop positioning. Use the same transform pipeline.

---

**[M8] SECURITY** (confidence: 7/10) `database.py` — SQLite with no connection pooling or thread safety.

`get_db()` creates a new `sqlite3.connect()` for every request. SQLite is fine for small scale, but `conn.commit()` and `conn.rollback()` are called manually. If an exception occurs between `get_db()` and the `finally: conn.close()`, the connection leaks. Also, `PRAGMA journal_mode=WAL` is set on every connection — should be set once.

**Fix:** Use a connection pool or context manager. Set WAL once during `init_db()`.

---

### LOW

**[L1] CODE QUALITY** (confidence: 8/10) `backend/models.py:ScoreSubmit` — `best_combo` and `perfect_count` have validators but `height` does not validate consistency with `score`.

**Fix:** Add cross-field validation: score should be reasonable given height.

---

**[L2] CODE QUALITY** (confidence: 7/10) `index.html` — `API.baseUrl` is hardcoded to `https://tower-stack-qyyd.onrender.com`.

Should be configurable via environment or detected from the hosting URL.

**Fix:** Use `window.location.origin` for API calls when hosted on the same domain, or read from a meta tag/config.

---

**[L3] BUG** (confidence: 5/10) `index.html:drawStar()` — Stars use `obj.x` directly but other objects use modular wrapping for animation.

Stars don't move (speed=0), so `obj.x` can be > W. The star would be drawn off-screen. This works because canvas clips, but it's inconsistent.

---

**[L4] CODE QUALITY** (confidence: 6/10) `backend/main.py:_rate_limits` — In-memory rate limiter grows unbounded until threshold.

Eviction only triggers when `len > 10000`. Between evictions, stale entries accumulate. Also, rate limit state is lost on server restart.

**Fix:** Use a proper rate limiter (e.g., `slowapi`) or Redis-backed store for production.

---

**[L5] PERFORMANCE** (confidence: 5/10) `database.py:get_player_stats()` — Rank calculation uses a correlated subquery that's O(n²) on player count.

```sql
SELECT COUNT(*) + 1 FROM players p WHERE (SELECT MAX(score) FROM games WHERE player_id = p.id) > (SELECT MAX(score) FROM games WHERE player_id = ?)
```

This runs two subqueries per player row. At scale this will be slow.

**Fix:** Use a window function: `RANK() OVER (ORDER BY max_score DESC)`.

---

**[L6] CODE QUALITY** (confidence: 7/10) `backend/achievements.py` — Achievement checks are lambdas in a dict, not testable in isolation.

**Fix:** Use named functions for each check. Add unit tests.

---

**[L7] UX** (confidence: 6/10) `index.html:handleAction()` — Input lock is 150ms. On slow devices, the game might feel unresponsive. On fast devices, double-taps could still register within the game-over→restart transition.

---

**[L8] SECURITY** (confidence: 5/10) `backend/main.py` — No request size limit. A malicious client could send a very large `init_data` string.

**Fix:** Add `max_length` to the Pydantic model for `init_data` field.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 6 |
| MEDIUM | 8 |
| LOW | 8 |
| **Total** | **25** |

## Overall Quality Score: **5.5 / 10**

**Ship-readiness verdict: NOT READY**

The game is functional and polished visually, with nice theme support and smooth animations. However, there are serious security concerns:

1. **The debug endpoint leaks HMAC details** — must be removed before any public deployment.
2. **Authentication can be bypassed** when the Ed25519 library is missing and HMAC validation is disabled (which is the default fallback path).
3. **Score submission is entirely trust-based** — no server-side validation of game results.

The code is a well-executed prototype/single-file game but needs significant hardening for production use. The backend is simple and clean but would benefit from proper connection management, rate limiting, and input validation. The monolithic frontend needs splitting for maintainability.

**Recommended priority fixes before shipping:**
1. Remove `/api/debug-auth` endpoint
2. Fix auth bypass in fallback path
3. Add basic score validation (score ≈ height × baseScore + bonuses)
4. Escape HTML in bot responses
5. Add input debounce on game-over screen
