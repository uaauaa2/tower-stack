# Tower Stack — Design Review

**Date:** 2026-05-14
**Reviewer:** gstack design-review skill (source-code audit)
**Classifier:** APP UI (canvas game with menu/settings overlays)
**Scope:** Full source (`index.html` ~3100 lines), SPEC.md, README.md

---

## Dual Headline Scores

| Metric | Grade | Verdict |
|--------|-------|---------|
| **Design Score** | **B+** | Solid craft for a single-file game. Themed variants add personality. A few spacing and hierarchy issues hold it back from A territory. |
| **AI Slop Score** | **A-** | Minimal slop. No purple gradients, no 3-column feature grids, no decorative blobs. The themed approaches (cyberpunk circuit traces, ASCII box-drawing, pixel rivet detail) show real design thinking, not template output. One small ding: emoji used as button labels in the menu. |

---

## Per-Category Grades

| Category | Grade | Weight | Weighted |
|----------|-------|--------|----------|
| Visual Hierarchy & Composition | B+ | 15% | 0.15 × 3.5 |
| Typography | B | 15% | 0.15 × 3.0 |
| Color & Contrast | A- | 10% | 0.10 × 3.7 |
| Spacing & Layout | B | 15% | 0.15 × 3.0 |
| Interaction States | B | 10% | 0.10 × 3.0 |
| Responsive Design | B+ | 10% | 0.10 × 3.5 |
| Content & Microcopy | A- | 10% | 0.10 × 3.7 |
| AI Slop Detection | A- | 5% | 0.05 × 3.7 |
| Motion & Animation | B+ | 5% | 0.05 × 3.5 |
| Performance as Design | B+ | 5% | 0.05 × 3.5 |

**Weighted average → B+**

---

## Phase 1: First Impression

The site communicates **playful competence**. This is a game that knows what it is — a casual stacking toy — and doesn't pretend to be more.

I notice **the themed block sprites**. The classic glossy gradient, the cyberpunk circuit traces with corner brackets, the ASCII box-drawing characters with CRT scanlines, and the pixel NES-style rivet blocks — each is a fully-realized visual system, not a tint swap. That's rare for a single-file project.

The first 3 things my eye goes to are: **(1) the title "TOWER STACK"** centered and bold, **(2) the PLAY button** in blue, **(3) the emoji-decorated secondary buttons** below it. The hierarchy is correct — the primary action is where it should be.

If I had to describe this in one word: **confident**.

### Page Area Test

| Area | Purpose (2-second test) |
|------|------------------------|
| Top 1/4 | Title / branding — clear |
| Middle | Menu buttons — clear |
| Bottom 18% | Decorative ground/earth strip — could be confused for content |
| Sky area | Atmospheric decoration — clear |

---

## Phase 2: Inferred Design System

### Fonts

| Font | Usage | Notes |
|------|-------|-------|
| `Fredoka One` | Classic theme titles, HUD | Display font — good choice for a game. Not loaded via Google Fonts though; falls back silently to `Segoe UI` then `system-ui`. |
| `Courier New` | Cyberpunk, ASCII, Pixel themes | Monospace — appropriate for terminal/retro themes. |
| `sans-serif` | Lives (emoji), settings overlay | Generic. Lives uses `sans-serif` instead of the theme font — inconsistency. |
| `system-ui` (implicit) | Fallback chain | Acceptable as fallback only. |

**Finding:** `Fredoka One` is referenced in `fontFamily` but never loaded via `<link>` or `@import`. On systems without it installed, the classic theme silently degrades to `Segoe UI → system-ui`. This is a real font loading gap.

### Colors

**Classic theme:**
- Block palette: 6 colors (`#FF6B6B`, `#FFD93D`, `#6BCB77`, `#4D96FF`, `#C084FC`, `#FFA07A`) — warm, saturated, kid-friendly. Works well for a stacking game.
- Menu gradient: `#4FC3F7 → #E1F5FE` — clean sky blue.
- Button primary: `#4D96FF`, secondary: `#FF6B6B` — blue for action, red for secondary. Good semantic separation.

