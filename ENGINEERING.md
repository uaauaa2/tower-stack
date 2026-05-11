# Tower Stack — Engineering Document

A Tower Bloxx-style web game: crane swings blocks, you tap to drop, stack them as high as you can.

---

## 1. Overview

Single-file HTML5 Canvas game. Vanilla JS, zero dependencies. Mobile-first, Telegram Mini App ready.

**Core loop:** Swing → Drop → Stack → Repeat. Miss = game over. Perfect drops = combos.

---

## 2. Architecture

### 2.1 File Structure

```
index.html          ← Everything (HTML + CSS + JS)
```

No build step. No bundler. Ship one file.

### 2.2 Module Layout (within `<script>`)

```
┌─────────────────────────────────────────────┐
│                 index.html                    │
│                                               │
│  ┌───────────┐  ┌──────────┐  ┌───────────┐ │
│  │  Config    │  │  Utils   │  │  Storage  │ │
│  │  (const)   │  │  (math)  │  │ (save/ld) │ │
│  └───────────┘  └──────────┘  └───────────┘ │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │              GameState                   │ │
│  │  state, score, combo, tower[], camera    │ │
│  └─────────────────────────────────────────┘ │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │  Crane    │  │  Block   │  │  Camera    │ │
│  │  (swing)  │  │  (phys)  │  │  (scroll)  │ │
│  └──────────┘  └──────────┘  └────────────┘ │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │  Input    │  │  Render  │  │  CityView  │ │
│  │  (events) │  │  (draw)  │  │  (skyline) │ │
│  └──────────┘  └──────────┘  └────────────┘ │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │             GameLoop                     │ │
│  │  init() → tick(dt) → update(dt) + draw() │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 2.3 Object Diagram

```
Game (singleton)
 ├── state: enum          // MENU | PLAYING | DROPPING | GAME_OVER | CITY_VIEW
 ├── score: number
 ├── combo: number
 ├── bestCombo: number
 ├── crane: Crane
 │     ├── x, y           // pivot point
 │     ├── angle: number   // current swing angle (radians)
 │     ├── speed: number   // swing angular velocity
 │     ├── length: number  // cable length
 │     └── block: Block | null
 ├── tower: Block[]        // placed blocks, bottom to top
 ├── fallingCut: {x, y, w, h, vx, vy} | null  // overhang debris
 ├── camera: { y: number, targetY: number }
 ├── city: TowerRecord[]   // saved tower heights from localStorage
 └── screenShake: { x, y, duration }

Block {
  x: number          // left edge (world coords)
  y: number          // top edge (world coords)
  width: number
  height: number
  color: string
  perfect: boolean   // was this a perfect placement?
}

TowerRecord {
  height: number      // number of blocks
  date: string        // ISO date
}
```

---

## 3. State Machine

```
                    ┌──────┐
                    │ MENU │
                    └──┬───┘
                       │ tap / click
                       ▼
                 ┌──────────┐    block released     ┌──────────┐
                 │ PLAYING  │ ─────────────────────► │ DROPPING │
                 │ (swinging)│                       │ (falling) │
                 └──────────┘                       └────┬─────┘
                    ▲                                    │
                    │ block landed (partial/perfect)     │
                    └────────────────────────────────────┤
                                                         │
                       block missed (game over)          │
                       ┌─────────────────────────────────┤
                       ▼                                 │
                 ┌───────────┐                           │
                 │ GAME_OVER │                           │
                 └─────┬─────┘                           │
                       │ tap                             │
                       ▼                                 │
                 ┌────────────┐    back / tap            │
                 │ CITY_VIEW  │ ────────────────────────►│
                 │ (skyline)  │                     (to MENU)
                 └────────────┘
```

**State transitions:**

| From | To | Trigger |
|------|----|---------|
| MENU | PLAYING | tap/click/space |
| PLAYING | DROPPING | tap/click/space (releases block) |
| DROPPING | PLAYING | block lands on tower (partial or perfect) |
| DROPPING | GAME_OVER | block completely misses tower |
| GAME_OVER | PLAYING | tap to retry |
| GAME_OVER | CITY_VIEW | tap "city" button |
| CITY_VIEW | MENU | tap back |

**Notes:**
- PLAYING and DROPPING could be sub-states of a broader "game active" state, but separating them simplifies the update loop — no need to check pendulum physics during a drop, and no need to check collision during a swing.
- GAME_OVER saves the tower to `city` via localStorage before showing the screen.

---

## 4. Data Flow

### 4.1 Happy Path (Block Lands)

```
User taps
    │
    ▼
