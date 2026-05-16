# Tower Stack — Feature Specification

> Spec-Driven Development specification for a Tower Bloxx-style web game with Telegram Mini App integration.

---

## 1. Specify — What & Why

### Problem
Players want a casual, satisfying mobile game they can launch instantly — no downloads, no installs. Tower Bloxx was a beloved classic that disappeared from modern app stores. A web-based recreation with Telegram integration makes it accessible to millions.

### Vision
A single-tap casual game: a crane swings a block on a cable, you tap to drop it, stack blocks into a tower. The block retains its swing momentum when dropped — physics-based landing. Perfect timing = combos. Miss too many times (3) and the game ends. Play in browser or inside Telegram.

### Target Users
- Casual mobile gamers
- Telegram users looking for quick entertainment
- Nostalgic Tower Bloxx fans

### Success Criteria
- Game loads in < 2s on mobile
- 60 FPS gameplay on mid-range phones
- Works offline after first load (service worker)
- Playable as Telegram Mini App
- No backend required for MVP

---

## 2. Constitution — Project Principles

### C-01: Single Tap, Zero Learning Curve
One input: tap/click/space. No tutorials needed. The game teaches itself.

### C-02: Mobile First, Desktop Second
Portrait orientation. Touch input primary. Canvas scales to any screen.

### C-03: Zero Dependencies
Vanilla HTML + CSS + JS. No frameworks, no build step. One file ships everything.

### C-04: Performance Budget
- Bundle: < 150KB gzipped
- Load time: < 2s on 3G
- FPS: consistent 60fps
- Memory: < 50MB

### C-05: Telegram Ready
Must work as Telegram Mini App with minimal changes.

### C-06: Data Persistent
All player progress and scores stored in Turso (cloud libSQL). Local SQLite fallback for development. No data loss on server restarts.

---

## 3. Plan — Tech Stack & Architecture

### 3.1 Frontend

| Layer | Technology | Reason |
|-------|-----------|--------|
| Rendering | HTML5 Canvas 2D | No WebGL needed, simple 2D scene |
| Logic | Vanilla JavaScript (ES2020+) | Zero deps, runs everywhere |
| Styling | Inline CSS in HTML | Single file deployment |
| Input | Touch + Mouse + Keyboard | Unified handler, single action |
| Persistence | localStorage | No backend needed for MVP |

### 3.2 Hosting

| Component | Service | Cost |
|-----------|---------|------|
| Game (static) | GitHub Pages | Free |
| Domain | `uaauaa2.github.io/tower-stack` | Free |
| CI/CD | GitHub Actions (auto-deploy on push) | Free |

### 3.3 Backend (Python, FastAPI)

| Component | Technology | Reason |
|-----------|-----------|--------|
| API | FastAPI (Python 3.12+) | Async, lightweight, Telegram-friendly |
| Hosting | Render | Free tier available |
| DB | **Turso (libSQL)** | Persistent cloud SQLite, free tier: 9GB, 1B reads/mo |
| Auth | Telegram WebAppData | Native, no passwords |

**Note on database choice:** Originally used local SQLite on Render, but Render's free tier has an ephemeral filesystem — data was lost on every restart/redeploy. Turso provides a persistent, replicated, cloud-based SQLite-compatible database with a generous free tier. The `database.py` module supports both Turso (production, via `TURSO_URL` + `TURSO_AUTH_TOKEN` env vars) and local SQLite (fallback for development).

### 3.4 Architecture

```
┌─────────────────────────────────┐
│           index.html             │
│  ┌───────────────────────────┐  │
│  │       Game Engine          │  │
│  │  ┌─────┐ ┌──────┐ ┌────┐ │  │
│  │  │Input│ │Physics│ │Cam │ │  │
│  │  └─────┘ └──────┘ └────┘ │  │
│  │  ┌──────┐ ┌────┐ ┌─────┐ │  │
│  │  │Crane │ │Block│ │Score│ │  │
│  │  └──────┘ └────┘ └─────┘ │  │
│  │  ┌──────┐ ┌──────┐       │  │
│  │  │Tower │ │Render│       │  │
│  │  │Wobble│ │BG    │       │  │
│  │  └──────┘ └──────┘       │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │      Storage Layer         │  │
│  │  localStorage ↔ JSON      │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │   Telegram Integration     │  │
│  │  WebApp SDK (optional)     │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### 3.5 State Machine

```
MENU ──tap──► PLAYING ──tap──► DROPPING ──land──► PLAYING
                                       └──miss──► (missesLeft--)
                                                   if 0 → GAME_OVER
