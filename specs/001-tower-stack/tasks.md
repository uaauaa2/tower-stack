# Tower Stack — Task List

> **Spec ID:** 001-tower-stack
> **Status:** Phase 1 Complete | Phase 2-3 Pending
> **Source:** SPEC.md §9

---

## Legend

- `[x]` Done
- `[ ]` Todo
- `[P]` Parallelizable (no dependencies on same-phase tasks)
- Dependencies noted in parens

---

## Phase 1: Core Game (MVP) ✅

- [x] T1: Canvas setup — responsive, DPR-aware, resize handler
- [x] T2: Game loop — requestAnimationFrame, delta time, state machine
- [x] T3: Input system — unified touch/mouse/keyboard handler
- [x] T4: Crane system — pendulum swing (~1s edge-to-edge)
- [x] T5: Block physics — gravity drop WITH horizontal inertia
- [x] T6: Tower stacking — overlap check, no overhang cutting
- [x] T7: Tower wobble — off-center = wobble, amplitude based on offset + height
- [x] T8: Miss/lives system — 3 misses before game over, 30% overlap threshold
- [x] T9: Camera — 3.5 visible blocks, smooth scroll
- [x] T10: Background layers — trees → clouds → birds → planes → space
- [x] T11: HUD — score, combo, lives ❤️, floors
- [x] T12: Scoring — combo system, score display
- [x] T13: Menu screen — title, buttons, high score
- [x] T14: Game over screen — stats, retry/city buttons
- [x] T15: City view — skyline rendering, scrollable
- [x] T16: localStorage — save/load towers and scores

---

## Phase 1.5: Physics Autotests (branch: physics-optimize)

- [x] T16a: Test release trajectory — parabola verification for all amplitudes (5°–20°) × release phases (8 points) × time checkpoints (7 points)
- [x] T16b: Test energy conservation during free fall
- [x] T16c: Test rotation spring-damper against analytical solution
- [x] T16d: Test horizontal velocity conservation (no air drag)
- [x] T16e: Test boundary cases (zero amplitude, max velocity, extreme angle, tiny amplitude)
- [x] T16f: Update SpecKit spec with testable physics requirements (FR-15T through FR-23T, SC-12 through SC-15)

---

## Phase 2: Telegram Integration

- [ ] T17: Telegram WebApp SDK integration *(dep: T1-T16)*
- [ ] T18: Haptic feedback on drop/land/game over *(dep: T17)* [P]
- [ ] T19: MainButton for primary actions *(dep: T17)* [P]
- [ ] T20: Theme adaptation from Telegram params *(dep: T17)* [P]
- [ ] T21: Bot setup — `/start` command → game link *(dep: T17)*

---

## Phase 2.5: Visual Themes (branch: feature/T27-themes)

- [x] T27: 4 visual themes — Classic (enhanced), Cyberpunk, ASCII, Pixel Art
  - [x] T27a: THEMES config + `activeTheme` var + `theme()` helper
  - [x] T27b: `blockColor()` uses theme palette
  - [x] T27c: `Storage.saveTheme()` — persist theme to localStorage
  - [x] T27d: `drawBlockTheme()` dispatcher + 4 block style functions
  - [x] T27e: `drawBackgroundCyberpunk()`, `drawBackgroundAscii()` (Matrix rain), `drawBackgroundPixel()`
  - [x] T27f: Theme-aware `drawGround()`, `drawTower()`, `drawFallingBlock()`, `drawDebris()`
  - [x] T27g: Theme-aware `drawCrane()` with cyberpunk neon glow
  - [x] T27h: Theme-aware `drawHUD()`, `drawFloatTexts()`
  - [x] T27i: Theme-aware `drawMenu()`, `drawGameOver()`, `drawCityView()`
  - [x] T27j: `drawButton()` — 4 visual styles (classic/cyberpunk/ascii/pixel)
  - [x] T27k: Theme selector 2×2 button grid prepended to Settings screen
  - [x] T27l: Theme loaded from localStorage on startup

---

## Phase 3: Polish & Backend (Post-MVP)

- [ ] T22: Procedural sound effects (Web Audio API) *(dep: T1-T16)*
- [ ] T23: Service worker for offline play *(dep: T1-T16)* [P]
- [ ] T24: Python FastAPI backend scaffold *(dep: T23)*
- [ ] T25: Leaderboard API *(dep: T24)*
- [ ] T26: Telegram auth via WebAppData *(dep: T24, T17)*

---

## Progress

| Phase | Total | Done | % |
|-------|-------|------|---|
| Phase 1 | 16 | 16 | 100% |
| Phase 1.5 | 6 | 6 | 100% |
| Phase 2 | 5 | 0 | 0% |
| Phase 2.5 (T27) | 12 | 12 | 100% |
| Phase 3 | 5 | 0 | 0% |
| **Total** | **44** | **34** | **77%** |

---

*Source: SPEC.md §9 — Tasks*
