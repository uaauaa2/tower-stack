# Tower Stack — Feature Specification

> **Spec ID:** 001-tower-stack
> **Status:** Phase 1 Complete (MVP shipped)
> **Source:** SPEC.md v2.0 (2026-05-09)

---

## Summary

A Tower Bloxx-style casual web game: a crane swings a block on a cable, you tap to drop it, stack blocks into a tower. Physics-based landing with swing momentum. Perfect timing = combos. Miss 3 times and the game ends. After each round, your tower joins a growing city skyline. Play in browser or inside Telegram.

---

## User Stories

### P1 — Must Have (MVP)

- **US-01:** As a casual player, I want to tap once to drop a swinging block so I can stack it on a tower with zero learning curve.
- **US-02:** As a mobile player, I want the game to load instantly in my browser so I don't need to install anything.
- **US-03:** As a competitive player, I want a combo system that rewards perfect timing so there's skill-based depth.
- **US-04:** As a returning player, I want to see my previous towers as a city skyline so I feel progression.
- **US-05:** As a player, I want the game to save my scores locally so I don't lose progress between sessions.

### P2 — Should Have (Telegram Integration)

- **US-06:** As a Telegram user, I want to launch the game directly from a bot so there's zero friction.
- **US-07:** As a Telegram user, I want haptic feedback on drops and landings so the game feels tactile.
- **US-08:** As a Telegram user, I want the game to adapt to my Telegram theme so it feels native.

### P3 — Nice to Have (Polish & Backend)

- **US-09:** As a player, I want sound effects so the game has satisfying audio feedback.
- **US-10:** As a player, I want offline play so the game works without internet after first load.
- **US-11:** As a competitive player, I want a global leaderboard so I can compare with others.

---

## Edge Cases

- **EC-01:** Block lands with < 30% overlap → counted as miss, block falls off with rotation animation.
- **EC-02:** Block lands perfectly centered (±3px) → "PERFECT" bonus, combo increment.
- **EC-03:** Block lands off-center but ≥ 30% overlap → block stays, tower wobbles, no combo bonus (but combo NOT reset).
- **EC-04:** 3 misses accumulated → game over, tower saved to city.
- **EC-05:** Very tall tower (50+ blocks) → camera scrolls smoothly, background transitions to space theme.
- **EC-06:** Tab switch during gameplay → delta time capped at 1/30s, no physics explosion on return.
- **EC-07:** Corrupt localStorage → graceful fallback to empty data, no crash.
- **EC-08:** Resize during game → canvas rescales, game state preserved.
- **EC-09:** Rapid tapping → debounce (100ms), only first tap registers.

---

## Functional Requirements

### Core Gameplay

- **FR-01:** Crane swings a block as a pendulum at constant speed (~π rad/s), with amplitude increasing by tower height via smoothstep interpolation.
- **FR-02:** Block is square (90×90px). Size stays constant (no shrinking).
- **FR-03:** Cable length is fixed at 4× block height (360px). Crane may extend off-screen.
- **FR-04:** When tapped, block detaches with its current swing velocity (horizontal momentum preserved). Falls under gravity (2000 px/s²).
- **FR-05:** Tower wobbles on off-center placement. Wobble amplitude = f(cumulative avg offset, tower height). Wobble is a driven damped spring.
- **FR-06:** No overhang cutting — the entire tower wobbles instead. Block stays at placed position.
- **FR-07:** Wobble suppressed while base block is still visible on screen.

### Miss / Lives

- **FR-08:** Block considered "missed" if < 30% overlap with tower top. Block falls off with rotation.
- **FR-09:** Player has 3 lives. HUD shows ❤️❤️❤️ → ❤️❤️🖤 → ❤️🖤🖤 → GAME OVER.
- **FR-10:** Miss resets combo to 0 but doesn't immediately end game.

### Scoring