GAME_OVER ──retry──► PLAYING
GAME_OVER ──retry──► PLAYING
GAME_OVER ──leaderboard──► LEADERBOARD
```

---

## 4. Game Mechanics

### 4.1 Block Shape
- Blocks are **square** (width == height).
- Block size: 90×90px.
- Size stays constant (no shrinking).

### 4.2 Swing Mechanics
- Block swings on cable like a pendulum.
- **Swing speed: constant** ~π rad/s → 1 second from one extreme to the other (half-period = 1s, full period = 2s).
- **Amplitude depends on tower height** — controlled by `swingAngleMax` parameter (degrees, default 20°):
  - Starts at ~10% of max at floor 0
  - Gradually increases via smoothstep interpolation
  - Reaches `swingAngleMax` at high floors
  - Configurable in Settings panel
- Only amplitude changes with height. Speed stays constant.

| Floors | Approx Angle (default maxAngle=20°) |
|--------|-------------------------------------|
| 0–2 | ~1° (tutorial) |
| 5 | ~2° |
| 10 | ~3° |
| 20 | ~6° |
| 30 | ~9° |
| 50 | ~14° |
| 80+ | ~20° |

### 4.2.1 Cable Length (Fixed)
- Cable length is **constant** — always `4 × blockHeight` (4 × 90 = 360px).
- The cable length does not change as the tower grows.
- The crane may extend above the visible screen area if needed; it does **not** need to be fully visible on screen.
- As the tower grows and camera scrolls up, the pendulum pivot (crane) moves up accordingly, maintaining the fixed cable length.
- **Distance between the swinging block's bottom and the tower top = exactly 1 block height (90px).**
- The block is **rigidly attached** to the cable at a right angle — when the cable swings, the block **tilts with it**, not parallel to the ground.
- The block rotates around its top-center attachment point (hook).

### 4.2.2 Cable Elasticity (Stretch)
- The cable has subtle **elastic stretch** (~4% max of base length).
- Stretch is modeled as a **soft spring-damper system** (stiffness: 6, damping: 12) driven by pendulum dynamics.
- Very slow response — the stretch visibly lags behind the swing, creating a smooth, organic feel.
- At the extremes of the swing (max angle), centripetal force causes the cable to stretch slightly.
- At the bottom of the swing (passing through center), the cable is at its natural length.
- Stretch is reset to 0 on each new block spawn and ramps up smoothly to avoid initial jerk.

### 4.3 Drop Physics (Inertia + Rotation)
- When player taps, block **detaches from cable with its current velocity and tilt angle**.
- **Position continuity:** Block's world position is calculated from the rotated geometry to match exactly where the crane rendered it:
  ```
  hookX = pivotX + sin(angle) × cableLength
  hookY = pivotY + cos(angle) × cableLength
  blockCenterX = hookX + (BS/2) × sin(angle)
  blockCenterY = hookY + (BS/2) × cos(angle)
  ```
  This eliminates the visual "jump" that would occur if position were simply `(hookX - BS/2, hookY)` (non-rotated).
- Horizontal velocity = derivative of pendulum position at moment of release.
  - `vx = swingAngularVel × cableLength` at release
- **Rotation:** Block inherits its tilt from the cable (`rotation = -angle`). A small angular velocity is also inherited from the swing.
- **Straightening during fall:** Rotation evolves via a restoring spring + damping model:
  ```
  restoringTorque = -rotation × fallRestoringSpring  (default 12)
  angularDamping  = -angularVel × fallAngularDamping (default 4)
  ```
  Block straightens from max tilt (~20°) to near-vertical in ~0.3–0.5 seconds.
- Vertical: gravity pulls down (2000 px/s²).
- **No air resistance** on horizontal movement — block keeps its horizontal momentum.
- **Falling block rendered in world space** (no wobble transform) — ensures visual = physics = collision.
- This means: if you drop while swinging right, block continues moving right while falling, and the tilt you see on the cable smoothly transitions into the tilt during fall.

### 4.4 Tower Wobble (NOT Overhang Cutting)
- When a block lands **off-center**, the tower **does NOT get cut**.
- Instead, the entire tower **wobbles** (oscillates left-right).
- **Wobble amplitude** is calculated based on:
  - **Cumulative inaccuracy** — the average offset of ALL blocks in the tower from perfect center
  - **Tower height** — taller towers amplify the wobble
  - Formula: `targetAngle = (avgOffset / blockSize) * (1 + towerHeight * heightFactor) * 0.3`
- **Amplitude is constant between landings** — the target angle is set when a block lands and stays fixed until the next block lands.
- Wobble is modeled as a **driven damped spring**: oscillates around 0 with energy injection to maintain the target amplitude.
- Tower visually tilts as a rigid body from the base.
- Multiple inaccurate placements accumulate, making wobble progressively worse.
- **Perfect placements** (offset ≈ 0) reduce the cumulative average, naturally decreasing wobble over time.
- **Wobble is suppressed** while the first (base) block is still visible on screen (see §4.6).

### 4.5 Miss / Fall-Off Logic
- A block is considered "missed" if less than **30%** of its surface overlaps with the tower top.
- When missed, block falls off to the side with **rotation inherited from its current tilt** (`fallingBlock.rotation`), plus additional spin.
- **Player has 3 misses before game over** (lives system).
- HUD shows remaining lives: ❤️❤️❤️ → ❤️❤️🖤 → ❤️🖤🖤 → GAME OVER
- Miss resets combo but doesn't end game immediately.

### 4.6 Layout & Viewport
- **Bottom portion** of screen shows the **last 3.5 blocks** of the tower (i.e., 3 full blocks + half of the 4th from the top).
- The rest of the screen is for: cable, swinging block, and gap between block and tower top.
- Camera scrolls up smoothly as tower grows.
- **Wobble is suppressed while the first (base) block is visible on screen.** The base block sits perfectly flat on the ground. No wobble accumulates until the camera scrolls high enough that the base block leaves the viewport.
- **Crane does not need to be visible on screen** — only the cable origin point matters. If the crane extends beyond the viewport, that's fine.

### 4.7 Background Layers (Height-Based)
As the tower grows, the background **changes theme** with smooth gradient transitions:

| Zone | Floors | Label | Sky Colors | Elements |
|------|--------|-------|-----------|----------|
| 0 | 0–9 | Ground | `#87CEEB` → `#D4F1F9` | Trees 🌳, clouds ☁️, birds 🐦 |
| 1 | 10–19 | Low Sky | `#6BB3D9` → `#B0DAE8` | Clouds ☁️, birds 🐦 |
| 2 | 20–29 | Cloud Layer | `#B8C6D4` → `#D8E2EA` | Dense clouds ☁️ |
| 3 | 30–39 | Above Clouds | `#3A8FBF` → `#7CC0E0` | Clouds ☁️, planes ✈️ |
| 4 | 40–49 | Stratosphere | `#1B4F72` → `#5499C7` | Planes ✈️ |
| 5 | 50–59 | Mesosphere | `#4A235A` → `#7D3C98` | Stars ⭐, satellites 🛰️ |
| 6 | 60–69 | Thermosphere | `#1B0A2E` → `#3C1F5E` | Stars ⭐, satellites 🛰️ |
| 7 | 70+ | Space | `#050510` → `#0A0A20` | Dense stars ⭐, satellites 🛰️ |