**Cyberpunk theme:**
- Neon cyan `#00FFFF` and magenta `#FF00FF` — high contrast on near-black backgrounds. Effective.
- Grid lines, scanlines, and glow effects create a cohesive circuit-board aesthetic.

**ASCII theme:**
- Green-on-black terminal palette — consistent and immediately recognizable.
- `#00FF41` primary with darker variants — good.

**Pixel theme:**
- NES-inspired palette — `#5C94FC` sky, bright saturated blocks.
- Hard-edge pixel blocks with rivet detail — authentic retro feel.

**Across all themes:** Color count is reasonable (6 block colors + 3-4 UI colors). No palette overload.

### Heading / Text Scale

All text is rendered via Canvas `fillText` — no CSS heading hierarchy. Text sizes are computed relative to `su` (scale unit = `Math.max(14, W * 0.065)`). This creates a responsive type scale:

| Element | Size multiplier | Approx at 375px |
|---------|----------------|-----------------|
| Title (TOWER/STACK) | 1.6× su | ~39px |
| Subtitle (Best score) | 0.65× su | ~16px |
| HUD score | 1.0× su | ~24px |
| HUD floors | 0.55× su | ~13px |
| Button text | h × 0.36 | ~16px |

**Finding:** HUD floors text at 0.55× su ≈ 13px on a 375px screen. This is below the 16px body text minimum. Readable but small.

---

## Phase 3: Page-by-Page Visual Audit

### Page 1: Main Menu

#### Trunk Test
| Question | Answer |
|----------|--------|
| What site is this? | PASS — "TOWER STACK" title prominent |
| What page am I on? | PASS — Single-screen menu, obvious |
| What are the major sections? | PASS — PLAY, LEADERBOARD, MY CITY, SETTINGS buttons |
| What are my options? | PASS — 4 buttons clearly visible |
| Where am I? | N/A — top-level |
| How can I search? | N/A — game |

**Score: PASS**

#### Findings

**FINDING-001** — Emoji in button labels (medium, AI Slop)
- Location: `drawMenu()` buttons at lines 2338-2348: `'▶ PLAY'`, `'🏆 LEADERBOARD'`, `'🏙 MY CITY'`, `'⚙ SETTINGS'`
- The ▶, 🏆, 🏙, ⚙ characters serve as button icons. While not the worst AI slop pattern (no rockets in headings), emoji as UI chrome is a slop indicator.
- **Fix:** Replace with plain text or simple drawn icons. Games get a pass here since emoji are universally supported, but consider if the emoji add value or noise.

**FINDING-002** — Settings button uses gear emoji `⚙` without a space (polish, Content)
- Location: Line 2348: `'⚙ SETTINGS'`
- Other buttons have two spaces between emoji and text: `'▶  PLAY'`, `'🏆  LEADERBOARD'`
- Inconsistent spacing between emoji and label text.

**FINDING-003** — Menu buttons positioned via hardcoded percentages (medium, Spacing)
- Location: Lines 2338-2348: `H * 0.48`, `H * 0.57`, `H * 0.66`, `H * 0.75`
- Button spacing is `H * 0.09` between each button (9% of viewport height). This is fixed regardless of button height.
- On very tall screens (e.g., iPhone 15 Pro Max, 932px), buttons sit far apart. On short screens (iPhone SE, 667px), buttons may overlap with the ground decoration at `H * 0.82`.
- **Fix:** Use a flexbox-like approach — calculate total button height + gaps, center the group.

**FINDING-004** — Ground decoration occupies 18% of viewport on menu (polish, Spacing)
- Location: Line 2315: `ctx.fillRect(0, H*0.82, W, H*0.18)`
- The ground (earth + grass) takes up the bottom 18% of the screen. On short viewports, this pushes the menu buttons up, compressing the title area.
- On a 667px screen: buttons end at `0.75 * 667 + btnH/2 ≈ 540px`. Ground starts at `0.82 * 667 ≈ 547px`. That's only 7px clearance — visually cramped.

