# Security Audit Report — Tower Stack

**Date:** 2026-05-13  
**Auditor:** Automated review  
**Scope:** Frontend (index.html), Backend (FastAPI), Infrastructure (render.yaml, .env)

---

## Summary

The project is a Telegram Mini App game with a FastAPI + SQLite backend. Overall security posture is **moderate** — the Telegram auth validation is correctly implemented, SQL injection is prevented via parameterized queries, and input validation exists for score/height. However, several issues need attention, including a leaked bot token in version control, an unauthenticated webhook endpoint, PII leakage, and missing security headers.

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 6 |
| Low | 5 |

---

## Critical Findings

### C-01: Bot Token Committed to Version Control
**File:** `backend/.env`  
**Severity:** Critical

The `.env` file contains a live bot token (`8975490170:AAH-JmNVA9ALmDeizBlTl9BFtZpC6HJm0-A`) and appears to be tracked in the repository. If this repo is public or becomes public, anyone can:
- Control the bot
- Read/update webhook settings
- Impersonate the bot

**Remediation:**
1. Revoke the exposed token immediately via @BotFather
2. Add `.env` to `.gitignore`
3. Use Render's secret environment variables exclusively
4. Run `git filter-branch` or `BFG` to purge history if already pushed

### C-02: Bot Token Hardcoded in Frontend (TOOLS.md)
**File:** (workspace `TOOLS.md` — separate Telegram bot credentials listed)  
**Severity:** Critical

The workspace `TOOLS.md` contains a **different** Telegram bot token (`8255404931:AAH0QAzBAqoUl1ESoJBLasU5oLhnmcb5_fw`) along with API credentials. While this isn't in the tower-stack repo itself, it's accessible in the same workspace and could be accidentally committed.

**Remediation:** Move secrets to a vault or environment-only storage. Never store tokens in markdown files.

---

## High Findings

### H-01: Telegram Webhook Endpoint Unauthenticated
**File:** `backend/main.py:175-184`  
**Severity:** High

The `/webhook` endpoint accepts any POST request with JSON body. The comment acknowledges this:
```python
# In production, validate with secret_token set on webhook registration
```
An attacker can send crafted updates to impersonate users, inject fake `/top` commands, or trigger bot responses at will.