- Background drawn procedurally on canvas (no image files).
- **Smooth color transition**: in the first and last 30% of each zone, sky colors blend with the previous/next zone.
- Decorative elements (clouds, birds, etc.) are simple shapes, slowly drifting.
- Elements from adjacent zones fade in/out (alpha 0.3) for continuity.
- Ground (grass + earth) visible only in zone 0 (floors 0–10).

### 4.8 Scoring

| Event | Points |
|-------|--------|
| Per floor | 100 × combo multiplier |
| Perfect placement (centered ±3px) | +50 bonus |
| Height milestone (every 10) | +500 bonus |

### 4.9 Combo System
- Consecutive **centered placements** (within tolerance) increase combo.
- Any non-perfect landing (block survives but off-center) does NOT reset combo but gives no bonus.
- A miss (block falls off) resets combo to 0.

### 4.10 Difficulty Progression

| Floors | Swing Speed | Max Angle | Notes |
|--------|------------|-----------|-------|
| 0–2 | π rad/s (const) | 2° | Almost no swing, tutorial |
| 3–5 | π rad/s (const) | 4° | Gentle |
| 6–10 | π rad/s (const) | 7° | Moderate |
| 11–20 | π rad/s (const) | 12° | Noticeable |
| 21–30 | π rad/s (const) | 17° | Wide swing |
| 31–50 | π rad/s (const) | 25° | Challenging |
| 50–80 | π rad/s (const) | 32° | Expert |