Input handler fires
    │
    ▼
crane.block detached → becomes "falling block"
state = DROPPING
    │
    ▼
Each frame: apply gravity to falling block y
    │
    ▼
Collision check: falling.y + falling.height >= tower.top.y
    │
    ▼
Overlap check:
    fallingLeft  = falling.x
    fallingRight = falling.x + falling.width
    towerLeft    = tower.top.x
    towerRight   = tower.top.x + tower.top.width
    overlap = min(fallingRight, towerRight) - max(fallingLeft, towerLeft)
    │
    ▼
overlap > 0?
    YES → Place block:
           newBlock.x = max(fallingLeft, towerLeft)
           newBlock.width = overlap
           tower.push(newBlock)
           
           Perfect? (overlap == falling.width ± tolerance)
               combo++
               score += basePoints * combo
               screenShake (small)
           else:
               combo = 0
               score += basePoints
               Create fallingCut debris from overhang
           
           Spawn new block on crane
           camera.targetY += blockHeight
           state = PLAYING
```

### 4.2 Miss Path (Game Over)

```
...collision check...
    │
    ▼
overlap <= 0?
    YES → Block falls off screen
           Save tower height to localStorage
           state = GAME_OVER
```

### 4.3 Frame Loop

```
tick(timestamp)
    │
    ├── dt = (timestamp - lastTime) / 1000
    ├── lastTime = timestamp
    │
    ├── if state == PLAYING:
    │       updateCraneSwing(dt)
    │
    ├── if state == DROPPING:
    │       updateFallingBlock(dt)
    │       checkCollision()
    │
    ├── updateCamera(dt)      // smooth lerp toward targetY
    ├── updateDebris(dt)      // animate overhang falling
    ├── updateScreenShake(dt)
    │
    └── draw()
            clearCanvas()
            applyCameraTransform()
            drawBackground()
            drawTower()
            drawDebris()
            drawCrane()       // if PLAYING
            drawFallingBlock() // if DROPPING
            drawHUD()         // score, combo
            drawOverlay()     // menu/game-over/city-view
            restoreTransform()
```

---

## 5. Systems Detail

### 5.1 Crane & Pendulum

The crane sits at the top of the visible area. A cable hangs down, and the block swings at the end of it like a pendulum.

```
Pivot (crane.x, crane.y)
    │\
    │ \  cable (length L)
    │  \
    │   Block
    │
    ◄──────────► swing range
```

**Swing motion:**
```
angle = maxAngle * sin(time * swingSpeed)
blockX = pivotX + sin(angle) * cableLength
blockY = pivotY + cos(angle) * cableLength
```

- `maxAngle`: ~45° (π/4 radians), increases slightly with combo for difficulty
- `swingSpeed`: constant ~2.5 rad/s, or increases with height
- `cableLength`: fixed, ~150-200px
- The block is centered horizontally at `(blockX, blockY)`

**Difficulty progression:**
- Every 5 blocks: increase swing speed by 5%
- Every 10 blocks: increase max angle by 2°
- Every perfect placement in a combo: cable length decreases by 2px (block swings wider)

### 5.2 Block Physics (Drop)

When released, the block falls under gravity **with horizontal inertia, rotation, and spring-damper straightening**.

**Initialization at release:**
```
// From getSwingState():
hookX = pivotX + sin(angle) × cableLength
hookY = pivotY + cos(angle) × cableLength

// Block center calculated from rotated geometry (matches crane rendering)
blockCenterX = hookX + (BS/2) × sin(angle)
blockCenterY = hookY + (BS/2) × cos(angle)

x = blockCenterX - BS/2
y = blockCenterY - BS/2
vx = angularVel × cableLength
rotation = -angle              // inherited tilt from cable
angularVel = -vx / cl × 0.3   // small inherited spin
```

**Physics each frame:**
```
vy += gravity × dt             // gravity: 2000 px/s²
x += vx × dt                  // horizontal inertia preserved
y += vy × dt

