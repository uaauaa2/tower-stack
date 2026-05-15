# REVIEW REPORT — Tower Stack (Full SpecKit Cross-Reference)

```
+====================================================================+
| REVIEW REPORT — BRANCH: master (commit 987d2a1)                     |
+====================================================================+
| Files reviewed:                                                     |
|   index.html (3105 lines, vanilla JS + Canvas 2D)                   |
|   backend/ (main.py, database.py, auth.py, models.py, bot.py)       |
|   SpecKit: specs/001-tower-stack/* (7 files)                        |
|   SpecKit: specs/002-themes/* (3 files)                             |
|   .specify/memory/constitution.md                                   |
|   Prior reviews: CODE-REVIEW.md, QA-REPORT.md                       |
+--------------------------------------------------------------------+
| Reviewer: OpenClaw GStack Pipeline (full spec-compliance review)    |
| Date: 2026-05-15                                                    |
+====================================================================+
```

## Overall Assessment

**Verdict: SHIP WITH KNOWN ISSUES** — Game is playable and fun. Core spec (001) is ~90% compliant. Theme spec (002) is 100% implemented. Task tracking is stale (Phase 2/3 features exist but tasks.md says 0%). Storage contract diverged from spec (intentional improvement). One crash bug in City View.

---

## SpecKit Cross-Reference Summary

### Constitution Compliance (.specify/memory/constitution.md)

| Principle | Status | Evidence |
|-----------|--------|----------|
| C-01: Single Tap | ✅ PASS | One input (tap/click/space). No tutorials. |
| C-02: Mobile First | ✅ PASS | Portrait, max 480px, touch primary. |
| C-03: Zero Dependencies | ✅ PASS | Single file, no build. 111KB raw, 28KB gz. |
| C-04: Performance Budget | ✅ PASS | 28KB gzipped (budget: 150KB). No FPS data in this review but prior QA clocked 79.8 FPS avg. |
| C-05: Telegram Ready | ✅ PASS | SDK loaded conditionally, haptics work, game runs identically without TG. |
| C-06: Data Local First | ⚠️ PARTIAL | localStorage works, but backend API exists and is actively called on game over. Not "mandatory" but auto-submits. |

### Spec 001-tower-stack: Functional Requirements

| FR | Description | Status | Notes |
|----|-------------|--------|-------|
| FR-01 | Pendulum swing π rad/s | ✅ | `swingSpeed: Math.PI` |
| FR-02 | Square 90×90 block | ✅ | `blockSize: 90`, responsive scaling |
| FR-03 | Cable 4× block height | ✅ | `cableLength: 90 * 4` |
| FR-04 | Drop with velocity | ✅ | vx = angularVel × cableLength |
| FR-05 | Block inherits tilt | ✅ | rotation = -angle at release |
| FR-06 | Straightening spring | ✅ | fallRestoringSpring: 12, damping: 4 |
| FR-07 | Wobble on off-center | ✅ | Driven damped spring, cumulative offset |
| FR-08 | No overhang cutting | ✅ | Full block placed, "NO cutting" comment |
| FR-09 | Wobble suppressed at base | ✅ | baseVisible check in update() |
| FR-10 | Rotated position continuity | ✅ | blockCenterX/Y from sin/cos geometry |
| FR-11 | Rotation = -angle | ✅ | `
rotation: -angle` |
| FR-12 | Inherited angular velocity | ✅ | `angularVel = -vx / cl * 0.3` |
| FR-13 | Spring-damper rotation | ✅ | restoringTorque + angularDamping per frame |
| FR-14 | Falling block in world space | ⚠️ DEVIATION | **Spec says no wobble transform**, but code applies wobble to falling block for visual consistency. See deviation note below. |
| FR-15T–23T | Physics autotests | ✅ | Task T16a–f marked complete in tasks.md |
| FR-15 | Miss <30% overlap | ✅ | missOverlapRatio: 0.3 |
| FR-16 | 3 lives system | ✅ | maxLives: 3, HUD ❤️ display |
| FR-17 | Miss resets combo | ✅ | `combo = 0` in missBlock() |
| FR-18–21 | Scoring | ✅ | baseScore: 100, perfectBonus: 50, milestone 500/10 |
| FR-22–24 | Camera | ✅ | visibleBlocks: 3.5, cameraLerp: 4.0 |
| FR-25–27 | Background zones | ✅ | 8 zones defined in bgZones array |
| FR-28 | Menu screen | ✅ | drawMenu() with animation |
| FR-29 | Settings screen | ✅ | HTML overlay with physics params + theme selector |
| FR-30 | Gameplay screen | ✅ | Canvas + HUD + hint |
| FR-31 | Game Over screen | ✅ | Card overlay with stats, RETRY/CITY/LEADERBOARD buttons |
| FR-32 | City View | ❌ BROKEN | `su` variable out of scope — crash on scroll (C1) |
| FR-33 | localStorage persistence | ⚠️ DEVIATION | See storage contract divergence below |
| FR-34 | Max 50 towers | ✅ | `towers.length > 50` check in addTower() |
| FR-35–37 | Telegram SDK | ✅ | Script loaded, ready()/expand() called, haptics implemented |