---

## 5. Screens

### 5.1 Main Menu
- Title: "TOWER STACK" with bounce animation
- Buttons: PLAY, LEADERBOARD, SETTINGS
- High score display
- Animated sky background with clouds

### 5.1.1 Settings Screen
- Opens as an overlay from the main menu
- Shows visual theme selector (grid of theme buttons)
- Themes: Classic, Cyberpunk, Pixel, ASCII
- Theme change is instant (no restart needed)
- **Apply & Restart**: closes settings and starts a new game
- **Cancel**: returns to main menu without changes

### 5.2 Gameplay
- Canvas: dynamic background (changes with height)
- Crane arm at top of upper 60%, cable + swinging block
- Tower in bottom 40% (last 5-6 blocks visible)
- Wobble animation on tower when off-center
- HUD: score (top-left), combo (top-right), lives ❤️ (top-center), floors
- "TAP TO DROP" hint (fades after first drop)

### 5.3 Game Over
- Overlay with stats: height, score, best combo, high score
- Buttons: RETRY, LEADERBOARD
- Score automatically submitted to backend (Telegram users only)
- Tower saved to city on game over

---

## 6. Visual Design

### Colors

| Element | Color |
|---------|-------|
| Sky top | `#4FC3F7` |
| Sky bottom | `#E1F5FE` |
| Block palette | `#FF6B6B`, `#FFD93D`, `#6BCB77`, `#4D96FF`, `#C084FC`, `#FFA07A` |
| Crane arm | `#546E7A` |
| Cable | `#37474F` |
| Hook | `#FFD93D` |
| Score text | White + shadow |
| Perfect text | `#FFD700` (gold) |
| Ground | `#8B7355` |
| Grass | `#6BCB77` |

### Block Shape
- **Square**: width equals height (90×90px base)
- Slight 3D shading: bottom edge darker, top edge lighter

### Typography
- `Fredoka One` for titles and scores
- `Nunito` for body text
- Fallback: system-ui, sans-serif

### Layout
- Portrait orientation
- Bottom portion = tower view (3.5 blocks visible)
- Upper portion = cable, block, gap (crane may be off-screen)
- Canvas scales to screen width (max 480px)

---

## 7. Telegram Mini App Adaptation