**FINDING-005** — No visual feedback on button press (high, Interaction States)
- Location: `drawButton()` function, lines 2809-2856
- Buttons are drawn statically. There is no hover state, no active/pressed state, no visual feedback when touched.
- `handleButtonHit()` registers the tap and fires the action immediately, but the user gets no tactile confirmation that their tap registered.
- The canvas doesn't track which button is being pressed — no transient state.
- **Fix:** Add a pressed state (slightly darker fill, slight y-offset) that renders for ~100ms after tap.

**FINDING-006** — No `cursor: pointer` equivalent for canvas buttons (medium, Interaction States)
- On desktop, the cursor remains default over canvas buttons. No visual affordance that buttons are clickable.
- **Fix:** Track mouse position, detect button hover, and change canvas cursor style: `canvas.style.cursor = 'pointer'`.

### Page 2: Gameplay (Playing State)

#### Trunk Test
| Question | Answer |
|----------|--------|
| What site is this? | PASS — Game is obviously Tower Stack |
| What page am I on? | PASS — Playing state is clear |
| What are the major sections? | PARTIAL — HUD shows score, lives, floors, combo. No nav — correct for gameplay |
| What are my options? | PASS — Single action: tap to drop |
| Where am I? | PASS — Height indicator in HUD |
| How can I search? | N/A — game |

**Score: PASS**

#### Findings

**FINDING-007** — Lives use emoji ❤️ and 🖤 rendered via `sans-serif` font, not theme font (medium, Typography)
- Location: Line 2242: `ctx.font = \`${su * 0.8}px sans-serif\``
- All other HUD text uses the theme's `fontFamily`. Lives specifically override to `sans-serif` for emoji rendering.
- This breaks the typographic consistency. In the cyberpunk theme, the lives row looks like it belongs to a different app.
- **Fix:** Use `th.fontFamily` as fallback, or render lives as drawn shapes (hearts) instead of emoji.

**FINDING-008** — "TAP TO DROP" hint positioned at 50% screen height (polish, Spacing)
- Location: Line 2264: `ctx.fillText('TAP TO DROP', W/2, H * 0.5)`
- On tall screens, this sits right in the middle of the cable area — potentially overlapping with the swinging block.
- On short screens, it may overlap with the tower area.
- The hint fades after the first drop (`hintOpacity` decrements), so this is transient.

**FINDING-009** — Combo text grows with combo count: `su * 0.7 + combo` (medium, Typography)
- Location: Line 2251: `ctx.font = \`bold ${su * 0.7 + combo}px ${th.fontFamily}\``
- At combo ×10, the font is `su * 0.7 + 10 ≈ 19px + 10 = 29px` — already quite large.
- At combo ×30, it's ~49px — could overflow the HUD area or overlap with other HUD elements.
- The scaling has no upper bound.
- **Fix:** Cap the growth: `su * 0.7 + Math.min(combo, 15)`.

**FINDING-010** — Floating score text (+100, PERFECT!) uses world-space Y coordinates (polish, Spacing)
- Location: Lines 646-675: Float texts are positioned at `placed.y - 10` (world Y)
- These float upward relative to the camera, not the screen. As the camera scrolls up, old float texts stay visible longer than expected.
- This is a design choice (texts follow the tower), not necessarily a bug, but could surprise players who expect text to float toward screen-top.

**FINDING-011** — No `prefers-reduced-motion` check (medium, Motion)
- Location: The entire update loop
- Particles, shake, wobble, floating text, menu bounce animation — all run unconditionally.
- No check for `matchMedia('(prefers-reduced-motion: reduce)')`.
- **Fix:** Check once at startup. If reduced motion is preferred, skip particles, reduce shake to zero, disable menu bounce.

