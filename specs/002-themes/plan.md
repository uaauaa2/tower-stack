# Tower Stack — Theme System Plan

> **Spec ID:** 002-themes
> **Branch:** feature/T27-themes

---

## Architecture

All theme data lives in a `THEMES` constant (4 entries). A module-level `activeTheme` string selects the active entry. A helper `theme()` returns the active theme object.

### THEMES schema

```
{
  id: string,
  name: string,           // display name
  blockColors: string[],  // 6 hex colors for blocks
  craneColor: string,
  cableColor: string,
  hookColor: string,
  hudColor: string,        // primary HUD text color
  hudComboColor: string,   // combo multiplier color
  fontFamily: string,      // CSS font-family string
  btnPrimary: string,
  btnSecondary: string,
  menuBgTop: string,       // menu background gradient start
  menuBgBot: string,       // menu background gradient end
  menuTextColor: string,
  blockStyle: 'classic' | 'cyberpunk' | 'ascii' | 'pixel',
  bgStyle: 'classic' | 'cyberpunk' | 'ascii' | 'pixel',
}
```

### Block rendering dispatch

`drawBlockTheme(bx, by, color, isPerfect)` → dispatches to:
- `drawBlockClassic` — gradient fill, rounded-ish highlight/shadow
- `drawBlockCyberpunk` — dark fill, neon border glow, scan lines
- `drawBlockAscii` — flat dark fill, green border outline
- `drawBlockPixel` — dithered 8×8 pixel grid, hard edges, 1px black border

### Background dispatch

`drawBackground()` → dispatches to:
- `drawBackgroundClassic()` — existing zone gradient system
- `drawBackgroundCyberpunk()` — dark base + pixel grid + scanlines
- `drawBackgroundAscii()` — black + Matrix character rain
- `drawBackgroundPixel()` — flat NES-palette sky + chunky clouds

### Matrix rain state

`matrixColumns[]` — initialized once via `initMatrixRain()` after `initBgObjects()`.
Rendered every frame in `drawBackgroundAscii()` using `Date.now()` for animation.

### Settings integration

`initSettingsForm()` prepends a theme selector section (2×2 button grid, HTML DOM).
Clicking a button: sets `activeTheme`, calls `Storage.saveTheme(id)`, refreshes button states.
Theme takes effect on next draw frame — no game restart required.

### Storage

Theme added to existing save object: `{ ..., theme: 'classic' }`.
`Storage.saveTheme(id)` loads, sets `.theme`, saves.
On startup (after `resize()`): `activeTheme = Storage.load().theme || 'classic'`.

---

## File Changes

Single file: `index.html` (all JS is inline).

| Section | Change |
|---------|--------|
| After CFG | Add THEMES const, activeTheme var, theme() fn |
| After initBgObjects() | Add initMatrixRain() call + theme load |
| Storage | Add saveTheme() method |
| blockColor() | Use theme().blockColors |
| drawBackground() | Rename → drawBackgroundClassic(); add dispatch |
| drawGround() | Theme-aware ground styles |
| drawTower() | Replace inline block drawing with drawBlockTheme() |
| drawCrane() | Use theme crane/cable/hook colors; cyberpunk glow |
| drawFallingBlock() | Use drawBlockTheme() |
| drawDebris() | Use drawBlockTheme() |
| drawHUD() | Theme font, colors, optional glow |
| drawMenu() | Theme background, title color, font |
| drawGameOver() | Theme card bg, text colors |
| drawCityView() | Theme bg tint |
| drawButton() | 4 button visual styles |
| initSettingsForm() | Prepend theme selector UI |