// Rotation spring-damper (block straightens toward upright)
restoringTorque = -rotation × fallRestoringSpring     // 12
angularDamping  = -angularVel × fallAngularDamping   // 4
angularVel += (restoringTorque + angularDamping) × dt
rotation += angularVel × dt
```

- `gravity`: 2000 px/s² (feels snappy)
- `fallRestoringSpring`: 12 — torque pulling block upright
- `fallAngularDamping`: 4 — air resistance on rotation
- Block visually straightens from max tilt (~20°) to near-zero in ~0.3–0.5s
- No horizontal air resistance

### 5.3 Collision & Placement

The critical calculation. Each frame during DROPPING state. **All calculations are in world space** — the falling block is NOT rendered in wobble space, ensuring visual position = collision position.

```
towerTop = tower[tower.length - 1]

if (fallingBlock.y + BS >= towerTop.y):
    // Calculate horizontal overlap in world coords
    overlapLeft  = max(fallingBlock.x, towerTop.x)
    overlapRight = min(fallingBlock.x + BS, towerTop.x + BS)
    overlapWidth = overlapRight - overlapLeft
    
    if (overlapWidth <= 0):
        // Complete miss → debris with inherited rotation
    elif (overlapWidth / BS < missOverlapRatio):
        // < 30% overlap → miss
    else:
        // Place block at actual landing position (NO cutting)
        placedBlock = {
            x: fallingBlock.x,        // full block, where it fell
            y: towerTop.y - BS,
            width: BS,                 // no shrinking
            height: BS,
            color: nextColor(),
            perfect: false,
            offset: centerOffset       // for wobble calculation
        }
        
        // Perfect check (centered ±3px)
        centerOffset = abs((fallingBlock.x + BS/2) - (towerTop.x + BS/2))
        if (centerOffset <= perfectTolerance):
            placedBlock.x = towerTop.x    // snap to perfect
            placedBlock.perfect = true
            placedBlock.offset = 0
        
        tower.push(placedBlock)
        
        // Update wobble target based on cumulative inaccuracy
        avgOffset = sum(block.offset) / tower.length
        heightScale = 1 + tower.length × wobbleHeightFactor
        wobble.targetAngle = (avgOffset / BS) × heightScale × 0.3
```

**Constants:**
- `blockHeight`: 30px (initial)
- `initialBlockWidth`: 120px
- `PERFECT_TOLERANCE`: 5px — if overlap is within 5px of full width, it's "perfect"
- Minimum block width before guaranteed game over: 10px (visual mercy)

### 5.4 Combo System

```
if (perfect placement):
    combo++
    score += 100 * combo        // 100, 200, 300, 400...
    flash effect
    particles (optional)
else:
    combo = 0
    score += 100                // flat 100 for non-perfect
```

Combo is displayed prominently. At combo ≥ 3, show "PERFECT x3!" etc.

### 5.5 Camera System

```
// Camera tracks the top of the tower
camera.targetY = max(0, towerTop.y - canvas.height * 0.6)

// Smooth follow (lerp)
camera.y += (camera.targetY - camera.y) * lerpSpeed * dt

// lerpSpeed: ~5.0 (responsive but smooth)
```

The camera never moves down — `camera.y = max(camera.y, newCameraY)`. This creates the feeling of always building upward.

The crane pivot is always drawn at `canvas.height * 0.15` relative to the camera, so it stays near the top of the viewport.

### 5.6 Screen Shake

```
shake = { x: 0, y: 0, timer: 0 }

triggerShake(intensity, duration):
    shake.timer = duration
    shake.intensity = intensity

updateShake(dt):
    if (shake.timer > 0):
        shake.timer -= dt
        shake.x = (Math.random() - 0.5) * 2 * shake.intensity * (shake.timer / duration)
        shake.y = (Math.random() - 0.5) * 2 * shake.intensity * (shake.timer / duration)

// Apply shake to canvas context translate before drawing
```

Small shake on perfect placement (intensity: 3px, 200ms). Bigger shake on game over (intensity: 8px, 400ms).

### 5.7 City Meta-Game (Skyline View)

After game over, the player can view their "city" — a skyline of all their previous towers.

**Storage schema (localStorage):**
```json
{
  "towerStack_city": [
    { "height": 23, "date": "2026-05-09", "width": 80 },
    { "height": 15, "date": "2026-05-08", "width": 95 },
    { "height": 42, "date": "2026-05-07", "width": 60 }
  ],
  "towerStack_bestScore": 4200,
  "towerStack_bestHeight": 42
}
```

**City rendering:**
- Sort towers by height (shortest to tallest, left to right)
- Each tower is a colored rectangle, width proportional to original final block width
- Windows drawn as small squares in a grid pattern on each building
- Skyline scrolls horizontally if many towers
- Stars in the sky background, moon optional

---

## 6. Rendering

### 6.1 Canvas Setup

```javascript
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.min(window.innerWidth, 480);   // cap width for desktop
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    // Store logical size
    canvas.logicalWidth = w;
    canvas.logicalHeight = h;
}

