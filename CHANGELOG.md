# Changelog

All notable changes to Tower Stack are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — feature/T27-themes

### Added

**Visual Theme System (Spec 002-themes, T27)**

- 4 selectable visual themes, switchable in Settings screen with instant effect (no restart needed):
  - **✨ Classic** — Enhanced default: gradient-filled blocks with highlight/shadow depth, polished blue/coral buttons
  - **⚡ Cyberpunk** — Dark purple grid background, neon cyan/magenta block outlines with `shadowBlur` glow, scanline overlay, neon HUD/buttons
  - **▓ ASCII** — Black background with Matrix-style character rain, flat green monospace blocks with double-border outline, terminal-green HUD
  - **🎮 Pixel** — NES-palette flat sky + chunky pixel clouds, dithered 8×8 pixel grid inside blocks, 1px hard black border, pixel-style buttons
- Theme selector UI added to Settings screen (2×2 button grid, active theme highlighted)
- Theme persisted in localStorage (graceful fallback to Classic on corrupt/missing data)
- All draw surfaces themed: blocks, crane, cable, background, ground, HUD, menu, game-over card, city view, buttons, float texts
- Matrix rain animation state (`matrixColumns[]`) initialised once for consistent ASCII atmosphere
- `Storage.saveTheme(id)` — writes theme into existing save object without affecting game data
- `THEMES` constant with per-theme: block colors, crane/cable/hook colors, HUD colors, font family, button styles, background style key
- `theme()` helper — returns active `THEMES` entry; falls back to `classic` for unknown IDs

---

## [1.0.0] — 2026-05-09

### Added

**Core Game (Phase 1 — MVP)**

- Canvas setup — responsive, DPR-aware, resize handler
- Game loop — requestAnimationFrame with delta time, state machine (MENU → PLAYING → DROPPING → GAME_OVER → CITY_VIEW)
- Unified input system — touch, mouse, keyboard (spacebar/enter) with 100ms debounce
- Crane/pendulum system — block swings on cable, constant speed (~π rad/s), amplitude increases with tower height via smoothstep interpolation
- Cable elasticity — subtle 4% stretch via spring-damper system for organic feel
- Block physics — gravity drop (2000 px/s²) with horizontal inertia from swing momentum
- Tower stacking — overlap-based placement, no overhang cutting
- Tower wobble — driven damped spring, amplitude based on cumulative offset + tower height
- Wobble suppression while base block is visible on screen
- Miss/lives system — 3 lives, 30% overlap threshold, ❤️❤️❤️ HUD
- Combo system — consecutive centered placements (±3px) increase multiplier, off-center non-miss keeps combo, miss resets
- Scoring — 100 × combo per floor, +50 perfect bonus, +500 height milestone (every 10)
- Camera system — smooth lerp scroll (speed 5.0), 3.5 visible blocks, never moves down
- 8 background zones — Ground → Low Sky → Cloud Layer → Above Clouds → Stratosphere → Mesosphere → Thermosphere → Space
- Procedural decorative elements — trees, clouds, birds, planes, stars, satellites with drift animation
- Smooth zone transitions — 30% overlap blending at boundaries
- HUD — score, combo counter, lives (❤️), floor count, "TAP TO DROP" hint
- Screen shake — 3px on perfect, 8px on game over
- Main menu — title with bounce animation, PLAY/MY CITY/SETTINGS buttons, high score
- Settings screen — configurable physics parameters (block size, gravity, swing speed, cable properties, wobble params, etc.), Apply & Restart / Cancel
- Game over screen — height, score, best combo stats, RETRY/CITY buttons
- City view — horizontal skyline of saved towers, sorted by height, scrollable with touch pan, window grid rendering
- localStorage persistence — city history (max 50 towers), best score, best height, custom settings
- Block colors — 6-color palette cycling: `#FF6B6B`, `#FFD93D`, `#6BCB77`, `#4D96FF`, `#C084FC`, `#FFA07A`
- Typography — Fredoka One (titles), Nunito (body), system-ui fallback
- 3D block shading — subtle top highlight and bottom shadow

**Documentation**

- `SPEC.md` — Combined specification (constitution, game mechanics, screens, tasks)
- `ENGINEERING.md` — Technical architecture, systems detail, test matrix, constants reference
- Spec Kit documentation structure with spec, plan, tasks, research, data-model, quickstart, and storage contract

### Technical Details

- Single file deployment: `index.html` (~53KB)
- Zero dependencies: vanilla HTML + CSS + JS (ES2020+)
- Performance: consistent 60fps on mid-range phones, < 5MB memory
- Block size: 90×90px (constant, no shrinking)
- Cable length: 360px (4× block height, fixed)
- Portrait orientation, max canvas width 480px
- Delta time capped at 1/30s (prevents physics explosion after tab switch)

---

## Upcoming

### Phase 2: Telegram Integration
- Telegram WebApp SDK integration
- Haptic feedback on drop/land/game over
- MainButton for primary actions
- Theme adaptation from Telegram params
- Bot setup with `/start` command

### Phase 3: Polish & Backend
- Procedural sound effects (Web Audio API)
- Service worker for offline play
- Python FastAPI backend scaffold
- Leaderboard API
- Telegram auth via WebAppData