### Page 3: Game Over Overlay

#### Findings

**FINDING-012** — API status line visible to all users, including non-Telegram (medium, Content)
- Location: Lines 2417-2426: Always renders `${tgStatus} ${submitStatus}`
- For non-Telegram players, this shows "❌ no TG" prominently in the game over card.
- This is a developer-facing debug status that leaks into the user experience.
- **Fix:** Only show the API status line when `API.isTelegram()` is true. Non-Telegram users don't need to know about Telegram integration.

**FINDING-013** — Game over card uses `cardH = su * 17` — very tall on large screens (polish, Spacing)
- Location: Line 2359: `const cardH = su * 17`
- At 375px width: `su ≈ 24`, cardH ≈ 408px. On a 812px screen, this leaves only ~200px for the background.
- The card has 3 buttons stacked vertically inside it (RETRY, LEADERBOARD, MY CITY). The spacing between them is `su * 2.3 ≈ 55px` — generous but potentially cramped on small screens when combined with the stats.
- The card height is proportional to su, not the viewport. On tablets (768px wide canvas max 480px), `su ≈ 31`, cardH ≈ 527px — may exceed viewport height on landscape.

**FINDING-014** — Slide-up animation uses linear interpolation (polish, Motion)
- Location: Line 2361: `const slideUp = Math.min(1, gameOverTimer * 3)`
- The card slides in linearly over 0.33 seconds. No easing.
- A CSS-style `ease-out` would feel more natural — fast entry, soft settle.
- **Fix:** Apply an ease-out curve: `const t = Math.min(1, gameOverTimer * 3); const slideUp = 1 - Math.pow(1 - t, 3);`

### Page 4: City View

#### Findings

**FINDING-015** — City view ground takes 18% of viewport, buttons at bottom may be cramped (medium, Spacing)
- Location: Line 2495: `const groundY = H * 0.82`
- Ground is at 82% of viewport height. Back/Play buttons are at `H - su * 2.2`.
- Stats text at `H - su * 4` may overlap with buttons on short screens.

**FINDING-016** — Empty city state uses dashed rectangle as placeholder (B+, Content)
- Location: Lines 2488-2491
- The dashed rectangle is a good empty state — suggests "build something here" without being preachy.
- Missing: a primary action button in the empty state (e.g., "PLAY" button). The user has to find the PLAY button at the bottom.

### Page 5: Settings Overlay

#### Findings

**FINDING-017** — Settings overlay uses HTML/CSS while the rest of the game uses Canvas (high, Consistency)
- Location: Lines 3064-3102 (HTML overlay) vs entire game (Canvas)
- The settings screen is an HTML `<div>` overlay with CSS styling. Every other screen is rendered on Canvas.
- This creates a jarring visual discontinuity: the settings overlay looks like a web form overlaid on a game, not like part of the game.
- The settings form uses `sans-serif` font, white backgrounds, and CSS border-radius — none of which match any of the 4 game themes.
- **Fix:** Either (a) render settings on Canvas to match the active theme, or (b) theme the HTML overlay to match (dark bg for cyberpunk, green-tinted for ASCII, etc.).

**FINDING-018** — Settings overlay background is a flat light blue `#E1F5FE` (medium, Spacing)
- Location: Line 3059: `ctx.fillStyle = '#E1F5FE'`
- `drawSettingsBg()` fills the canvas with a light blue that only matches the classic theme's sky.
- When using cyberpunk/ASCII/pixel themes, the canvas bg behind the HTML overlay is completely wrong.
- **Fix:** Use a theme-appropriate background, or at least use a neutral dark color.

### Page 6: Leaderboard

#### Findings

**FINDING-019** — Leaderboard entries have no maximum width protection for usernames (medium, Content)
- Location: Lines 2657-2658
- `const maxNameW = W * 0.4` is computed but never used. Username text is drawn without truncation.
- Long usernames will overflow into the score column.
- **Fix:** Use `ctx.measureText()` to truncate with ellipsis, or clip the text region.

