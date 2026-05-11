# Tower Stack — Technical Research

> **Spec ID:** 001-tower-stack
> **Date:** 2026-05-10

---

## 1. Canvas 2D vs WebGL

### Decision: Canvas 2D ✅

**Rationale:**
- Game is a simple 2D scene with flat-colored rectangles, gradients, and simple shapes.
- No particle systems requiring GPU acceleration.
- No shader effects needed.
- Canvas 2D API is simpler, more portable, and sufficient for 60fps with < 100 draw calls per frame.
- WebGL adds ~30KB boilerplate (or requires a library, violating C-03).

**Performance validation:**
- At 480×800 resolution with DPR=2, Canvas 2D handles 200+ rectangles per frame at 60fps on mid-range phones.
- Our scene: ~8 background elements + tower blocks (max ~100 visible) + crane + HUD = well within budget.

---

## 2. Vanilla JS vs Frameworks

### Decision: Vanilla JavaScript (ES2020+) ✅

**Evaluated:**

| Framework | Pros | Cons | Verdict |
|-----------|------|------|---------|
| React | Component model, JSX | ~40KB min, build step needed, overkill for Canvas | ❌ |
| Vue | Lighter (~10KB) | Still needs build, DOM-centric | ❌ |
| Preact | ~3KB | Still DOM-centric, adds complexity | ❌ |
| Vanilla JS | Zero deps, no build, full control | More boilerplate | ✅ |

**Rationale:**
- All rendering is Canvas — no DOM manipulation needed beyond the initial `<canvas>` element.
- Game logic is imperative by nature (game loop, physics). Frameworks add overhead for no benefit.
- C-03 (Zero Dependencies) is a hard constraint.
- ES2020 features (optional chaining, nullish coalescing, `const`/`let`) are supported in all target browsers.

---

## 3. localStorage vs IndexedDB

### Decision: localStorage ✅

**Evaluated:**

| Storage | Capacity | API | Async | Browser Support |
|---------|----------|-----|-------|----------------|
| localStorage | ~5-10MB | Synchronous `getItem`/`setItem` | No | Universal |
| IndexedDB | ~50MB+ | Async, complex API | Yes | Universal |
| Cache API | ~unlimited | Async, Request/Response | Yes | Modern |

**Rationale:**
- Data model is tiny: max 50 TowerRecords (~1.2KB) + scores + settings = < 5KB total.
- Synchronous API simplifies code (no async/await for simple reads).
- Universal browser support including older WebViews.
- C-06 (Data Local First) doesn't require complex queries.

**Future consideration:** If leaderboard sync or large replay data is added, migrate to IndexedDB.

---

## 4. GitHub Pages Hosting

### Decision: GitHub Pages (Static) ✅

**Setup:**
```
Repository: uaauaa2/tower-stack
Branch: master (legacy mode)
URL: https://uaauaa2.github.io/tower-stack/
```

**Deployment flow:**
```bash
git push origin master  # auto-deploys via GitHub Pages
```

**Advantages:**
- Free, zero-config hosting for static files.
- HTTPS by default.
- Global CDN (Fastly-backed).
- Perfect for single-file game deployment.

**Limitations:**
- Static only (no server-side logic). Fine for MVP.
- No custom headers (can't set `Service-Worker-Allowed`). Workaround: scope SW to root.
- 100MB repo size limit, 1GB/month bandwidth. More than sufficient.

**Telegram Mini App compatibility:**
- Telegram requires HTTPS — GitHub Pages provides this.
- Bot can link directly to the GitHub Pages URL.
- No CORS issues since everything is same-origin.

---

## 5. Telegram Mini App SDK Integration

### Research Summary

**SDK:** `https://telegram.org/js/telegram-web-app.js` (~15KB)

**Key APIs for Tower Stack:**

| API | Purpose | Phase |
|-----|---------|-------|
| `Telegram.WebApp.ready()` | Signal app loaded | 2 |
| `Telegram.WebApp.expand()` | Full viewport | 2 |
| `Telegram.WebApp.HapticFeedback` | Tactile feedback | 2 |
| `Telegram.WebApp.themeParams` | Theme colors | 2 |
| `Telegram.WebApp.MainButton` | Primary action button | 2 |
| `Telegram.WebApp.setHeaderColor()` | Match game sky color | 2 |
| `Telegram.WebAppData` (initData) | Server-side auth | 3 |

**Integration pattern:**
```javascript
const isTelegram = window.Telegram && window.Telegram.WebApp;
if (isTelegram) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
}
```

**Haptic feedback opportunities:**
- `impactOccurred('light')` — block lands perfectly
- `impactOccurred('medium')` — block lands off-center
- `impactOccurred('heavy')` — game over
- `notificationOccurred('success')` — combo milestone

**Theme adaptation:**
- `themeParams.bg_color` → could tint sky gradient
- `themeParams.text_color` → HUD text color
- Decision: keep game's own color scheme but adapt HUD to Telegram theme for native feel.

**Bot setup (Phase 2):**
1. Create bot via @BotFather
2. Set `/start` command → deep link to game URL
3. Configure Mini App URL in bot settings
4. Optional: `GamePlatform` for inline game mode

---

## 6. Web Audio API for Sound Effects (Phase 3 Research)

**Approach:** Procedural sound generation — no audio files needed.

| Sound | Technique | Duration |
|-------|-----------|----------|
| Drop whoosh | White noise + bandpass filter sweep | 200ms |
| Block land | Short sine wave burst (low freq) | 100ms |
| Perfect placement | Two-tone chime (major third interval) | 300ms |
| Combo milestone | Ascending arpeggio | 500ms |
| Game over | Descending tone | 800ms |
| Background music | Not planned (stays silent) | — |

**No audio files = zero extra bytes.** All sounds generated at runtime.

---

*Research compiled from SPEC.md, ENGINEERING.md, and platform documentation.*
