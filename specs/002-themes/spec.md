# Tower Stack — Theme System Specification

> **Spec ID:** 002-themes
> **Status:** In Progress
> **Branch:** feature/T27-themes
> **Source:** User request 2026-05-12

---

## Summary

Add 4 visual themes to Tower Stack. Theme is selected inside the Settings screen and persisted in localStorage. Each theme overrides the entire visual rendering: blocks, background, HUD, menus, crane, and buttons.

---

## Themes

### T-01: Classic (Enhanced)
The current design elevated with gradient-filled blocks, top-light/bottom-shadow depth, and polished button styles. Serves as the default.

### T-02: Cyberpunk
- Dark purple/black background (`#050010`)
- Neon block colors: cyan, magenta, yellow
- Blocks: dark fill + neon border glow (`ctx.shadowBlur`)
- Background: pixel grid + scanline overlay
- HUD/text: neon cyan with glow

### T-03: ASCII
- Black background, green (`#00FF41`) monospace palette
- Blocks: dark green fill + bright green outline, no gradients
- Background: Matrix-style falling character rain
- HUD/text/buttons: monospace green
- Font: `'Courier New', monospace`

### T-04: Pixel Art
- NES-style flat colored sky (no gradients)
- Blocks: chunky 8×8 "pixel" grid inside each block via dithering
- Top-left highlight, bottom-right shadow in integer steps
- 1px black border, no anti-aliasing feel
- Chunky pixel clouds and ground elements

---

## User Stories

- **US-T01:** As a player, I want to pick a visual theme so the game matches my aesthetic preference.
- **US-T02:** As a returning player, I want my chosen theme saved so I don't have to reselect it each session.
- **US-T03:** As a player, I want the theme to apply to all screens (menu, gameplay, game over) for a consistent experience.

---

## Functional Requirements

- **FR-T01:** Theme selector appears inside the Settings screen as a 2×2 button grid.
- **FR-T02:** Switching theme takes effect immediately (no game restart needed for visual changes).
- **FR-T03:** Active theme stored in existing localStorage key (added to save data object).
- **FR-T04:** Theme colors override `blockColors`, `craneColor`, `cableColor`, `hookColor`.
- **FR-T05:** Each theme provides distinct rendering for: blocks, background, ground, crane, HUD, menu, game-over card, city view, buttons.
- **FR-T06:** Performance budget unchanged: 60fps on mid-range phones (no WebGL, no heavy canvas ops).

---

## Constitution Compliance

| Principle | Status |
|-----------|--------|
| C-01: Single Tap | ✅ Theme switching does not change input model |
| C-02: Mobile First | ✅ Theme selector is touch-friendly |
| C-03: Zero Dependencies | ✅ Pure Canvas 2D, no external assets |
| C-04: Performance Budget | ✅ Only rect/stroke calls; glows limited to cyberpunk |
| C-05: Telegram Ready | ✅ No SDK changes |
| C-06: Data Local First | ✅ Theme stored in localStorage |

---

## Edge Cases

- **EC-T01:** localStorage missing/corrupt → fallback to `'classic'` theme.
- **EC-T02:** Unknown theme ID in storage → fallback to `'classic'`.
- **EC-T03:** Theme change during active game → visual updates on next frame, game state unchanged.