**FINDING-020** — Loading state shows only "Loading..." text with no skeleton or animation (polish, Interaction)
- Location: Line 2629
- A bare "Loading..." text provides no visual indication that something is happening.
- **Fix:** Add a simple animated loading indicator (three bouncing dots, a spinning line, etc.).

---

## Phase 4: Interaction Flow Review

### Flow 1: First Launch → Play → Game Over → Retry

| Step | Description | Goodwill | Notes |
|------|-------------|----------|-------|
| 1 | Menu loads | 70 | Clean, clear hierarchy. Bouncy title adds life. |
| 2 | Tap PLAY | 72 | Immediate response. +2 for zero friction. |
| 3 | First block swings | 70 | "TAP TO DROP" hint appears. Gentle tutorial swing. |
| 4 | Tap to drop | 73 | Satisfying. Block retains momentum. Camera follows smoothly. |
| 5 | Block lands | 75 | Particles, score float, subtle shake. Good feedback. |
| 6 | Perfect placement | 78 | Gold shimmer on block, "PERFECT!" text, haptic feedback (Telegram). Delightful. |
| 7 | Miss a block | 68 | Block tumbles off with physics. "MISS! 2 ❤️ left" text. -10 for anxiety but clear feedback. |
| 8 | Game over | 65 | Card slides up. Shows stats. "❌ no TG" debug text visible. -3 for noise. |
| 9 | Tap RETRY | 68 | Quick restart. |


**Final goodwill: 68/100 — healthy.** The core loop is satisfying. The biggest drain is the debug-status leak and lack of button press feedback.

### Flow 2: Menu → Settings → Change Theme → Apply

| Step | Description | Goodwill | Notes |
|------|-------------|----------|-------|
| 1 | Tap SETTINGS | 68 | Button gives no press feedback. |
| 2 | Settings overlay appears | 60 | Jarring switch from Canvas to HTML form. Looks like a different app. -8 for visual discontinuity. |
| 3 | Change theme | 62 | Theme buttons work. Active state indicated. |
| 4 | Tap "Apply & Restart" | 64 | Game starts immediately. No confirmation needed. |


**Final goodwill: 64/100 — acceptable but the settings UX needs work.**

---

## Phase 5: Cross-Page Consistency

### Consistency Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **Font inconsistency** | medium | HUD lives use `sans-serif`, everything else uses `th.fontFamily`. Settings overlay uses system fonts. |
| **Rendering model split** | high | Game screens rendered on Canvas. Settings is an HTML overlay. Visual language breaks completely. |
| **Button styling inconsistent** | medium | Canvas buttons use `roundRect()` with themed fills. HTML settings buttons use CSS with hardcoded blue/red. No visual connection. |
| **Background continuity** | low | Game over renders the game scene behind the card overlay — nice. But City View and Leaderboard use different dark backgrounds, not the game's zone system. |

### Consistency Wins

- Block sprite system is well-designed: `getBlockSprite()` caches offscreen canvases per theme/color/size. Clean and efficient.
- Theme object pattern (`THEMES`) is consistent: each theme defines all needed colors and flags.
- Score/float text system works uniformly across themes with shadow/glow adaptations.

---

## Phase 7: Triage

### High Impact (fix first)

| ID | Finding | Fix Effort |
|----|---------|------------|
| FINDING-005 | No button press feedback | Medium — add pressed state tracking |
| FINDING-012 | API debug status visible to non-TG users | Small — wrap in `if (API.isTelegram())` |
| FINDING-017 | Settings overlay visual discontinuity | Large — re-theme overlay or port to Canvas |

### Medium Impact

