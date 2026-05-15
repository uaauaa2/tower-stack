# QA Report — Tower Stack (Fresh Test)

**Date:** 2026-05-15 20:13 GMT+3  
**Tester:** Toto (automated QA via gstack-qa)  
**Commit:** latest (index.html 111,896 bytes, 3118 lines)  
**Frontend:** http://localhost:8080 (python3 http.server)  
**Backend:** http://localhost:8000 (uvicorn + FastAPI)  
**Browser:** Chrome headless (via OpenClaw browser tool)

---

## 1. Server Startup

| Component | Status | Notes |
|-----------|--------|-------|
| Backend (port 8000) | ✅ PASS | Started with uvicorn. DeprecationWarning for `on_event("startup")` (cosmetic). |
| Frontend (port 8080) | ✅ PASS | Static server running. Port was already in use from prior instance. |
| DB initialization | ✅ PASS | SQLite WAL mode, foreign keys ON. Auto-creates tables. |

---

## 2. Backend API Tests

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/health` | GET | ✅ PASS | Returns `{"status":"ok","db":"ok"}` |
| `/api/leaderboard?period=all` | GET | ✅ PASS | Returns ranked entries with username, score, height, date |
| `/api/leaderboard?period=week` | GET | ✅ PASS | Returns period-filtered leaderboard |
| `/api/score` | POST | ✅ PASS | Rejects invalid Telegram auth with `{"detail":"Invalid Telegram auth"}` |
| `/api/stats` | POST | ✅ PASS | Rejects invalid Telegram auth correctly |
| `/webhook` | POST | ⚠️ SKIPPED | Requires WEBHOOK_SECRET env var — not tested locally |

---

## 3. Frontend — Page Load

| Test | Status | Notes |
|------|--------|-------|
| Canvas element exists | ✅ PASS | `<canvas id="game">` renders correctly |
| Viewport meta tag | ✅ PASS | `width=device-width, initial-scale=1.0, user-scalable=no` |
| Touch-action: none | ✅ PASS | Prevents browser gestures during gameplay |
| Body overflow: hidden | ✅ PASS | No scroll bars |
| Telegram SDK loaded | ✅ PASS | `window.Telegram` detected (degrades gracefully without TG) |
| DPR scaling | ✅ PASS | Canvas uses `devicePixelRatio` for crisp rendering |
| Console errors | ✅ PASS | Only missing `favicon.ico` (cosmetic) |
| Background renders | ✅ PASS | Dark background `#1a1a2e` confirmed via pixel sampling |

---

## 4. Game Flow Analysis (Code Review)

### 4.1 Game Start (MENU → PLAYING)
- ✅ **startGame()** resets all state: score, combo, lives, tower, particles, camera
- ✅ Base block placed at `W/2 - BS/2`
- ✅ Camera positioned to show base block
- ✅ Crane spawns above tower top

### 4.2 Block Swing & Drop
- ✅ Constant angular speed (`swingSpeed: π rad/s`)
- ✅ Amplitude ramps with height (5° start → 20° max)
- ✅ Cable length fixed at 4× blockSize
- ✅ Cable stretch physics (soft spring, heavy damping)
- ✅ Drop inherits position, velocity, and angular momentum from swing

### 4.3 Landing & Scoring
- ✅ Overlap calculated in world coordinates (consistent with rendering)
- ✅ <30% overlap = miss → debris + life lost
- ✅ Perfect landing (≤3px tolerance) → snap to center, combo++
- ✅ Scoring: `(baseScore + perfectBonus) × combo` for perfects, `baseScore × multiplier` for normals
- ✅ Milestone bonus every 10 floors (+500)
- ✅ Score float text, particles, and screen shake on landing

### 4.4 Lives System
- ✅ **3 lives** (configurable via settings)
- ✅ Lives displayed as ❤️/🖤 in HUD
- ✅ Miss shows "MISS! N ❤️ left" or "MISS!" if final
- ✅ Lives ≤ 0 triggers gameOver()

### 4.5 Game Over
- ✅ State changes to GAME_OVER
- ✅ Score saved to localStorage
- ✅ Score submitted to backend (Telegram only, with auth)
- ✅ Game over card with slide-up animation
- ✅ Displays: height, score, best combo, duration
- ✅ "RETRY" button calls startGame()

### 4.6 Restart
- ✅ Click/tap on game over screen → startGame() (via handleAction)
- ✅ RETRY button → startGame()
- ✅ Full state reset confirmed

### 4.7 Wobble Physics
- ✅ Tower wobble based on cumulative inaccuracy + height
- ✅ Damped spring oscillation
- ✅ No wobble when base block is still visible
- ✅ Perfects reduce wobble, misses don't

---

## 5. Input Handling