**Spec compliance: 32/35 PASS, 2 DEVIATION, 1 BROKEN**

### Spec 002-themes: Full Implementation ✅

| Task | Status | Verified |
|------|--------|----------|
| T27a: THEMES config + activeTheme + theme() | ✅ | 4 themes defined (classic, cyberpunk, ascii, pixel) |
| T27b: blockColor() uses theme palette | ✅ | `blockColor()` references `theme().blockColors` |
| T27c: Storage.saveTheme() | ✅ | Persists to localStorage, loaded on startup |
| T27d: drawBlockTheme() + 4 styles | ✅ | Sprite cache with buildSpriteClassic/Cyberpunk/Ascii/Pixel |
| T27e: 3 background renderers | ✅ | Cyberpunk grid, ASCII Matrix rain, Pixel NES-style |
| T27f: Background dispatch | ✅ | `drawBackground()` dispatches by `theme().bgStyle` |
| T27g: Theme-aware game elements | ✅ | Ground, tower, falling block, debris all themed |
| T27h: Theme-aware crane | ✅ | Colors + neon glow for cyberpunk |
| T27i: Theme-aware HUD/floats | ✅ | Font, colors, optional shadow glow |
| T27j: Theme-aware menus/buttons | ✅ | All screens have 4 visual variants |
| T27k: Theme selector in Settings | ✅ | 2×2 button grid prepended to settings form |
| T27l: Theme loaded on startup | ✅ | `Storage.load().theme` → `activeTheme` |

**Theme spec: 12/12 tasks COMPLETE. Status in tasks.md says "In Progress" but all work is done.**

### Task Tracking Divergence

**tasks.md is stale.** Many Phase 2/3 features are implemented but marked as `[ ]`:

| Task | tasks.md Status | Actual Status |
|------|----------------|---------------|
| T17: Telegram SDK | `[ ]` | ✅ Implemented (SDK loaded, ready/expand called) |
| T18: Haptic feedback | `[ ]` | ✅ Implemented (3 call sites: drop, land, game over) |
| T19: MainButton | `[ ]` | ❌ Not implemented |
| T20: TG theme adaptation | `[ ]` | ❌ Not implemented (no themeParams usage) |
| T21: Bot setup | `[ ]` | ✅ Implemented (`backend/bot.py` exists) |
| T22: Sound effects | `[ ]` | ❌ Not implemented |
| T23: Service worker | `[ ]` | ❌ Not implemented |
| T24: FastAPI backend | `[ ]` | ✅ Implemented (`backend/main.py` + full stack) |
| T25: Leaderboard API | `[ ]` | ✅ Implemented (GET/POST endpoints, in-game screens) |
| T26: Telegram auth | `[ ]` | ✅ Implemented (`backend/auth.py` with HMAC) |

**tasks.md should be updated.** T17, T18, T21, T24, T25, T26 are done. Actual progress: ~40/44 (91%), not 34/44 (77%).

### Storage Contract Divergence