| ID | Finding | Fix Effort |
|----|---------|------------|
| FINDING-001 | Emoji as button labels | Small — replace with plain text or drawn icons |
| FINDING-003 | Menu buttons hardcoded percentages | Medium — calculate layout dynamically |
| FINDING-006 | No cursor change on desktop hover | Small — add mouse tracking |
| FINDING-007 | Lives emoji uses wrong font | Small — change to `th.fontFamily` |
| FINDING-009 | Combo text grows unbounded | Small — add `Math.min()` cap |
| FINDING-011 | No reduced-motion support | Medium — add media query check |
| FINDING-018 | Settings bg wrong for non-classic themes | Small — use theme-aware color |
| FINDING-019 | Username overflow in leaderboard | Small — add text truncation |

### Polish

| ID | Finding | Fix Effort |
|----|---------|------------|
| FINDING-002 | Inconsistent emoji spacing in buttons | Trivial — normalize spacing |
| FINDING-004 | Ground takes 18% on menu | Small — reduce to 12% or make dynamic |
| FINDING-008 | Hint position may overlap block | Small — position relative to tower area |
| FINDING-010 | Float text uses world-space Y | Design choice — document or adjust |
| FINDING-013 | Game over card very tall on large screens | Small — cap cardH to viewport |
| FINDING-014 | Slide-up animation has no easing | Trivial — add ease-out curve |
| FINDING-020 | Loading state has no animation | Small — add animated dots |

---

## Quick Wins (< 30 minutes each)

1. **Hide API debug text for non-Telegram users** — Wrap the TG status line in `if (API.isTelegram())`. Two-line change in `drawGameOver()`. Immediate quality improvement for the majority of players.

2. **Cap combo font growth** — Change `su * 0.7 + combo` to `su * 0.7 + Math.min(combo, 12)`. One-line change. Prevents HUD overflow.

3. **Add ease-out to game over slide** — Replace `const slideUp = Math.min(1, gameOverTimer * 3)` with an ease-out curve. Three-line change. Makes the card entrance feel professional.

4. **Theme the settings background** — Replace hardcoded `#E1F5FE` with a color from the active theme. One-line change.

5. **Normalize button label spacing** — Ensure all emoji-prefixed button labels use the same spacing pattern. Five minutes of find-and-replace.

---

## AI Slop Blacklist Check

| Pattern | Present? | Notes |
|---------|----------|-------|
| Purple/violet gradient | NO | Clean |
| 3-column feature grid | NO | Clean |
| Icons in colored circles | NO | Clean |
| Centered everything | PARTIAL | Menu is centered, but game HUD uses left/right alignment — appropriate for a game |
| Uniform bubbly border-radius | NO | Each theme uses its own radius logic |
| Decorative blobs / SVG waves | NO | Clean |
| Emoji as design elements | YES | Menu buttons use emoji as icons (▶, 🏆, 🏙, ⚙). Mild case. |
| Colored left-border cards | NO | Clean |
| Generic hero copy | NO | Title is "TOWER STACK" — direct, not generic |
| Cookie-cutter section rhythm | NO | Game screens have distinct layouts |
| system-ui as primary font | NO | `Fredoka One` for classic, `Courier New` for others |

**AI Slop Score: A-** — The only mark is emoji in button labels, which is borderline for a casual game. The themed sprite systems (circuit traces, box-drawing, pixel rivets) demonstrate genuine design craft.

---

## Source Code Design Observations

These observations come from reading the source code directly. A live-site audit with screenshots would catch additional issues.

### What works well

1. **Sprite cache system** (`getBlockSprite` + `SPRITE_CACHE`) — Offscreen canvas rendering with cache keys is the right approach for a Canvas game. Prevents re-drawing complex gradients every frame.

2. **Theme architecture** — The `THEMES` object with `blockStyle`/`bgStyle` flags, and the switch dispatch in drawing functions, is clean and extensible. Adding a new theme would require zero structural changes.

3. **Block sprite quality** — The 4 block styles are not tint swaps. Each is a complete visual system:
   - Classic: 5-stop gradient + bevels + corner shine + inner stroke
   - Cyberpunk: Scanlines + circuit traces + node circles + corner brackets + neon glow
   - ASCII: Box-drawing border chars + interior fill chars + phosphor glow
   - Pixel: NES-style highlights/shadows + dither pattern + rivets with highlights

