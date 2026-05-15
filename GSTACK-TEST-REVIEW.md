# Tower Stack — Code Review

**Date:** 2026-05-14  
**Reviewer:** Crush (gstack /review)  
**Branch:** master  
**Diff:** Full project review (no branch diff — reviewing HEAD against empty base)

---

## Scope Check: CLEAN

**Intent:** Tower Bloxx-style web game, single-file HTML, Telegram Mini App, backend API.  
**Delivered:** Complete game engine, 4 visual themes, settings panel, city view, leaderboard, player stats, Telegram auth, FastAPI backend with SQLite, bot webhook. All Phase 1 tasks done. Phase 2 partially done (Telegram SDK loaded, haptics wired, but no BotFather setup instructions).

---

## Findings

### CRITICAL

**[P1] (confidence: 9/10) backend/auth.py:39 — `parse_qs` silently truncates duplicate keys**

`urllib.parse.parse_qs` returns lists per key. The code takes `v[0]`, silently discarding duplicates. If Telegram ever sends duplicate `user=` or `hash=` params, the wrong value is used. This is fine today but fragile — the Telegram API contract doesn't guarantee single-value params.

**Fix:** Use `parse_qsl` with strict validation, or at least log when duplicates are detected.

---

**[P1] (confidence: 8/10) backend/database.py:67 — `datetime.utcnow()` is deprecated since Python 3.12**

The project uses Python 3.12+. `datetime.utcnow()` returns naive datetime objects and is deprecated. All timestamps stored as naive UTC will break if any future code compares with timezone-aware datetimes.

**Fix:** Replace with `datetime.now(datetime.UTC)` or `datetime.now(timezone.utc)`.

---

**[P1] (confidence: 7/10) index.html:392 — Backend warmup fires unconditionally on page load**

```js
fetch(API.baseUrl + '/api/health').then(...)
```

This fires on every page load regardless of context (Telegram, browser, dev). It hits the Render backend on every visit, including non-Telegram users who never need the API. Wastes Render free-tier hours and adds latency.

**Fix:** Gate on `API.isTelegram()` or defer until the user navigates to leaderboard/stats.

---

### INFORMATIONAL

**[P2] (confidence: 8/10) index.html:297 — Hardcoded production API URL**

```js
this.baseUrl = 'https://tower-stack-qyyd.onrender.com';
```

No way to override for local dev, staging, or testing without editing source. The comment says "Local dev: empty = same origin" but the code always sets the Render URL.

**Fix:** Use an env-like pattern: `this.baseUrl = window.__API_URL || 'https://tower-stack-qyyd.onrender.com'`.

---

**[P2] (confidence: 8/10) index.html:193 — Silent `catch {}` swallows localStorage errors**

```js
} catch { return { ...this._defaults, towers: [] }; }
```

If localStorage is full or corrupted, the user silently loses data. Same pattern in `save()`.

**Fix:** Log the error at minimum: `catch(e) { console.warn('Storage error:', e); ... }`.

---

**[P2] (confidence: 7/10) backend/main.py:56 — In-memory rate limiter resets on server restart**

The `_rate_limits` dict is lost on every deploy, and the eviction only triggers when the dict exceeds 10k entries. A burst of submissions right after deploy has zero rate limiting.

**Fix:** For MVP this is fine. For production, use Redis or a proper middleware like `slowapi`.

---

**[P2] (confidence: 7/10) index.html:3105 — Single 3100-line file violates maintainability**

The spec says "single file deployment" is intentional (C-03), and it works for an MVP. But 3100 lines with 4 themes, 15+ background object types, settings UI, and an API module is approaching the limit where refactoring into modules with a build step would save significant development time.

**Observation only** — the spec explicitly chose this. Not flagging as a fix.

---

**[P2] (confidence: 6/10) index.html:856 — City scroll uses undeclared `su` variable**

```js
const maxScroll = Math.max(0, (Storage.load().towers.length) * su * 2.8 - W + su * 3);
```

The variable `su` is used here and at line 880, but `su` is only defined inside draw functions (e.g., `drawCityView`, `drawHUD`) as `const su = Math.max(14, W * 0.065)`. At the touch/mouse event handler scope, `su` is not in scope. This works by accident if `drawCityView` ran recently and `su` leaked as a global — but with `const`, it shouldn't. This is likely a bug that only works because of hoisting behavior or browser-specific scoping.

**Fix:** Define `su` at the top of the event handler, or compute it inline.

---

**[P2] (confidence: 6/10) backend/database.py:110-112 — Rank query is O(n²)**

```sql
SELECT COUNT(*) + 1 as rank FROM players p
WHERE (SELECT COALESCE(MAX(score), 0) FROM games WHERE player_id = p.id)
    > (SELECT COALESCE(MAX(score), 0) FROM games WHERE player_id = ?)
```

This runs two correlated subqueries per player row. With 10k players and 100k games, this query becomes very slow.

**Fix:** Use a window function or materialized view: `RANK() OVER (ORDER BY max_score DESC)`.

---

**[P2] (confidence: 5/10) index.html:34 — Telegram SDK loaded synchronously in `<head>`**

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

This blocks rendering if Telegram's CDN is slow. The game can't start rendering until this script loads, even outside Telegram.

**Fix:** Add `async` or `defer`, and gate `TelegramWebApp` usage on it being loaded.

---

## Spec Compliance

| Spec Requirement | Status | Notes |
|-----------------|--------|-------|
| Single tap input | DONE | Touch + mouse + keyboard all wired |
| 3 misses → game over | DONE | Lives system with hearts display |
| No overhang cutting | DONE | Blocks land at full size |
| Tower wobble from off-center | DONE | Spring-damper wobble system |
| Cable elasticity | DONE | 4% stretch with soft spring |
| Background zones (8 zones) | DONE | Procedural with smooth transitions |
| City view with skyline | DONE | Scrollable, sorted by height |
| localStorage persistence | DONE | Max 50 towers stored |
| Telegram Mini App ready | PARTIAL | SDK loaded, haptics wired, no Bot setup doc |
| Backend API | DONE | FastAPI + SQLite on Render |
| 60 FPS / <150KB | NOT VERIFIED | No perf test or bundle size check in repo |
| Offline (service worker) | NOT DONE | Spec requirement T23, Phase 3 |

---

## Summary

**6 findings** (3 critical, 7 informational).  
**PR Quality Score: 5.5/10**

The game is feature-complete for Phase 1. The main risks are:
1. Backend auth is correct but has fragile edge cases
2. The hardcoded API URL blocks dev/test workflows
3. The `su` variable scoping in city scroll handlers is a latent bug

The 3100-line single file is technically meeting the spec constraint but is approaching the point where a build step would pay for itself in development velocity.