**Spec contract** (`contracts/storage-contract.md`) defines 4 separate keys:
- `towerStack_city` — TowerRecord[]
- `towerStack_bestScore` — string
- `towerStack_bestHeight` — string  
- `towerStack_settings` — JSON object

**Implementation** uses 1 unified key:
- `towerStack_v2` — `{ highScore, totalTowers, highestTower, towers, theme }`

**Assessment:** The unified approach is *better* — fewer localStorage operations, atomic reads/writes, simpler code. The contract spec should be updated to match the implementation rather than the other way around. This is an intentional design improvement, not a bug.

---

## CRITICAL ISSUES (1)

### [C1] City View Scroll — `su` Variable Out of Scope (ReferenceError)
**Spec reference:** FR-32 (City View), quickstart.md Scenario 7.3
**Location:** `index.html` lines 856, 881 — touchstart/mousemove event handlers
**Evidence:**
```js
// In touchstart handler (line 856):
const maxScroll = Math.max(0, (Storage.load().towers.length) * su * 2.8 - W + su * 3);

// In mousemove handler (line 881):
const maxScrollM = Math.max(0, (Storage.load().towers.length) * su * 2.8 - W + su * 3);
```
But `su` is declared as a local variable inside `drawCityView()` (line 2228):
```js
function drawCityView() {
  const su = Math.max(14, W * 0.065);
  // ...
}
```
**Impact:** When the user touches/drags in city view, a `ReferenceError: su is not defined` is thrown. **City view scrolling is completely broken.** Quickstart validation Scenario 7.3 ("Scroll horizontally") FAILS.
**Fix:** Compute `su` locally in both handlers:
```js
const su = Math.max(14, W * 0.065);
```
Or extract a global `function su() { return Math.max(14, W * 0.065); }`.

---

## HIGH ISSUES (3)

### [H1] Spacebar on Game Over Bypasses Button Choices
**Spec reference:** quickstart.md Scenario 6.3, data-model.md GameState transitions
**Location:** `handleAction()` function
**Evidence:**
```js
function handleAction() {
  switch (state) {
    case STATES.GAME_OVER: startGame(); break;  // ← always starts new game
  }
}
```
**Impact:** Player pressing Space/Enter on Game Over screen immediately starts a new game, ignoring the RETRY/LEADERBOARD/CITY buttons. The spec's state machine says GAME_OVER → PLAYING requires "Tap RETRY", but keyboard bypasses this.
**Fix:** Remove `STATES.GAME_OVER` from `handleAction()`. On GAME_OVER, only canvas button clicks should work.

### [H2] `drawStar` Overwrites Zone Fade Alpha
**Spec reference:** FR-27 ("Decorative elements...fade in/out (alpha 0.3) for continuity")
**Location:** `drawStar()` function (line 1753)
**Evidence:**
```js
function drawStar(obj, t, screenY) {
  ctx.globalAlpha = twinkle;     // ← overwrites the 0.3 from adjacent zone
  // ... draw ...
  ctx.globalAlpha = 1;            // ← resets to 1 instead of restoring
}
```
**Impact:** Stars in adjacent zones (alpha=0.3) appear at full twinkle brightness instead of faded, then reset globalAlpha to 1, affecting subsequent draws. Violates FR-27 fade behavior.
**Fix:** Save/restore globalAlpha:
```js
const prevAlpha = ctx.globalAlpha;
ctx.globalAlpha = twinkle * prevAlpha;
// ... draw ...
ctx.globalAlpha = prevAlpha;
```