| Input | Status | Notes |
|-------|--------|-------|
| Touch (touchstart) | ✅ PASS | `passive: false`, preventDefault called |
| Mouse (mousedown) | ✅ PASS | Desktop support |
| Keyboard (Space/Enter) | ✅ PASS | Accessibility |
| Input lock (150ms debounce) | ✅ PASS | Prevents double-tap |
| Button hit detection | ✅ PASS | Menu/settings buttons work via handleButtonHit() |

---

## 6. Mobile Responsiveness (Code Analysis)

| Aspect | Status | Notes |
|--------|--------|-------|
| Canvas max-width: 480px | ✅ PASS | `@media (min-width: 768px)` caps canvas width |
| Block size scales with screen | ✅ PASS | `BS = Math.max(40, Math.round(W * 0.24))` |
| W = min(innerWidth, 480) | ✅ PASS | Caps game width |
| H = innerHeight | ✅ PASS | Full height |
| Scale unit: `max(14, W * 0.065)` | ✅ PASS | All UI elements scale proportionally |
| Settings overlay max-width: 400px | ✅ PASS | Form stays readable |
| Touch-action: none | ✅ PASS | No browser zoom/scroll interference |

**375px simulation:** At 375px width → W=375, BS=90, scale unit≈24px. All UI elements proportional.

---

## 7. Theme System

| Theme | Status |
|-------|--------|
| Classic | ✅ Code present |
| Cyberpunk | ✅ Code present |
| ASCII | ✅ Code present |
| Pixel | ✅ Code present |
| Theme persistence | ✅ Saved to localStorage |
| Theme selector | ✅ Settings screen has grid selector |

---

## 8. Settings Screen

| Setting | Configurable | Range |
|---------|-------------|-------|
| Block Size | ✅ | 20–200px |
| Swing Speed | ✅ | 0.5–10 rad/s |
| Max/Start Swing Angle | ✅ | 5–60° / 0.5–10° |
| Cable Length | ✅ | 50–1000px |
| Cable Stretch % | ✅ | 0–20% |
| Cable Spring Stiffness | ✅ | 1–100 |
| Cable Spring Damping | ✅ | 1–30 |
| Gravity | ✅ | 500–5000 px/s² |
| Miss Overlap Ratio | ✅ | 0.1–0.5 |
| Lives | ✅ | 1–10 |
| Perfect Tolerance | ✅ | 1–30px |
| Visible Blocks | ✅ | 2–10 |
| Camera Smooth | ✅ | 1–15 |
| Wobble params (3) | ✅ | Various |
| Fall physics (2) | ✅ | Various |

**Apply button:** Restarts game with new settings. **Cancel:** Closes without saving.

---

## 9. Backend Code Quality

| Aspect | Status | Notes |
|--------|--------|-------|
| CORS | ✅ | GitHub Pages, Telegram, localhost allowed |
| Auth | ✅ | Telegram HMAC validation enforced |
| Database | ✅ | SQLite with WAL, foreign keys |
| Error handling | ✅ | Proper HTTPExceptions |
| Deprecation warning | ⚠️ LOW | `on_event("startup")` deprecated — use lifespan |
| Input validation | ✅ | Pydantic models for all endpoints |

---

## 10. Issues Found

### Critical (0)
None.

### High (0)
None.

### Medium (1)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| M1 | **Missing favicon.ico** | root | 404 in console on every page load. Cosmetic only but creates noise in logs. |

### Low (3)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| L1 | **DeprecationWarning** in backend startup | `backend/main.py:68` | Uses deprecated `on_event("startup")`. Should migrate to lifespan handlers. No functional impact. |
| L2 | **Hardcoded production URL** | `index.html:297` | `baseUrl = 'https://tower-stack-qyyd.onrender.com'` — not configurable per environment. Local dev always hits production. |
| L3 | **No main block in backend** | `backend/main.py` | No `if __name__ == "__main__"` with uvicorn.run — requires external runner or manual uvicorn invocation. |

---

## 11. Health Score

**Formula:** `100 - (critical×30) - (high×10) - (medium×3) - (low×1)`

| Severity | Count | Deduction |
|----------|-------|-----------|
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium | 1 | 3 |
| Low | 3 | 3 |
| **Total** | | **-6** |

### **Health Score: 94/100** ✅

---

## 12. Summary

Tower Stack is in excellent shape. The game code is well-structured with clean state management, proper physics, responsive design, and a full settings system. The backend is secure with Telegram auth validation, proper CORS, and SQLite storage.

**What works well:**
- Complete game loop: menu → play → drop → land/miss → game over → retry
- Robust physics: swing, drop, wobble, debris, particles
- 3-heart lives system with visual feedback
- Scoring with combos, perfects, milestones
- 4 visual themes with persistent settings
- Mobile-first responsive design
- Full backend API with auth
- Keyboard, mouse, and touch input support

**Minor improvements:**
- Add a `favicon.ico` (1 line fix)
- Migrate from `on_event` to lifespan (FastAPI best practice)
- Make backend URL configurable via env var or build step
- Add `if __name__` block for direct execution