- **FR-11:** Per floor: 100 × combo multiplier.
- **FR-12:** Perfect placement (centered ±3px): +50 bonus.
- **FR-13:** Height milestone (every 10 floors): +500 bonus.
- **FR-14:** Combo increments on consecutive centered placements. Non-perfect non-miss landings do NOT reset combo.

### Camera & Viewport

- **FR-15:** Bottom portion shows last 3.5 blocks of tower.
- **FR-16:** Camera scrolls up smoothly as tower grows (lerp speed ~5.0).
- **FR-17:** Camera never moves down.

### Background

- **FR-18:** 8 height-based zones (Ground → Space) with procedural backgrounds.
- **FR-19:** Smooth color transitions at zone boundaries (first/last 30% of each zone).
- **FR-20:** Decorative elements (trees, clouds, birds, planes, stars, satellites) drift slowly.

### Screens

- **FR-21:** Main Menu — title animation, PLAY/MY CITY/SETTINGS buttons, high score display.
- **FR-22:** Settings Screen — overlay with all configurable physics parameters, Apply & Restart / Cancel.
- **FR-23:** Gameplay — canvas with dynamic background, HUD (score, combo, lives, floors), "TAP TO DROP" hint.
- **FR-24:** Game Over — overlay with stats (height, score, best combo), RETRY/CITY buttons.
- **FR-25:** City View — horizontal skyline of all previous towers, scrollable with touch, BACK/PLAY buttons.

### Persistence

- **FR-26:** All data in localStorage. Keys: `towerStack_city`, `towerStack_bestScore`, `towerStack_bestHeight`, `towerStack_settings`.
- **FR-27:** Max 50 towers kept in city history.

### Telegram Integration

- **FR-28:** Load `telegram-web-app.js` SDK when in Telegram environment.
- **FR-29:** Call `Telegram.WebApp.ready()` and `Telegram.WebApp.expand()` on launch.
- **FR-30:** Haptic feedback on drop/land/game over via `Telegram.WebApp.HapticFeedback`.

---

## Key Entities

| Entity | Description |
|--------|-------------|
| **Block** | Square game piece (90×90px). Properties: x, y, width, height, color, perfect flag. |
| **Tower** | Array of placed blocks, bottom to top. Wobble state (angle, target angle). |
| **TowerRecord** | Saved tower: height, date, width. Stored in localStorage for city view. |
| **GameState** | State machine: MENU → PLAYING → DROPPING → PLAYING/GAME_OVER → CITY_VIEW. |
| **Crane** | Pendulum system: pivot point, angle, speed, cable length, attached block. |
| **Camera** | Scroll position with smooth lerp toward target. Never goes down. |
| **City** | Collection of TowerRecords rendered as a skyline. |

---

## Success Criteria

- **SC-01:** Game loads in < 2s on mobile 3G.
- **SC-02:** Consistent 60 FPS gameplay on mid-range phones.
- **SC-03:** Single tap/click/space input works across all states.
- **SC-04:** Game saves and restores progress via localStorage without errors.
- **SC-05:** City view renders all saved towers correctly.
- **SC-06:** All 8 background zones display with smooth transitions.
- **SC-07:** Tower wobble responds to placement accuracy without overhang cutting.
- **SC-08:** Works as Telegram Mini App with optional SDK.

---

## Assumptions

- A-01: No backend needed for MVP. All data local.
- A-02: Portrait orientation is the primary layout. Landscape is not supported.
- A-03: No rotation physics on dropped blocks — they fall straight with horizontal momentum only.
- A-04: Canvas max width capped at 480px for consistent desktop experience.
- A-05: Fredoka One + Nunito fonts loaded from CDN (or fallback to system-ui).
- A-06: Block color palette cycles through 6 colors: `#FF6B6B`, `#FFD93D`, `#6BCB77`, `#4D96FF`, `#C084FC`, `#FFA07A`.

---

*Derived from SPEC.md v2.0 and ENGINEERING.md v1.0*