**Remediation:** Validate the `X-Telegram-Bot-Api-Secret-Token` header against a configured secret, as documented in [Telegram's webhook security](https://core.telegram.org/bots/api#setwebhook).

### H-02: Telegram ID Leaked in Leaderboard API
**File:** `backend/database.py:162`  
**Severity:** High

When a player has no username, the leaderboard response exposes their Telegram ID:
```python
"username": r["username"] or f"Player #{r['telegram_id']}",
```
This leaks PII (Telegram IDs are permanent user identifiers) to all leaderboard consumers.

**Remediation:** Use `first_name` as fallback, or generate an anonymous identifier: `r["first_name"] or f"Player {r['id']}"` (using internal player ID, not telegram_id).

### H-03: No Authentication on Leaderboard Endpoint
**File:** `backend/main.py:155-163`  
**Severity:** Medium → High (escalated for data harvesting)

The `GET /api/leaderboard` endpoint requires no authentication. While leaderboards are typically public, combined with H-02, this allows unauthenticated mass harvesting of Telegram IDs.

**Remediation:** At minimum, add rate limiting to this endpoint. Consider requiring Telegram auth for full access, or return anonymized data.

### H-04: Error Messages Leak Internal Details
**File:** `backend/main.py:111`  
**Severity:** High

Exceptions are returned verbatim to clients:
```python
raise HTTPException(status_code=500, detail=str(e))
```
This can expose database schema details, file paths, and internal state.

**Remediation:** Log the full exception server-side, return a generic error:
```python
except Exception as e:
    conn.rollback()
    print(f"[ERROR] {e}")  # server-side log
    raise HTTPException(status_code=500, detail="Internal server error")
```

---

## Medium Findings

### M-01: In-Memory Rate Limiter Resets on Deploy
**File:** `backend/main.py:52-55`  
**Severity:** Medium

The rate limiter uses a Python dict (`_rate_limits`) that resets on every server restart/deploy. On Render's free tier, the server sleeps after inactivity, so rate limits are trivially bypassable.

**Remediation:** Use a persistent store (Redis, or a SQLite-backed rate limiter) for production.

### M-02: Score Validation Too Loose
**File:** `backend/main.py:94-98`  
**Severity:** Medium

The upper bound of 100,000 for scores and 500 for height may be too generous. If the game's realistic maximum is much lower, cheaters can submit inflated-but-plausible scores.

**Remediation:** Calculate realistic maximums based on game mechanics and tighten bounds. Consider server-side score verification (e.g., validate that score is consistent with height + combos).

### M-03: No Input Validation on `theme` Field
**File:** `backend/models.py:14`  
**Severity:** Medium

The `theme` field in `ScoreSubmit` is a free-form string with no validation. While it's stored in SQLite as a TEXT field (no injection risk via parameterized queries), arbitrary strings are persisted to the database.

**Remediation:** Validate against a whitelist:
```python
from pydantic import field_validator

VALID_THEMES = {"classic", "cyberpunk", "ascii", "pixel"}

class ScoreSubmit(BaseModel):
    theme: str = "classic"
    
    @field_validator("theme")
    def validate_theme(cls, v):
        if v not in VALID_THEMES:
            raise ValueError("Invalid theme")
        return v
```

### M-04: No Duration/Combo Validation
**File:** `backend/main.py`  
**Severity:** Medium

`best_combo`, `perfect_count`, `duration_ms`, and `height` are not validated server-side beyond basic range checks. A client could submit `best_combo=9999` with `score=100`.

**Remediation:** Add cross-field validation (e.g., score should be roughly consistent with height × baseScore + combo bonuses).

### M-05: init_data Expiration Not Checked
**File:** `backend/auth.py`  
**Severity:** Medium

The `validate_init_data` function correctly validates the HMAC signature but does **not** check the `auth_date` parameter for staleness. A captured `init_data` can be replayed indefinitely.

**Remediation:**
```python
auth_date = int(params.get("auth_date", 0))
if time.time() - auth_date > 86400:  # 24 hours
    return None
```

### M-06: SQLite on Render Disk — Concurrency Concerns
**File:** `backend/database.py`, `backend/render.yaml`  
**Severity:** Medium

SQLite with WAL mode is used, which is good for concurrent reads, but under high write load (multiple concurrent score submissions), `SQLITE_BUSY` errors may occur. The code has no retry logic.

**Remediation:** Add retry logic for `SQLITE_BUSY`, or consider PostgreSQL (Render supports it natively).

---

## Low Findings

### L-01: No Content Security Policy
**File:** `index.html`  
**Severity:** Low

No CSP headers or meta tag. The page loads scripts from `telegram.org` but has no CSP restricting other sources.

**Remediation:** Add a CSP meta tag:
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src https://telegram.org 'unsafe-inline'; connect-src https://tower-stack-qyyd.onrender.com">
```

### L-02: CORS Allows `null` Origin
**File:** `backend/main.py:33-46`  
**Severity:** Low

The middleware explicitly allows `Origin: null` (from Telegram iOS). While necessary for the app to function, `null` origin can also come from sandboxed iframes, data URLs, and redirects. This is an acceptable trade-off for Telegram WebApp support but should be documented.

### L-03: No HTTPS Enforcement in Backend
**File:** `backend/render.yaml`  
**Severity:** Low

Render handles HTTPS termination, so the app itself doesn't enforce it. This is acceptable for Render deployment but would need attention if self-hosted.

### L-04: Frontend `innerHTML` Usage
**File:** `index.html:2969`  
**Severity:** Low

One instance of `form.innerHTML = ''` (clearing a form). This is safe as it doesn't inject user-controlled content. No other `innerHTML`, `document.write`, or `eval` usage found.

### L-05: localStorage Stores Game Data Without Encryption
**File:** `index.html:190-196`  
**Severity:** Low

Game progress is stored in localStorage as plain JSON. This is standard for client-side games. The data is not sensitive (scores, settings), so encryption is unnecessary. However, it's trivially modifiable by users — game data should be validated server-side (which it is, via Telegram auth).

---

## Positive Security Observations

1. **SQL Injection Prevention:** All database queries use parameterized queries (`?` placeholders). No string concatenation in SQL. ✅
2. **Telegram Auth:** HMAC-SHA256 validation is correctly implemented with constant-time comparison (`hmac.compare_digest`). ✅
3. **CORS Configuration:** Properly restricted to known origins (GitHub Pages, Telegram domains). ✅
4. **Pydantic Models:** Request/response validation via Pydantic provides type safety. ✅
5. **No Hardcoded Backend URL in HTML:** The API base URL is set programmatically. ✅
6. **Foreign Keys Enabled:** `PRAGMA foreign_keys=ON` ensures referential integrity. ✅
7. **WAL Mode:** Write-Ahead Logging improves concurrent read performance. ✅

---

## Priority Remediation Order

1. **Immediately:** Revoke and rotate the exposed bot token (C-01)
2. **Before next deploy:** Add webhook secret validation (H-01), fix error message leakage (H-04)
3. **This sprint:** Fix Telegram ID leak (H-02), add init_data expiration check (M-05)
4. **Next sprint:** Tighten score validation (M-02, M-04), add theme whitelist (M-03), add persistent rate limiting (M-01)
5. **Backlog:** Add CSP headers (L-01), document null-origin CORS (L-02)
