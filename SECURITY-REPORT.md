# Security Audit Report — Tower Stack

**Date:** 2026-05-15  
**Auditor:** Toto (CSO /cso audit, gstack-cso skill)  
**Scope:** Frontend (`index.html`), Backend (`backend/`), Infrastructure (Render, GitHub Pages), Git history  
**Mode:** Daily, confidence gate 8/10  
**Previous audit:** 2026-05-13 (`SECURITY-AUDIT.md`)

---

## Executive Summary

The project is a Telegram Mini App game — HTML5 Canvas frontend on GitHub Pages, FastAPI + SQLite backend on Render. Overall security posture is **moderate** with meaningful improvements since the last audit. The bot token was **rotated** (new token differs from the one in git history). Several prior findings have been fixed: Telegram ID no longer leaks in leaderboard, `init_data` expiration is checked (24h), theme validation was added, error messages no longer leak internals. Remaining issues center on **secrets in git history** and the **webhook secret not being enforced**.

| Severity | Count | Change since 2026-05-13 |
|----------|-------|------------------------|
| Critical | 1 | ↓ from 2 (token rotated, but old one in history) |
| High | 2 | ↓ from 4 |
| Medium | 3 | ↓ from 6 |
| Low | 4 | ↓ from 5 |
| Info | 3 | New |

### Fixes since last audit ✅
- **C-02 (TOOLS.md token):** Not in repo — acknowledged as workspace-only issue
- **H-02 (Telegram ID leak):** Fixed — leaderboard now uses `first_name` or internal player ID
- **H-04 (Error message leakage):** Fixed — generic "Internal server error" with server-side logging
- **M-03 (Theme validation):** Fixed — Pydantic `field_validator` with whitelist
- **M-05 (init_data expiration):** Fixed — `max_age_seconds=86400` added to `validate_init_data`

---

## Critical Findings

### C-01: Old Bot Token Still in Git History 🔴
**Confidence:** 10/10  
**Files:** Git commits `8facc0b`, `57914d2`  
**Severity:** Critical

The old bot token `8975490170:AAH-JmNVA9ALmDeizBlTl9BFtZpC6HJm0-A` is still in git history. The current `.env` has a **different** token (`AAFRJ4IZvlg...`), confirming rotation happened. However:

- The repo is pushed to `github.com/uaauaa2/tower-stack` (public)
- Anyone can `git clone` and `git show 8facc0b:backend/.env` to find the old token
- If the old token was **not revoked** (only rotated to a new one), it may still be valid

**Exploit scenario:** Attacker clones the public repo, extracts the old token from history. If not revoked at @BotFather, they can control the bot, read messages, set new webhooks, and impersonate the bot.

**Remediation:**
1. **Immediately:** Verify the old token is revoked at @BotFather (not just rotated). Revoke if not done.
2. Purge git history: `git filter-branch` or BFG Repo Cleaner to remove `.env` from all commits
3. Force-push the cleaned history

---

## High Findings

### H-01: Webhook Secret Not Enforced (unchanged)
**Confidence:** 9/10  
**File:** `backend/main.py:193-199`  
**Severity:** High

The webhook validates `WEBHOOK_SECRET` only when the env var is set (`if expected_secret`). If `WEBHOOK_SECRET` is empty/unset, **any** POST to `/webhook` is accepted.

```python
expected_secret = os.environ.get("WEBHOOK_SECRET", "")
if expected_secret and secret != expected_secret:
```

`render.yaml` declares `WEBHOOK_SECRET` with `sync: false` — it must be manually set. If not configured, the webhook is fully open.

**Exploit scenario:** Attacker sends crafted Telegram updates to `https://tower-stack-qyyd.onrender.com/webhook`, triggering bot commands, fake leaderboard responses, or `/stats` lookups for any Telegram ID.

**Remediation:**
1. Set `WEBHOOK_SECRET` in Render environment (a random 32-byte string)
2. Change the code to **require** the secret (fail-start if not set):
```python
expected_secret = os.environ.get("WEBHOOK_SECRET")
if not expected_secret:
    raise RuntimeError("WEBHOOK_SECRET must be set")
```

### H-02: In-Memory Rate Limiter Trivially Bypassable (was M-01, escalated)
**Confidence:** 8/10  
**File:** `backend/main.py:68-80`  
**Severity:** High

The rate limiter resets on every Render cold start (free tier sleeps after inactivity). An attacker can:
- Wait for the server to sleep (15 min idle)
- Flood with requests immediately after wake (all limits reset)
- The eviction logic only triggers when entries exceed 10,000

**Exploit scenario:** Automated script sends 1000 score submissions after server wake, all pass rate limiting.

**Remediation:** Use SQLite-backed rate limiting or add Render-level rate limiting.