window.addEventListener('resize', resize);
resize();
```

### 6.2 Drawing Layers (back to front)

1. **Sky gradient** — static or subtle animation
2. **Ground** — bottom of world, green/brown
3. **Tower blocks** — each block with slight shadow
4. **Debris** — falling overhang pieces
5. **Crane structure** — beam at top + cable + swinging block
6. **HUD** — score (top center), combo counter
7. **Overlays** — menu screen, game over, city view (semi-transparent backdrop)

### 6.3 Visual Style

- Flat colors, no gradients on blocks (keeps it fast and clean)
- Block colors: cycle through a pleasant palette
  ```
  const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
  ```
- Each tower block gets `COLORS[index % COLORS.length]`
- Crane: dark gray (#333), cable: thin line (#666)
- Background: gradient sky (#87CEEB → #E0F7FA)
- Ground: #8B7355

### 6.4 Block Drawing Detail

```
┌──────────────────────┐
│  colored rectangle    │  ← main color
│  with 2px darker     │
│  border-bottom and    │  ← gives depth
│  border-right         │
└──────────────────────┘
```

Each block:
```javascript
function drawBlock(block) {
    ctx.fillStyle = block.color;
    ctx.fillRect(block.x, block.y, block.width, block.height);
    // Subtle 3D effect
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(block.x, block.y + block.height - 3, block.width, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(block.x, block.y, block.width, 2);
}
```

---

## 7. Input Handling

### 7.1 Unified Input

All three input methods (touch, mouse, keyboard) funnel into one handler:

```javascript
let inputLocked = false;

function handleAction() {
    if (inputLocked) return;
    inputLocked = true;
    setTimeout(() => inputLocked = false, 100); // debounce
    
    switch (state) {
        case 'MENU': startGame(); break;
        case 'PLAYING': dropBlock(); break;
        case 'GAME_OVER': handleGameOverTap(); break;
        case 'CITY_VIEW': /* back button handled separately */ break;
    }
}
```

### 7.2 Event Binding

```javascript
// Touch
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleAction();
}, { passive: false });

// Mouse
canvas.addEventListener('mousedown', handleAction);

// Keyboard
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        handleAction();
    }
});
```

### 7.3 Telegram Mini App Considerations

```javascript
// Detect Telegram environment
const isTelegram = window.Telegram && window.Telegram.WebApp;

if (isTelegram) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();  // use full viewport
    // Disable vertical swipe to close during gameplay
    // Telegram.WebApp.setHeaderColor('#87CEEB');
}

// Prevent default touch behaviors (scroll, zoom) on the canvas
canvas.style.touchAction = 'none';
document.body.style.overflow = 'hidden';
document.body.style.margin = '0';
document.body.style.padding = '0';
```

---

## 8. Performance

### 8.1 Target: 60 FPS

- `requestAnimationFrame` with delta time
- Delta time capped at 1/30s to prevent physics explosions after tab switches:
  ```javascript
  dt = Math.min(dt, 1/30);
  ```

### 8.2 Optimization Notes

- **No object pooling needed.** Max ~100 blocks on screen. GC pressure is negligible.
- **No off-screen canvas needed.** Scene is simple enough for direct draw calls.
- **Minimize state in draw loop.** Pre-compute camera transform, apply once via `ctx.save()/translate()/restore()`.
- **Debris objects** are removed once they fall below the viewport.
- **localStorage writes** only on game over, not every frame.

### 8.3 Memory Budget

- Tower array: ~100 blocks × 5 properties × 8 bytes ≈ 4 KB
- City data: ~50 towers × 3 properties × 8 bytes ≈ 1.2 KB
- Canvas: 480×800×4 bytes ≈ 1.5 MB (double-buffered by browser)
- Total: under 5 MB. No concerns.

---

## 9. Persistent Storage

### 9.1 Schema

```javascript
const STORAGE_KEYS = {
    CITY: 'towerStack_city',
    BEST_SCORE: 'towerStack_bestScore',
    BEST_HEIGHT: 'towerStack_bestHeight',
    SETTINGS: 'towerStack_settings'
};
```

### 9.2 Operations

```javascript
function saveCity(towerRecord) {
    const city = loadCity();
    city.push(towerRecord);
    // Keep last 50 towers
    if (city.length > 50) city.shift();
    localStorage.setItem(STORAGE_KEYS.CITY, JSON.stringify(city));
}

