# Tower Stack — Quickstart Validation Guide

> **Spec ID:** 001-tower-stack
> **Purpose:** Verify the game works correctly in ~5 minutes.

---

## Setup

```bash
cd tower-stack
# Open in browser:
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
# Or serve locally:
python3 -m http.server 8000
# Then open http://localhost:8000
```

---

## Validation Scenarios

### 1. Start Game

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Load `index.html` | Main menu appears with "TOWER STACK" title, bounce animation |
| 1.2 | See buttons | PLAY, MY CITY, SETTINGS visible |
| 1.3 | See high score | "BEST: 0" or previous best displayed |
| 1.4 | See background | Animated sky with clouds |

### 2. Drop First Block

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Click PLAY | Game starts, crane swings a block |
| 2.2 | See "TAP TO DROP" hint | Hint text visible (fades after first drop) |
| 2.3 | Tap/click/space | Block releases, falls with horizontal momentum |
| 2.4 | Block lands on base | First block placed, score increments |

### 3. Perfect Placement

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Drop block when perfectly aligned | Block lands full-width on tower |
| 3.2 | See "PERFECT!" text | Gold flash/text appears |
| 3.3 | Combo increments | HUD shows combo ×1, ×2, etc. |
| 3.4 | Score = 100 × combo | Score increases with multiplier |
| 3.5 | Screen shakes briefly | Subtle shake (3px, 200ms) |

### 4. Off-Center Placement

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Drop block slightly off-center | Block lands on tower, overhang falls as debris |
| 4.2 | Tower wobbles | Visible left-right oscillation |
| 4.3 | No combo reset | Combo counter stays (only miss resets it) |
| 4.4 | Wobble amplitude | Increases with cumulative inaccuracy |

### 5. Miss a Block

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Drop block with < 30% overlap | Block falls off to the side with rotation |
| 5.2 | Lives decrease | HUD: ❤️❤️❤️ → ❤️❤️🖤 |
| 5.3 | Combo resets | Combo counter returns to 0 |

### 6. Game Over

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Miss 3 blocks total | Game over screen appears |
| 6.2 | See stats | Height, score, best combo displayed |
| 6.3 | See buttons | RETRY and CITY buttons visible |
| 6.4 | Data saved | Tower added to city in localStorage |

### 7. City View

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Click CITY from game over | Skyline view appears |
| 7.2 | See towers | Previous towers rendered as buildings |
| 7.3 | Scroll horizontally | Touch pan scrolls the skyline |
| 7.4 | See stats | Total towers, highest building |
| 7.5 | Click BACK | Returns to main menu |

### 8. Settings

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Click SETTINGS from menu | Settings overlay opens |
| 8.2 | See physics params | Block size, gravity, swing speed, etc. |
| 8.3 | Change a value | Field editable |
| 8.4 | Click Apply & Restart | Game restarts with new settings |
| 8.5 | Click Cancel | Returns to menu without changes |

### 9. Background Zones

| Step | Action | Expected |
|------|--------|----------|
| 9.1 | Build tower to 10+ floors | Background transitions from Ground to Low Sky |
| 9.2 | Build to 30+ floors | Above Clouds theme visible |
| 9.3 | Build to 70+ floors | Space theme with stars |

### 10. Input Methods

| Step | Action | Expected |
|------|--------|----------|
| 10.1 | Touch tap (mobile) | Drops block |
| 10.2 | Mouse click (desktop) | Drops block |
| 10.3 | Spacebar | Drops block |
| 10.4 | Enter key | Drops block |
| 10.5 | Rapid tap 3× quickly | Only first tap registers (debounce) |

### 11. Persistence

| Step | Action | Expected |
|------|--------|----------|
| 11.1 | Play a game, score some points | |
| 11.2 | Close the tab | |
| 11.3 | Re-open `index.html` | Best score preserved on menu |
| 11.4 | Open city view | Previous tower(s) visible in skyline |

---

## Quick Smoke Test (2 minutes)

1. Load game → see menu ✅
2. Tap PLAY → block swings ✅
3. Tap to drop → block lands ✅
4. Miss 3 blocks → game over ✅
5. Tap RETRY → new game starts ✅
6. Play, game over → tap CITY → see skyline ✅
7. Tap BACK → menu with best score ✅

If all ✅, core game is functional.

---

*Validation scenarios derived from SPEC.md §10 (Testing Criteria) and ENGINEERING.md §11 (Test Matrix).*