4. **Wobble rendering alignment** — The falling block and tower both apply the same wobble transform from the same pivot point. Visual = physics = collision. This is a correctness issue that also matters for design: the player can trust what they see.

5. **Background zone system** — 8 zones with smooth gradient transitions and zone-appropriate decorative elements (trees → clouds → planes → stars → UFOs). The world-space positioning of background objects with camera scroll is well-implemented.

### What needs attention

1. **The entire file is 3105 lines of HTML/CSS/JS in a single `<script>` tag.** This is by design (C-03: Zero Dependencies, C-01: single file). The architecture is appropriate for the constraint. But the settings overlay breaks the "everything on Canvas" rule, creating a maintainability and consistency problem.

2. **No CSS variables or design tokens** — Colors, spacing, and sizing are scattered as magic values throughout the code. The `CFG` object and `THEMES` objects partially address this, but drawing functions still have hardcoded values (e.g., `groundScreenY`, button positions, gradient stop positions).

3. **The `su` scale unit** is a good responsive approach (`Math.max(14, W * 0.065)`), but it's recomputed in every draw function instead of being stored globally and updated on resize.

---

## Classifier: APP UI Rules Applied

Since this is an APP UI (game interface with data-dense HUD), the applicable rules are:

| Rule | Status |
|------|--------|
| Calm surface hierarchy, strong typography, few colors | MOSTLY — HUD is calm, colors are themed, typography is strong in classic/cyberpunk |
| Dense but readable, minimal chrome | YES — HUD uses 4 corners efficiently |
| Organize: primary workspace, navigation, secondary context, one accent | YES — game area is primary, HUD is secondary |
| Avoid: dashboard-card mosaics, thick borders, decorative gradients | YES — none present |
| Cards only when card IS the interaction | YES — game over "card" is interactive (buttons) |
| Section headings state what area is or what user can do | YES — HUD labels ("floors", combo multiplier) are functional |

### Litmus Checks

| Check | Result |
|-------|--------|
| Brand/product unmistakable in first screen? | YES — "TOWER STACK" + block-stacking visual |
| One strong visual anchor present? | YES — swinging block on cable |
| Page understandable by scanning headlines only? | N/A — game, not document |
| Each section has one job? | YES |
| Are cards actually necessary? | YES — game over card groups related actions |
| Does motion improve hierarchy or atmosphere? | YES — wobble, particles, shake all serve gameplay feedback |
| Would design feel premium with all decorative shadows removed? | MOSTLY — cyberpunk glow shadows are functional, not decorative |

---

## Hard Rejection Check

| Criterion | Flagged? |
|-----------|----------|
| Generic SaaS card grid as first impression | NO |
| Beautiful image with weak brand | NO |
| Strong headline with no clear action | NO |
| Busy imagery behind text | NO |
| Sections repeating same mood statement | NO |
| Carousel with no narrative purpose | NO |
| App UI made of stacked cards instead of layout | NO |

**No hard rejections.**

---

## Summary

| Metric | Value |
|--------|-------|
| Total findings | 20 |
| High impact | 3 |
| Medium impact | 8 |
| Polish | 9 |
| Quick wins available | 5 |
| Estimated fix time (all quick wins) | ~2 hours |
| Estimated fix time (all high + medium) | ~8 hours |

**Bottom line:** This is a well-crafted casual game with genuine design personality. The themed sprite systems are the standout — each theme is a complete visual world, not a tint swap. The main design debt is the settings overlay (HTML vs Canvas split), button interaction feedback, and a few debug artifacts leaking into the player experience. The AI slop score is excellent — this doesn't look like AI-generated design.

---

*Review generated by gstack design-review skill v2.0.0*
*Source code audit — no live screenshots (spawned session, headless unavailable)*