function loadCity() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.CITY)) || [];
    } catch {
        return [];
    }
}

function saveBestScore(score) {
    const best = getBestScore();
    if (score > best) {
        localStorage.setItem(STORAGE_KEYS.BEST_SCORE, score.toString());
    }
}
```

---

## 10. Game Loop Pseudocode

```javascript
let lastTime = 0;

function init() {
    resize();
    loadBestScore();
    state = 'MENU';
    requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 1/30);
    lastTime = timestamp;
    
    update(dt);
    draw();
    
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    updateScreenShake(dt);
    
    switch (state) {
        case 'PLAYING':
            updateCraneSwing(dt);
            break;
        case 'DROPPING':
            updateFallingBlock(dt);
            checkCollision();
            break;
    }
    
    updateCamera(dt);
    updateDebris(dt);
}

function draw() {
    ctx.save();
    
    // Clear
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    
    // Background (screen-space)
    drawSky();
    
    // Apply camera + shake
    ctx.translate(shake.x, shake.y - camera.y);
    
    // World-space drawing
    drawGround();
    drawTower();
    drawDebris();
    
    if (state === 'PLAYING') drawCrane();
    if (state === 'DROPPING') drawFallingBlock();
    
    ctx.restore();
    
    // HUD (screen-space)
    drawHUD();
    drawOverlay();
}
```

---

## 11. Test Matrix

### 11.1 Game Mechanics

| # | Test Case | Input | Expected Outcome |
|---|-----------|-------|------------------|
| T1 | Perfect placement | Drop when block exactly aligned | Block lands full-width, combo++, "PERFECT!" flash |
| T2 | Partial overlap (left) | Block overhangs left of tower | Right portion placed, left overhang falls as debris |
| T3 | Partial overlap (right) | Block overhangs right of tower | Left portion placed, right overhang falls as debris |
| T4 | Complete miss (left) | Block entirely left of tower | Game over triggered |
| T5 | Complete miss (right) | Block entirely right of tower | Game over triggered |
| T6 | Narrow block placement | Block width = 15px, partial hit | 8px block placed (survives), rest is debris |
| T7 | Minimum width block | Block width ≤ 10px | Still placeable, but nearly impossible |
| T8 | Combo x1 | First perfect placement | Score += 100, combo = 1 |
| T9 | Combo x5 | 5th consecutive perfect | Score += 500, "PERFECT x5!" display |
| T10 | Combo break | Perfect → imperfect → perfect | combo resets to 0, then 1 |
| T11 | First block | Game start, first drop | Lands on base platform (full width) |
| T12 | Very tall tower | 50+ blocks stacked | Camera scrolls smoothly, crane stays visible |
| T13 | Screen shake | Perfect placement | Canvas shakes briefly (3px, 200ms) |

### 11.2 Input

| # | Test Case | Input | Expected Outcome |
|---|-----------|-------|------------------|
| T14 | Touch tap | finger on canvas | Drops block |
| T15 | Mouse click | left click on canvas | Drops block |
| T16 | Space bar | space key | Drops block |
| T17 | Enter key | enter key | Drops block |
| T18 | Rapid tapping | tap 3 times in 200ms | Only first tap registers (debounce) |
| T19 | Resize mid-game | rotate phone | Canvas resizes, game state preserved |
| T20 | Background tab | switch away, return | Delta time capped, no physics explosion |

### 11.3 Camera

| # | Test Case | Setup | Expected Outcome |
|---|-----------|-------|------------------|
| T21 | Camera follow | Place 10 blocks | Camera.y follows tower top smoothly |
| T22 | Camera never goes down | Stack high, game over, restart | Camera starts from ground again |
| T23 | Camera lerp speed | Block placed | Camera reaches target in ~0.3s |

### 11.4 State Transitions

| # | Test Case | Action | Expected Outcome |
|---|-----------|--------|------------------|
| T24 | Menu → Playing | Tap on menu | Game starts, crane swings |
| T25 | Playing → Dropping | Tap during swing | Block releases, falls |
| T26 | Dropping → Playing | Block lands | New block on crane, swinging |
| T27 | Dropping → Game Over | Block misses | Game over screen, score shown |
| T28 | Game Over → Playing | Tap "Retry" | New game starts |
| T29 | Game Over → City View | Tap "City" | Skyline shown |

### 11.5 Persistence

| # | Test Case | Action | Expected Outcome |
|---|-----------|--------|------------------|
| T30 | Save on game over | End game | Tower saved to localStorage |
| T31 | Load city | Open city view | Previous towers rendered as skyline |
| T32 | Best score persists | Close tab, reopen | Best score displayed on menu |
| T33 | Corrupt localStorage | Manually corrupt data | Falls back to empty, no crash |

### 11.6 Mobile / Telegram

| # | Test Case | Setup | Expected Outcome |
|---|-----------|-------|------------------|
| T34 | No scroll | Touch canvas on mobile | Page doesn't scroll |
| T35 | No zoom | Double-tap canvas | No zoom |
| T36 | Telegram expand | Open in Telegram | WebApp.expand() called |
| T37 | Safe area | iPhone notch | Content doesn't underlap notch |

---

## 12. Constants Reference

```javascript
const CONFIG = {
    // Block
    BLOCK_HEIGHT: 30,
    INITIAL_BLOCK_WIDTH: 120,
    MIN_BLOCK_WIDTH: 10,
    PERFECT_TOLERANCE: 5,
    
    // Crane
    CRANE_CABLE_LENGTH: 180,
    SWING_MAX_ANGLE: Math.PI / 4,    // 45°
    SWING_SPEED: 2.5,                 // rad/s
    CRANE_Y_OFFSET: 0.15,            // 15% from top of viewport
    
    // Physics
    GRAVITY: 2000,                    // px/s²
    
    // Camera
    CAMERA_LERP: 5.0,
    CAMERA_TOWER_OFFSET: 0.6,        // tower top at 60% from bottom
    
    // Scoring
    BASE_SCORE: 100,
    COMBO_MULTIPLIER: true,
    
    // Visual
    MAX_TOWER_HISTORY: 50,
    
    // Colors
    BLOCK_COLORS: ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8'],
    SKY_TOP: '#87CEEB',
    SKY_BOTTOM: '#E0F7FA',
    GROUND_COLOR: '#8B7355',
    CRANE_COLOR: '#333333',
    CABLE_COLOR: '#666666',
    
    // Screen shake
    SHAKE_PERFECT_INTENSITY: 3,
    SHAKE_PERFECT_DURATION: 0.2,
    SHAKE_GAMEOVER_INTENSITY: 8,
    SHAKE_GAMEOVER_DURATION: 0.4,
    
    // Delta time cap
    MAX_DT: 1/30,
    
    // Input debounce
    INPUT_DEBOUNCE_MS: 100,
    
    // Difficulty scaling
    SPEED_INCREASE_PER_5: 0.05,       // 5% per 5 blocks
    ANGLE_INCREASE_PER_10: Math.PI / 90, // 2° per 10 blocks
};
```

---

## 13. Potential Enhancements (Post-MVP)

- **Sound effects:** Web Audio API for drop, land, perfect, game over
- **Particles:** On perfect placement, small sparkle particles
- **Block rotation on miss:** Aesthetic only, the placed portion stays straight
- **Night mode:** Sky changes as you build higher
- **Leaderboard:** Telegram leaderboard via Bot API
- **Power-ups:** Wider block every N combos
- **Animated crane:** Crane beam structure that slides along the top
- **Cloud save:** Sync tower data across devices

---

## 14. Known Constraints

1. **Falling block in world space.** The falling block is NOT rendered in wobble space — it's independent of tower sway. This ensures collision accuracy but means the player sees the tower swaying independently from the falling block.
2. **No mid-air correction.** The only control is *when* to drop.
3. **Canvas only.** No DOM elements for game objects. HUD overlays are drawn on canvas too.
4. **Single file.** All code in one `index.html`. No splitting for now — the game is small enough.
5. **Block rotation is visual + physical.** The tilt affects how the block looks during fall, but collision uses axis-aligned bounding boxes (rotation doesn't affect overlap calculation).

---

*Document version: 1.0 | 2026-05-09*
