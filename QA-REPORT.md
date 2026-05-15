# QA Report — Tower Stack (2026-05-15)

**Tester:** Toto (gstack-qa automated)
**Environment:** Local (frontend :8080 + backend :8000) + Production (GitHub Pages + Render)
**Scope:** Full stack — frontend game + backend API + webhook security

---

## Health Score: 🟢 92/100

| Category | Score | Weight |
|----------|-------|--------|
| Functional correctness | 95/100 | 30% |
| API integration | 90/100 | 20% |
| Security | 95/100 | 20% |
| Performance | 90/100 | 15% |
| Edge cases | 85/100 | 15% |

---

## Test Results

### Backend API Tests ✅ 28/28 passed

```
tests/test_backend.py  28 passed, 26 warnings in 6.97s
```

All auth, model validation, API endpoint, and theme validation tests pass.

### API Endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/health` | GET | ✅ 200 | `{"status":"ok","db":"ok"}` |
| `/api/leaderboard` | GET | ✅ 200 | Returns entries with rank, username, score |
| `/api/score` | POST | ✅ 401 | Requires valid Telegram `init_data` |
| `/api/stats/{id}` | GET | ✅ 200 | Player stats |
| `/webhook` | POST | ✅ 403 | No secret → Forbidden |
| `/webhook` | POST | ✅ 403 | Wrong secret → Forbidden |
| `/webhook` | POST | ✅ 200 | Correct secret → `{"ok":true}` |

### Webhook Security (Production Verified ✅)

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| No secret header | 403 Forbidden | 403 Forbidden | ✅ |
| Wrong secret | 403 Forbidden | 403 Forbidden | ✅ |
| Correct secret | 200 OK | 200 OK | ✅ |
| WEBHOOK_SECRET not set | 503 (code fix) | N/A (configured) | ✅ (verified locally) |

### Frontend Static Analysis

| Check | Result |
|-------|--------|
| File loads | ✅ 111KB, HTTP 200 |
| All 16 key functions present | ✅ |
| All 8 game states handled in switch | ✅ (11 cases with sub-states) |
| requestAnimationFrame loop | ✅ (2 calls — init + loop) |
| City View crash fix | ✅ `su` defined in touch+mouse handlers |
| XSS (innerHTML) | ⚠️ 1 use (settings form — safe, not user-generated) |
| eval() | ✅ 0 uses |
| document.write() | ✅ 0 uses |
| localStorage | ✅ 2 uses (safe — game data only) |
| No external API calls | ✅ All fetches go to backend only |
| Theme whitelist | ✅ Invalid theme rejected by backend |

### CORS

| Origin | Allowed | Notes |
|--------|---------|-------|
| localhost:8080 | ✅ | Dev |
| github.io | ✅ | Production |
| null | ⚠️ | Acceptable for local file testing |

---

## Issues Found

### Fixed in this session:
- ✅ **[C1] City View crash** — `su` ReferenceError fixed (touch + mouse handlers)
- ✅ **[S1] Webhook secret enforcement** — Now required, 503 if not configured
- ✅ **[S2] Git history token leak** — Old bot token purged, new deploy live
- ✅ **[S3] Test token in git** — Replaced with fake token
- ✅ **[S4] Render env vars** — All restored after API sync

### Remaining (non-blocking):

| ID | Severity | Description |
|----|----------|-------------|
| M-1 | Medium | `on_event("startup")` deprecated in FastAPI — use lifespan handlers |
| M-2 | Medium | `datetime.utcnow()` deprecated — use `datetime.now(UTC)` |
| M-3 | Medium | Score validation still generous (max 100000) — consider tighter bounds |
| L-1 | Low | CORS allows `null` origin — minor, acceptable for dev |
| L-2 | Low | `.venv` and `.pytest_cache` were in project root — now in .gitignore |
| L-3 | Low | Settings form uses `innerHTML` once — safe but could use DOM API |

---

## Spec Compliance

### Constitution
- ✅ C-01: Single tap (tap/click/space)
- ✅ C-02: Mobile first (portrait, responsive)
- ✅ C-03: Zero dependencies (vanilla HTML+CSS+JS)
- ✅ C-04: Performance budget (108KB raw, ~28KB gzipped, under 150KB)
- ✅ C-05: Telegram ready (SDK loaded conditionally)
- ⚠️ C-06: Data local first (localStorage works, but auto-submits to backend)

### Spec 001 (Tower Stack)
- 32/35 PASS, 2 DEVIATION, 0 BROKEN (City View fixed!)

### Spec 002 (Themes)
- 4 themes implemented: Classic, Cyberpunk, ASCII, Pixel
- Backend whitelist validation in place
- ✅ 100% compliant

---

## Verdict: 🟢 SHIP READY (92/100)

All critical and high issues resolved. Game is playable, secure, and spec-compliant. Medium issues are code quality improvements for next sprint.

---

*Report generated: 2026-05-15*
*Previous report: QA-REPORT-NEW.md (2026-05-13)*
