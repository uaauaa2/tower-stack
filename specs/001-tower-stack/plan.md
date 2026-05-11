# Tower Stack — Implementation Plan

> **Spec ID:** 001-tower-stack
> **Status:** Phase 1 Complete
> **Source:** SPEC.md §3, §9 and ENGINEERING.md

---

## Summary

Build a Tower Bloxx-style casual web game as a single HTML file. Vanilla JS + Canvas 2D. Mobile-first. Three phases: Core Game (done), Telegram Integration (todo), Polish & Backend (todo).

---

## Technical Context

### Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Rendering | HTML5 Canvas 2D | Simple 2D scene, no WebGL needed |
| Logic | Vanilla JavaScript (ES2020+) | Zero deps, runs everywhere |
| Styling | Inline CSS in HTML | Single file deployment |
| Input | Touch + Mouse + Keyboard | Unified handler, single action |
| Persistence | localStorage | No backend for MVP |

### Hosting

| Component | Service | Cost |
|-----------|---------|------|
| Static files | GitHub Pages | Free |
| Domain | `uaauaa2.github.io/tower-stack` | Free |
| CI/CD | GitHub Actions (auto-deploy on push) | Free |

### Architecture

Single-file game (`index.html`, ~53KB) containing all HTML + CSS + JS. Internal module layout:

- **Config** — constants (block size, physics, colors)
- **Utils** — math helpers
- **Storage** — localStorage read/write
- **GameState** — state machine + game data
- **Crane** — pendulum swing system
- **Block** — drop physics, collision
- **Camera** — smooth scroll
- **Input** — unified touch/mouse/keyboard
- **Render** — drawing layers (sky, ground, tower, crane, HUD)
- **CityView** — skyline rendering
- **GameLoop** — `init() → tick(dt) → update(dt) + draw()`

### State Machine

```
MENU ──tap──► PLAYING ──tap──► DROPPING ──land──► PLAYING
                                       └──miss──► (missesLeft--)
                                                   if 0 → GAME_OVER
GAME_OVER ──retry──► PLAYING
GAME_OVER ──city──► CITY_VIEW ──back──► MENU
```

---

## Constitution Check

| Principle | Compliance |
|-----------|-----------|
| C-01: Single Tap | ✅ One input (tap/click/space) controls everything |
| C-02: Mobile First | ✅ Portrait, touch primary, Canvas scales, max 480px |
| C-03: Zero Dependencies | ✅ Vanilla HTML+CSS+JS, single file, no build |
| C-04: Performance Budget | ✅ ~53KB total, 60fps Canvas 2D, < 5MB memory |
| C-05: Telegram Ready | ✅ SDK integration planned (Phase 2) |
| C-06: Data Local First | ✅ localStorage only, no backend for MVP |

---

## Project Structure

```
tower-stack/
├── .specify/
│   └── memory/
│       └── constitution.md
├── specs/
│   └── 001-tower-stack/
│       ├── spec.md
│       ├── plan.md
│       ├── tasks.md
│       ├── research.md
│       ├── data-model.md
│       ├── quickstart.md
│       └── contracts/
│           └── storage-contract.md
├── constitution.md
├── index.html              ← Complete game (53KB)
├── SPEC.md                 ← Combined specification (source of truth)
├── ENGINEERING.md          ← Technical architecture reference
├── README.md
├── CONTRIBUTING.md
└── CHANGELOG.md
```

---

## Complexity Tracking

### Phase 1: Core Game ✅

| Area | Complexity | Notes |
|------|-----------|-------|
| Canvas setup | Low | DPR-aware, resize handler |
| Game loop | Low | rAF + delta time |
| Input system | Low | Unified 3-source handler |
| Crane/pendulum | Medium | Swing physics, cable elasticity |
| Block physics | Medium | Gravity + horizontal inertia |
| Tower stacking | Medium | Overlap check, placement |
| Tower wobble | High | Driven damped spring, cumulative offset |
| Camera system | Low | Lerp follow, never down |
| Background layers | Medium | 8 zones, procedural, transitions |
| Scoring/combo | Low | Counter + multiplier |
| HUD | Low | Canvas-drawn overlay |
| Menu/Game Over | Low | Overlay screens |
| City view | Medium | Skyline rendering, touch pan |
| localStorage | Low | JSON save/load |

### Phase 2: Telegram Integration

| Area | Complexity | Notes |
|------|-----------|-------|
| SDK integration | Low | Conditional script load |
| Haptic feedback | Low | 3 call sites |
| MainButton | Low | Show/hide per state |
| Theme adaptation | Low | Read themeParams |
| Bot setup | Medium | BotFather + start command |

### Phase 3: Polish & Backend

| Area | Complexity | Notes |
|------|-----------|-------|
| Sound effects | Medium | Web Audio API procedural |
| Service worker | Medium | Cache strategy |
| FastAPI backend | High | Auth, API design |
| Leaderboard | Medium | CRUD + ranking |
| Telegram auth | Medium | WebAppData validation |

---

*Source: SPEC.md §3 (Plan), §9 (Tasks) and ENGINEERING.md*