### Integration Points
```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

- `Telegram.WebApp.ready()` — signal loaded
- `Telegram.WebApp.expand()` — full viewport
- `Telegram.WebApp.HapticFeedback` — landing feedback
- `Telegram.WebApp.themeParams` — adaptive theme colors
- `Telegram.WebApp.MainButton` — primary action button

---

## 8. File Structure (MVP)

```
tower-stack/
├── index.html              ← Complete game (HTML + CSS + JS)
├── DESIGN.md               ← Visual design reference
├── ENGINEERING.md          ← Technical architecture reference
├── SPEC.md                 ← This file
└── README.md               ← How to run, deploy, contribute
```

### Deployment
```bash
cd tower-stack
git init && git add . && git commit -m "Tower Stack v1.0"
gh repo create tower-stack --public --source=. --remote=origin --push
gh api -X POST repos/uaauaa2/tower-stack/pages -f build_type=legacy -f source[branch]=master
# Live at: https://uaauaa2.github.io/tower-stack/
```

---

## 9. Tasks — Implementation Plan

### Phase 1: Core Game (MVP)
- [x] T1: Canvas setup — responsive, DPR-aware, resize handler
- [x] T2: Game loop — requestAnimationFrame, delta time, state machine
- [x] T3: Input system — unified touch/mouse/keyboard handler
- [x] T4: Crane system — pendulum swing (~1s edge-to-edge)
- [x] T5: Block physics — gravity drop WITH horizontal inertia
- [x] T6: Tower stacking — overlap check, no overhang cutting
- [x] T7: Tower wobble — off-center = wobble, amplitude based on offset + height
- [x] T8: Miss/lives system — 3 misses before game over, 30% overlap threshold
- [x] T9: Camera — 3.5 visible blocks, smooth scroll
- [x] T10: Background layers — trees → clouds → helicopters → planes → space
- [x] T11: HUD — score, combo, lives ❤️, floors
- [x] T12: Scoring — combo system, score display
- [x] T13: Menu screen — title, buttons, high score
- [x] T14: Game over screen — stats, retry/leaderboard buttons
- [x] T15: City view — skyline rendering, scrollable
- [x] T16: localStorage — save/load towers and scores

### Phase 2: Telegram Integration
- [ ] T17: Telegram WebApp SDK integration
- [ ] T18: Haptic feedback on drop/land/game over
- [ ] T19: MainButton for primary actions
- [ ] T20: Theme adaptation from Telegram params
- [ ] T21: Bot setup — `/start` command → game link

### Phase 3: Polish & Backend (Post-MVP)
- [ ] T22: Procedural sound effects (Web Audio API)
- [ ] T23: Service worker for offline play
- [ ] T24: Python FastAPI backend scaffold
- [ ] T25: Leaderboard API
- [ ] T26: Telegram auth via WebAppData

---

## 10. Testing Criteria

### Functional
- Block lands centered → perfect, combo++
- Block lands off-center → tower wobbles, no cut, block stays
- Block < 30% overlap → miss, lives--, block falls off
- 3 misses → game over
- Combo persists on non-perfect but non-miss landings
- Combo resets on miss
- Camera keeps last 3.5 blocks visible
- Background changes with height
- Tower wobble accumulates; only reduces on accurate placements
- **Wobble visual alignment**: falling block and tower are drawn in the same
  wobble-transformed space, ensuring the player sees accurate alignment
  at the point of contact. Overlap physics uses raw world coordinates for
  both block and tower top; the same wobble rotation is applied during
  rendering so visual overlap = physics overlap.
  (Verified by `tests/test-wobble-alignment.js`.)
- **Wobble × Swing direction matrix**: tested all combinations of swing
  direction (left/right), wobble direction (same/opposing), and amplitudes
  (small 1-3°, medium 4-8°, large 8-15°, extreme 15-25°) across multiple
  tower heights (5-40 floors). Verified:
  - Visual ↔ physics alignment at contact point for all combos (336 tests)
  - Correct land/miss classification with 30% overlap threshold (15 tests)
  - Pixel-level rendering accuracy for SAME and OPPOSING directions (10 tests)
  - Swing momentum + wobble landing accuracy with drift (10 tests)
  (Verified by `tests/test-wobble-swing-matrix.js`.)

### Performance
- 60fps with wobble physics + background rendering
- No jank during drop/land/wobble

### Mobile
- Touch responsive
- No accidental zoom/scroll
- Safe areas respected

---

*Spec version: 2.1*
*Updated: 2026-05-11*
*Changes v2.1: Fixed falling block wobble rendering — drawFallingBlock now applies same wobble transform as drawTower for visual↔physics alignment*