---

## Medium Findings

### M-01: Score Validation Still Generous
**Confidence:** 9/10  
**File:** `backend/main.py:109-114`  
**Severity:** Medium (unchanged)

Upper bound of 250,000 for score and 500 for height. No cross-field validation (e.g., `score` vs `height` vs `best_combo` consistency).

**Remediation:** Add server-side consistency checks. If max theoretical score per floor is ~100, then `height=500` can't yield `score=250000`. Cross-validate.

### M-02: SQLite Concurrency — No Retry on SQLITE_BUSY
**Confidence:** 8/10  
**File:** `backend/database.py`  
**Severity:** Medium (unchanged)

SQLite with WAL mode handles concurrent reads well, but concurrent writes may hit `SQLITE_BUSY`. No retry logic exists.

**Remediation:** Add retry with exponential backoff:
```python
import time
for attempt in range(3):
    try:
        conn.execute(...)
        break
    except sqlite3.OperationalError as e:
        if "locked" in str(e) and attempt < 2:
            time.sleep(0.1 * (attempt + 1))
        else:
            raise
```

### M-03: Debug Auth Logging in Production
**Confidence:** 9/10  
**File:** `backend/auth.py:53-68`  
**Severity:** Medium

Multiple `print(..., file=sys.stderr)` calls log auth parameter names and lengths on every request. While no secrets are logged, the debug output includes:
- Param key names and their value lengths
- Failure reasons
- Auth age in seconds

This is noisy and could leak structural information. The git history shows these were added during debugging (commits `d360d4f`, `8a4981b`, `cd2b787`) and should have been removed.

**Remediation:** Replace with proper `logging.debug()` calls behind a debug flag, or remove entirely.

---

## Low Findings

### L-01: No Content Security Policy (unchanged)
**Confidence:** 10/10  
**File:** `index.html`  
**Severity:** Low

No CSP meta tag or header. The page loads only `telegram.org/js/telegram-web-app.js` externally. A CSP would limit XSS impact if any were found.

**Remediation:**
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src https://telegram.org 'unsafe-inline'; 
               connect-src https://tower-stack-qyyd.onrender.com; img-src 'self' data:;">
