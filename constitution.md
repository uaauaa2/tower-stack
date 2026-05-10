# Tower Stack — Project Constitution

> The unbreakable rules. Every decision must pass through these principles.

---

## C-01: Single Tap, Zero Learning Curve
One input: tap/click/spacebar. No tutorials needed. The game teaches itself through play. If a feature requires explanation, redesign it.

## C-02: Mobile First, Desktop Second
Portrait orientation. Touch input primary. Canvas scales to any screen. Desktop is a bonus, not the target. Safe areas respected.

## C-03: Zero Dependencies
Vanilla HTML + CSS + JS. No frameworks, no build step, no npm. One file ships everything. Every added byte must justify itself.

## C-04: Performance Budget
- Bundle: < 150KB gzipped
- Load time: < 2s on 3G
- FPS: consistent 60fps on mid-range phones
- Memory: < 50MB
No feature ships if it violates these numbers.

## C-05: Telegram Ready
Must work as a Telegram Mini App with minimal changes. The `telegram-web-app.js` SDK integration is optional — the game runs identically with or without it.

## C-06: Data Local First
All progress stored in localStorage. No backend required for MVP. Future backend/leaderboard is additive, never mandatory.

---

*Source: SPEC.md §2 — Constitution*
*Established: 2026-05-09*
