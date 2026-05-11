# Tower Stack — Feature Specification

> **Spec ID:** 001-tower-stack
> **Status:** Phase 1 Complete (MVP shipped)
> **Source:** SPEC.md v3.0 (2026-05-11)

---

## Summary

A Tower Bloxx-style casual web game: a crane swings a block on a cable, you tap to drop it, stack blocks into a tower. Physics-based landing with swing momentum, block rotation, and cable tilt inheritance. Perfect timing = combos. Miss 3 times and the game ends. After each round, your tower joins a growing city skyline. Play in browser or inside Telegram.

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
- **FR-05:** Block inherits its **tilt angle from the cable** at the moment of release. The tilt rotates around the block's center, not the hook point, ensuring zero visual discontinuity between crane-swing and free-fall rendering.
- **FR-06:** During free fall, the block **rotates toward upright** via a restoring spring + damping model. This creates natural, visible straightening over ~0.3–0.5 seconds.
- **FR-07:** Tower wobbles on off-center placement. Wobble amplitude = f(cumulative avg offset, tower height). Wobble is a driven damped spring.
- **FR-08:** No overhang cutting — the entire tower wobbles instead. Block stays at placed position.
- **FR-09:** Wobble suppressed while base block is still visible on screen.

### Drop Physics (Detailed)

- **FR-10:** At release, the block's world position is calculated from the **rotated geometry** around the hook point:
  ```
  hookX = pivotX + sin(angle) × cableLength
  hookY = pivotY + cos(angle) × cableLength
  
  blockCenterX = hookX + (BS/2) × sin(angle)
  blockCenterY = hookY + (BS/2) × cos(angle)
  ```
  This ensures the block's visual position matches exactly where `drawCrane()` rendered it (tilted with cable, rotating around hook top-center).

- **FR-11:** Block rotation at release = `-angle` (negated for canvas coordinate convention where positive rotation is clockwise).

- **FR-12:** Block inherits a small angular velocity from the swing: `angularVel = -vx / cableLength × 0.3`.

- **FR-13:** During fall, rotation evolves via spring-damper physics:
  ```
  restoringTorque = -rotation × fallRestoringSpring  (default 12)
  angularDamping   = -angularVel × fallAngularDamping (default 4)
  angularVel += (restoringTorque + angularDamping) × dt
  rotation += angularVel × dt
  ```

- **FR-14:** Falling block is rendered in **world space** (no wobble transform). It is not attached to the tower, so wobble does not affect it. This ensures visual position = physics position = collision position at all times.

### Release Trajectory Physics (Testable)

- **FR-15T:** At release, the block's horizontal velocity equals the pendulum tangential velocity: `vx = maxAngle × swingSpeed × cos(time × swingSpeed) × cableLength`. This is the **inertia from the swing** — no additional forces are applied horizontally during free fall.

- **FR-16T:** After release, horizontal velocity is **constant** (no air drag). The block drifts horizontally by `vx × fallDuration` pixels during its fall.

- **FR-17T:** Vertical motion follows pure free fall: `y(t) = y0 + ½ × gravity × t²`. Vertical velocity increases linearly: `vy(t) = gravity × t`.

- **FR-18T:** The combined trajectory is a **parabola**: `x(t) = x0 + vx × t`, `y(t) = y0 + ½ × g × t²`. No horizontal forces, constant gravity. This must hold for all release points and all amplitudes.

- **FR-19T:** **Energy is conserved** during free fall. Total mechanical energy `E = ½(vx² + vy²) + g × y` remains constant throughout the trajectory (gravity is conservative, no dissipation on translation). Rotation spring-damper does NOT affect translational energy.

- **FR-20T:** At the **extreme of swing** (angle = ±maxAngle), horizontal velocity is **zero** (`cos(π/2) = 0`). Block falls straight down from its displaced position with full tilt rotation.

- **FR-21T:** At the **center of swing** (angle = 0), horizontal velocity is **maximum** (`cos(0) = 1`). Block moves purely horizontally with no initial tilt.

- **FR-22T:** Rotation evolves as a damped harmonic oscillator: `θ'' + fallAngularDamping × θ' + fallRestoringSpring × θ = 0`. The analytical solution is `θ(t) = e^(-γt/2) × (A cos(ωd × t) + B sin(ωd × t))` where `ωd = √(k - (γ/2)²)`. The simulated rotation must match this analytical solution within tolerance.

- **FR-23T:** The physics must hold for **all amplitudes** (5°–20°) and **all release phases** (extreme, center, quarter points) — tested via matrix of amplitude × phase × time checkpoint.

### Miss / Lives