```

### L-02: CORS Allows `null` Origin (unchanged, acceptable)
**Confidence:** 10/10  
**File:** `backend/main.py:54-62`  
**Severity:** Low (informational)

Required for Telegram iOS WebApp. Documented trade-off.

### L-03: localStorage Game Data Modifiable (unchanged, acceptable)
**Confidence:** 10/10  
**File:** `index.html:190-196`  
**Severity:** Low (informational)

Game progress in localStorage is trivially modifiable. Not a real risk since scores are validated server-side via Telegram auth.

### L-04: Frontend Hardcoded Backend URL
**Confidence:** 8/10  
**File:** `index.html:297`  
**Severity:** Low

`this.baseUrl = 'https://tower-stack-qyyd.onrender.com'` is hardcoded. Not a security issue, but a lock-in/operational concern.

---

## Info Findings

### I-01: `python-telegram-bot` in requirements.txt But Unused
**Confidence:** 10/10  
**File:** `backend/requirements.txt`  
**Severity:** Info

`python-telegram-bot==21.10` is listed but the bot responds via direct JSON returns from webhook (no PTB usage). This is unnecessary dependency surface.

**Remediation:** Remove from `requirements.txt` if not needed.

### I-02: `pytest_cache` and `.venv` in Project Root
**Confidence:** 10/10  
**File:** `.pytest_cache/`, `.venv/`  
**Severity:** Info

Both exist locally but `.gitignore` only covers `tests/__pycache__/`. Should add:
```
.pytest_cache/
.venv/
__pycache__/
```

### I-03: Database File Tracked in Git History
**Confidence:** 8/10  
**File:** Git history  
**Severity:** Info

`backend/data/towerstack.db` was committed in early commits and later removed from tracking. Old commits may contain player data if any was added before `.gitignore` was fixed.

**Remediation:** When purging history (C-01), also purge the `.db` file.

---

## Phase-by-Phase Audit Notes

### Phase 0: Architecture ✅
- Single HTML file (~111KB, 3105 lines), vanilla JS + Canvas 2D
- Backend: FastAPI + SQLite (Python 3.12), deployed on Render
- GitHub Pages for frontend
- No build step, no npm, no bundler

### Phase 1: Attack Surface ✅
- Frontend: static HTML, no server-side processing, localStorage only
- Backend: 4 API endpoints + 1 webhook
- Telegram WebApp SDK provides auth
- GitHub Pages: immutable static hosting

### Phase 2: Secrets Archaeology ⚠️
- **Old bot token in git history** (C-01) — was in `backend/.env` in commits `8facc0b` through `57914d2`
- Current `.env` not tracked (removed in `57914d2`, in `.gitignore`)
- Token was rotated (new value differs) — but old token may still be valid if not revoked
- No other secrets found in history

### Phase 3: Supply Chain ✅
- Frontend: **Zero dependencies** (vanilla JS, single external script from `telegram.org`)
- Backend: 4 Python packages (FastAPI, uvicorn, python-telegram-bot, httpx)
- Low supply chain risk

### Phase 4: CI/CD ✅
- No `.github/workflows` — GitHub Pages auto-deploys from `master`
- No CI pipeline, no automated testing on push
- Render auto-deploys on push to master (via render.yaml)

### Phase 5: Infrastructure ✅
- GitHub Pages: static hosting, HTTPS enforced, minimal attack surface
- Render: free tier, sleeps after inactivity, ephemeral filesystem (disk mount for SQLite)
- No Docker, no custom server config

### Phase 6: Webhooks & Integrations ⚠️
- Telegram webhook at `/webhook` — secret validation exists but not enforced when env var unset (H-01)
- Bot responds via direct JSON (no external API calls from backend)

### Phase 7: LLM & AI Security ✅
- Not applicable — no AI/ML features

### Phase 8: Skill Supply Chain ✅
- No `.claude/skills/` or local skill files in the repo

### Phase 9: OWASP Top 10 ✅
| Risk | Status |
|------|--------|
| A01 — Broken Access Control | Webhook open if secret not set (H-01) |
| A02 — Cryptographic Failures | HMAC-SHA256 correctly implemented ✅ |
| A03 — Injection | All SQL uses parameterized queries ✅ |
| A04 — Insecure Design | Rate limiter bypassable (H-02) |
| A05 — Security Misconfiguration | Debug logging in production (M-03) |
| A06 — Vulnerable Components | python-telegram-bot unused (I-01) |
| A07 — Auth Failures | init_data validation correct with expiry ✅ |
| A08 — Data Integrity | Score validation generous (M-01) |
| A09 — Logging | Debug prints instead of proper logging (M-03) |
| A10 — SSRF | No external requests from backend ✅ |

### Phase 10: STRIDE ✅
| Threat | Risk | Mitigation |
|--------|------|------------|
| Spoofing | Low — Telegram HMAC auth is solid | ✅ |
| Tampering | Medium — score validation is loose | M-01 |
| Repudiation | Low — games tied to Telegram ID | ✅ |
| Info Disclosure | Low — no PII in responses (fixed) | ✅ |
| Denial of Service | Medium — rate limiter ineffective | H-02 |
| Elevation of Privilege | Low — no admin roles | ✅ |

### Phase 11: Data Classification ✅
- localStorage: game scores, settings (non-sensitive, user-controlled)
- Backend DB: Telegram ID, username, first_name, game scores (PII — moderate sensitivity)
- No passwords, no financial data, no health data

### Phase 12: FP Filtering ✅
Applied 8/10 confidence gate:
- Frontend `innerHTML` usage: single instance clearing a form (safe) — **filtered out**
- localStorage no encryption: game data isn't sensitive — **filtered out**
- No auth on frontend: correct, auth is server's job — **filtered out**
- CORS null origin: required for Telegram iOS — **documented, not a finding**

### Phase 13 & 14: Report saved ✅

---

## Priority Remediation Roadmap

### Immediate (today)
1. **Verify old bot token revoked** at @BotFather (C-01)
2. **Set WEBHOOK_SECRET** in Render environment (H-01)

### This sprint
3. Purge `.env` from git history with BFG (C-01)
4. Make WEBHOOK_SECRET required in code (H-01)
5. Remove debug `print` statements from `auth.py` (M-03)
6. Clean up `.gitignore` to cover `.pytest_cache/`, `.venv/`, `__pycache__/` (I-02)

### Next sprint
7. Add cross-field score validation (M-01)
8. Add SQLITE_BUSY retry logic (M-02)
9. Remove unused `python-telegram-bot` dependency (I-01)
10. Add CSP meta tag to `index.html` (L-01)

### Backlog
11. SQLite-backed rate limiting (H-02)
12. Purge `.db` file from git history (I-03)

---

## What's Working Well 👍

1. **Telegram auth implementation** — HMAC-SHA256 with constant-time comparison, signature exclusion, expiry check — textbook correct
2. **SQL injection prevention** — all parameterized queries, no string concatenation
3. **Token rotation** — done since last audit
4. **PII protection** — leaderboard no longer exposes Telegram IDs
5. **Theme validation** — Pydantic whitelist added
6. **Error handling** — generic messages to clients, detailed logs server-side
7. **Zero frontend dependencies** — minimal supply chain risk