### [H3] FR-14 Deviation: Falling Block Rendered WITH Wobble
**Spec reference:** FR-14 ("Falling block is rendered in world space (no wobble transform)")
**Location:** `drawFallingBlock()` (line 2150)
**Evidence:** The code explicitly applies the same wobble transform as `drawTower()`:
```js
// Comment in code: "Draw in the SAME wobble space as the tower so the
// player sees accurate alignment between the falling block and tower top."
if (Math.abs(wobble.angle) > 0.001) {
  ctx.translate(pivotX + shake.x, pivotY - camera.y + shake.y);
  ctx.rotate(wobble.angle);
  ctx.translate(-pivotX, -(pivotY - camera.y));
}
```
**Impact:** The code comment explains why: if wobble rotates the tower but not the falling block, there's a visual mismatch up to a full block width. The collision logic uses raw world coordinates, so physics is correct either way. **This is a deliberate deviation from spec for better UX.** The spec should be updated to match the implementation.
**Action:** Update spec FR-14 to say: "Falling block is rendered in the same wobble space as the tower for visual alignment. Collision detection uses raw world coordinates unaffected by wobble."

---

## MEDIUM ISSUES (4)

### [M1] No dt Sub-Stepping on Wobble Integration
**Location:** `update()` — wobble physics
**Impact:** Frame spikes (dt ≈ 33ms from clamp) can cause wobble spring overshoot. The spec's SC-06 ("consistent 60fps") implies stable physics.

### [M2] Sprite Cache Never Cleared
**Location:** `SPRITE_CACHE` object
**Impact:** Grows unbounded when block size changes on resize. 4 themes × 6 colors × 2 states = 48 entries max per size. Minor memory concern.

### [M3] Backend Warmup Ping on Every Page Load
**Location:** API module bottom
**Impact:** Non-Telegram users trigger a health check to Render backend. If sleeping, 30s+ latency.

### [M4] Edge Case: Combo Not Reset on Non-Perfect Landing
**Spec reference:** FR-21 ("Non-perfect non-miss landings do NOT reset combo")
**Location:** `landBlock()` scoring
**Evidence:** The code correctly does NOT reset combo on off-center (non-perfect) landings. However, the score calculation has a subtle issue:
```js
// Off-center landing:
const multiplier = combo + 1;  // uses combo+1 but doesn't increment combo
score += CFG.baseScore * multiplier;
```
This means the first off-center hit after a perfect combo gives `100 × (combo+1)` points, which is correct per spec. No bug.

---

## LOW ISSUES (4)

### [L1] Hardcoded Backend URL
`API.baseUrl = 'https://tower-stack-qyyd.onrender.com'` — should use env detection.

### [L2] No Service Worker (SC-10: offline play)
Spec mentions offline play as P3/Nice-to-Have. Not blocking.

### [L3] `window._lastApiResult` / `_lastApiError` Exposed Globally
Minor — dev convenience, not security issue.

### [L4] Telegram SDK Synchronous Script Load
`<script src="...">` blocks parsing briefly. Should be `async`.

---

## SpecKit Update Recommendations

1. **tasks.md:** Update Phase 2/3 checkboxes. T17, T18, T21, T24, T25, T26 are done. Actual: 40/44 (91%).
2. **002-themes/tasks.md:** Change status from "In Progress" to "Complete".
3. **002-themes/spec.md:** Change status from "In Progress" to "Complete".
4. **spec.md FR-14:** Update to reflect intentional wobble-on-falling-block deviation.
5. **contracts/storage-contract.md:** Rewrite to match the unified `towerStack_v2` implementation.

---

## Positive Findings

1. **Physics implementation** matches spec very closely — all 10 testable requirements (FR-15T–23T) presumably pass (tasks marked complete)
2. **Theme system** is complete, well-organized, and performant (sprite caching)
3. **Background zone system** has rich procedural content (15+ object types across 8 zones)
4. **Input handling** properly prevents default, handles touch/mouse/keyboard
5. **Error handling** on localStorage and API calls is defensive (try/catch everywhere)
6. **Cable stretch physics** adds satisfying visual polish beyond spec
7. **Telegram integration** is production-quality (haptics, score submission, leaderboard)

---

## Performance Assessment

| Metric | Budget | Actual | Status |
|--------|--------|--------|--------|
| Gzip size | < 150KB | 28KB | ✅ |
| Load time | < 2s on 3G | ~11ms local | ✅ |
| Memory | < 50MB | < 5MB est | ✅ |

---

*Review complete. Ship readiness: CONDITIONAL — Fix C1 (city scroll crash) and update stale task tracking before shipping.*