- **FR-15:** Block considered "missed" if < 30% overlap with tower top. Block falls off with rotation (inherited from current tilt).
- **FR-16:** Player has 3 lives. HUD shows ❤️❤️❤️ → ❤️❤️🖤 → ❤️🖤🖤 → GAME OVER.
- **FR-17:** Miss resets combo to 0 but doesn't immediately end game.

### Scoring

- **FR-18:** Per floor: 100 × combo multiplier.
- **FR-19:** Perfect placement (centered ±3px): +50 bonus.
- **FR-20:** Height milestone (every 10 floors): +500 bonus.
- **FR-21:** Combo increments on consecutive centered placements. Non-perfect non-miss landings do NOT reset combo.

### Camera & Viewport

- **FR-22:** Bottom portion shows last 3.5 blocks of tower.
- **FR-23:** Camera scrolls up smoothly as tower grows (lerp speed ~5.0).
- **FR-24:** Camera never moves down.

### Background

- **FR-25:** 8 height-based zones (Ground → Space) with procedural backgrounds.
- **FR-26:** Smooth color transitions at zone boundaries (first/last 30% of each zone).
- **FR-27:** Decorative elements (trees, clouds, birds, planes, stars, satellites) drift slowly.

### Screens

- **FR-28:** Main Menu — title animation, PLAY/MY CITY/SETTINGS buttons, high score display.
- **FR-29:** Settings Screen — overlay with all configurable physics parameters (including fall rotation), Apply & Restart / Cancel.
- **FR-30:** Gameplay — canvas with dynamic background, HUD (score, combo, lives, floors), "TAP TO DROP" hint.
- **FR-31:** Game Over — overlay with stats (height, score, best combo), RETRY/CITY buttons.
- **FR-32:** City View — horizontal skyline of all previous towers, scrollable with touch, BACK/PLAY buttons.

### Persistence

- **FR-33:** All data in localStorage. Keys: `towerStack_v2` (unified JSON with towers, scores, settings).
- **FR-34:** Max 50 towers kept in city history.

### Telegram Integration

- **FR-35:** Load `telegram-web-app.js` SDK when in Telegram environment.
- **FR-36:** Call `Telegram.WebApp.ready()` and `Telegram.WebApp.expand()` on launch.
- **FR-37:** Haptic feedback on drop/land/game over via `Telegram.WebApp.HapticFeedback`.

---

## Key Entities

| Entity | Description |
|--------|-------------|
| **Block** | Square game piece (90×90px). Properties: x, y, width, height, color, perfect flag, offset (inaccuracy). |
| **FallingBlock** | Block in free fall. Additional: vx, vy, rotation (tilt angle), angularVel (spin rate). |
| **Tower** | Array of placed blocks, bottom to top. Wobble state (angle, angularVel, targetAngle). |
| **TowerRecord** | Saved tower: height, score, date. Stored in localStorage for city view. |
| **GameState** | State machine: MENU → PLAYING → DROPPING → PLAYING/GAME_OVER → CITY_VIEW → SETTINGS. |
| **Crane** | Pendulum system: pivot point, time, cable length, stretch, stretch velocity. |
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
- **SC-08:** Block position is visually continuous at the moment of release (no jump).
- **SC-09:** Falling block rotation straightens naturally during fall.
- **SC-10:** Collision detection and visual position are always consistent (world-space).
- **SC-11:** Works as Telegram Mini App with optional SDK.
- **SC-12:** Block trajectory after release is a perfect parabola for all amplitudes (5°–20°) and all release phases (8 key points tested). Position error < 2px at 7 time checkpoints.
- **SC-13:** Energy is conserved during free fall (relative error < 0.1%) for all amplitude/phase combinations.
- **SC-14:** Rotation dynamics match the analytical damped harmonic oscillator solution within 0.02 rad tolerance.
- **SC-15:** Horizontal velocity remains constant during fall (drift < 0.01 px/s over 0.5s).

---

## Assumptions

- A-01: No backend needed for MVP. All data local.
- A-02: Portrait orientation is the primary layout. Landscape is not supported.
- A-03: Block has rotation physics — inherits tilt from cable, straightens via spring-damper during fall.
- A-04: Canvas max width capped at 480px for consistent desktop experience.
- A-05: Fredoka One + Nunito fonts loaded from CDN (or fallback to system-ui).
- A-06: Block color palette cycles through 6 colors: `#FF6B6B`, `#FFD93D`, `#6BCB77`, `#4D96FF`, `#C084FC`, `#FFA07A`.

---

*Spec version: 3.0*
*Updated: 2026-05-11*
*Changes: Added FR-05 through FR-14 (rotation physics, corrected drop position), FR-14 (world-space rendering), SC-08 through SC-10. Removed A-03 contradiction (now supports rotation).*
