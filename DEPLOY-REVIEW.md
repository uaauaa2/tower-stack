# Deployment Readiness Review — Tower Stack

**Date:** 2026-05-13  
**Reviewer:** Toto (subagent)  
**Branch:** `master` @ `a9f345c`  
**Working tree:** Clean

---

## 1. Infrastructure Summary

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | GitHub Pages | `https://uaauaa2.github.io/tower-stack/` |
| Backend | Render (Web Service) | `https://tower-stack-qyyd.onrender.com` |
| Database | SQLite on Render disk | Mounted at `/opt/render/project/src/data` |
| Bot | Telegram Webhook | Same Render service |

### Current Status
- ✅ **Frontend:** Accessible (HTTP 200, renders "Tower Stack")
- ⚠️ **Backend:** Returns **503** (Service Unavailable / "Application loading") — likely cold start or crashed

---

## 2. Git State

```
Branch: master (up to date with origin/master)
Remotes: origin → https://github.com/uaauaa2/tower-stack.git
Other branches: docs/spec-kit-documentation, feature/002-visual-themes, feature/003-backend, physics-optimize
Last 3 commits:
  a9f345c Add fetch timeout + backend warmup ping + error status display
  9a31883 Make API status more visible on game over (larger, gold color)
  e15f1e9 Debug: add console logs and visual API status on game over
```

---

## 3. Critical Issues 🔴

### 3.1 DB_PATH Mismatch with Render Disk Mount
**Severity: HIGH** — Data loss on redeploy

`render.yaml` mounts the persistent disk at:
```
/opt/render/project/src/data
```

But `database.py` defaults `DB_PATH` to:
```python
os.path.join(os.path.dirname(__file__), "data", "towerstack.db")
```

When running on Render, `__file__` resolves to the service's src directory. If the disk mount path (`/opt/render/project/src/data`) matches `os.path.dirname(__file__) + "/data"`, this works. But this is fragile — if Render changes the working directory or the file is symlinked, the DB could silently fall back to ephemeral storage.

**Fix:** Set `DB_PATH` env var explicitly in `render.yaml`:
```yaml
- key: DB_PATH
  value: "/opt/render/project/src/data/towerstack.db"
```

### 3.2 Backend Returns 503
**Severity: HIGH** — App is down

The backend at `https://tower-stack-qyyd.onrender.com/api/health` returns 503. Possible causes:
- Cold start timeout (Render free tier sleeps after 15 min inactivity)
- Application crash on startup
- Missing env vars (`BOT_TOKEN`, `WEBAPP_URL` not set in Render dashboard)

**Action:** Check Render dashboard logs for startup errors. Verify all env vars are set.

### 3.3 No Graceful Shutdown
**Severity: MEDIUM** — Potential data loss

No shutdown handler exists. In-flight SQLite writes could be interrupted during Render's stop/redeploy cycle.

**Fix:** Add a shutdown event handler:
```python
@app.on_event("shutdown")
def shutdown():
    print("[API] Shutting down...")
```
(Sqlite connections are per-request, so this is low-risk, but good practice.)

---

## 4. Warnings 🟡

### 4.1 Deprecated `on_event("startup")`
**Severity: MEDIUM**

FastAPI's `@app.on_event("startup")` is deprecated since FastAPI 0.103+. Should migrate to `lifespan` context manager:
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    # cleanup

app = FastAPI(lifespan=lifespan)
```

### 4.2 `.env` File Contains Bot Token
**Severity: MEDIUM**

`backend/.env` contains `BOT_TOKEN=8975490170:AAH-...` in plaintext. While `.gitignore` excludes `.env` from git, the file exists locally. Ensure this token is only set via Render's encrypted env vars in production.

**Status:** `.gitignore` correctly excludes `.env` ✅

### 4.3 SQLite on Render Free Tier
**Severity: MEDIUM**

SQLite with WAL mode is a good choice for low traffic, but:
- Free tier disk is 1 GB, ephemeral if not configured correctly
- Concurrent writes are limited (WAL helps but has limits)
- No backup strategy visible

**Recommendation:** For a Telegram mini-app, SQLite is fine. Consider periodic DB backups via a cron job or Render's built-in backup.

### 4.4 `__pycache__` and `.db` in Remote
**Severity: LOW**

`.gitignore` excludes `__pycache__/`, `*.pyc`, `*.db`, `data/`, and `.env`. However, the remote `feature/003-backend` branch may still have tracked cache files. The master branch appears clean.

### 4.5 No Request Logging
**Severity: LOW**

No structured logging middleware. Only `print()` statements for startup. Production should use proper logging:
```python
import logging
logging.basicConfig(level=logging.INFO)
```

### 4.6 Rate Limiter is In-Memory Only
**Severity: LOW**

The `_rate_limits` dict resets on every deploy/restart. For a game, this is acceptable. For production scale, consider Redis or a file-backed store.

---

## 5. What's Working Well ✅

| Area | Status | Notes |
|------|--------|-------|
| Secrets via env vars | ✅ | `BOT_TOKEN` and `WEBAPP_URL` read from env |
| `.gitignore` | ✅ | `.env`, `__pycache__`, `*.db`, `data/` all excluded |
| CORS | ✅ | Allows GitHub Pages, Telegram, localhost, and `null` origin |
| Health endpoint | ✅ | `/api/health` checks DB connectivity |
| Input validation | ✅ | Score/height bounds, rate limiting, Telegram auth |
| DB schema | ✅ | Auto-creates tables, proper indexes |
| Dependencies pinned | ✅ | All versions pinned in `requirements.txt` |
| Null origin middleware | ✅ | Handles Telegram iOS WebApp correctly |
| Error handling | ✅ | try/except with rollback on DB errors |
| Frontend-backend URL | ✅ | Hardcoded to live Render URL |

---

## 6. Recommendations (Priority Order)

1. **Fix backend 503** — Check Render logs, verify env vars are set
2. **Set `DB_PATH` env var** explicitly in `render.yaml` to match disk mount
3. **Add proper logging** — Replace `print()` with `logging` module
4. **Migrate to `lifespan`** — Replace deprecated `on_event("startup")`
5. **Add shutdown handler** — For graceful cleanup
6. **Add CORS for `null` in main middleware** — Currently handled by custom middleware but not in the CORSMiddleware list (minor, already works via the custom middleware)
7. **Consider DB backup** — At minimum, document how to restore

---

## 7. Deployment Checklist

- [x] All secrets in environment variables (not hardcoded in source)
- [x] `.env` excluded from git
- [x] Database auto-initialization on startup
- [x] Error handling with try/except and rollback
- [x] CORS configured for production origins
- [x] Health check endpoint exists
- [x] Dependencies pinned with exact versions
- [x] No debug mode in production (no `debug=True` anywhere)
- [ ] **Backend actually running** (currently 503)
- [ ] **DB_PATH explicitly set** in render.yaml
- [ ] Graceful shutdown handling
- [ ] Production logging configured

---

*Generated by Toto 🤔 — 2026-05-13*
