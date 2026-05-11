# Tower Stack — Data Model

> **Spec ID:** 001-tower-stack
> **Source:** ENGINEERING.md §2.3, §9
> **Updated:** 2026-05-11

---

## Entity Definitions

### Block

Represents a single placed block in the tower.

```
Block {
  x: number          // Left edge in world coordinates (pixels)
  y: number          // Top edge in world coordinates (pixels)
  width: number      // Block width (90px constant, no shrinking)
  height: number     // Block height (90px constant)
  color: string      // Hex color from palette
  perfect: boolean   // True if placed within ±3px of center
  isBase: boolean    // True for the ground-level base block
  offset: number     // Center offset from perfect position (px), used for wobble
}
```

**Invariants:**
- `width === height === 90` (constant, never changes)
- `x ≥ 0`, positioned via overlap calculation on landing
- Color cycles through palette: `#FF6B6B`, `#FFD93D`, `#6BCB77`, `#4D96FF`, `#C084FC`, `#FFA07A`

---

### FallingBlock

Block in free fall after release from cable. Extends block with physics state.

```
FallingBlock {
  x: number           // Left edge in world coords (calculated from rotated hook)
  y: number           // Top edge in world coords (calculated from rotated hook)
  width: number       // 90px
  height: number      // 90px
  color: string       // Next palette color
  vx: number          // Horizontal velocity from swing inertia (px/s)
  vy: number          // Vertical velocity (starts at 0, gravity applied each frame)
  rotation: number    // Current tilt angle (radians). Initial value = -swingAngle
  angularVel: number  // Angular velocity (rad/s). Initial = small inherited spin
}
```

**Initialization at drop (from `getSwingState`):**
```
hookX = pivotX + sin(angle) × cableLength
hookY = pivotY + cos(angle) × cableLength

// Block center from rotated geometry (matches drawCrane rendering)
blockCenterX = hookX + (BS/2) × sin(angle)
blockCenterY = hookY + (BS/2) × cos(angle)

x = blockCenterX - BS/2
y = blockCenterY - BS/2
vx = angularVel × cableLength   // horizontal swing velocity
rotation = -angle                // inherited tilt
angularVel = -vx / cableLength × 0.3  // inherited spin (small)
```

**Physics each frame:**
```
vy += gravity × dt                    // gravity: 2000 px/s²
x += vx × dt                         // horizontal inertia (no air resistance)
y += vy × dt

// Rotation spring-damper
restoringTorque = -rotation × fallRestoringSpring    // default: 12
angularDamping  = -angularVel × fallAngularDamping   // default: 4
angularVel += (restoringTorque + angularDamping) × dt
rotation += angularVel × dt
```

**Rendering:** In world space only (no wobble transform). Rotated around its center:
```
ctx.translate(x + BS/2, y + BS/2 - camera.y)
ctx.rotate(rotation)
ctx.fillRect(-BS/2, -BS/2, BS, BS)
```

---

### Tower

Runtime structure: ordered array of placed blocks, bottom to top.

```
Tower = Block[]
```

**Properties (computed):**
- `height = tower.length` — number of placed blocks
- `topBlock = tower[tower.length - 1]` — highest placed block
- `avgOffset` — cumulative average offset of all blocks from perfect center (used for wobble)

**Wobble state (global, not per-block):**
```
Wobble {
  angle: number       // Current wobble angle (radians)
  angularVel: number  // Angular velocity for spring simulation
  targetAngle: number // Set on block land, constant until next land
}
```

**Wobble pivot:** `{ x: baseBlock.x + BS/2, y: baseBlock.y + BS }` — center-bottom of the base block. The entire tower rotates as a rigid body around this point.

**Wobble physics each frame:**
```
// Spring toward targetAngle
springForce = (targetAngle - angle) × wobbleSpringK   // default: 5
dampingForce = -angularVel × wobbleDamping             // default: 1.5
angularVel += (springForce + dampingForce) × dt
angle += angularVel × dt
```

**Wobble target calculation on block land:**
```
avgOffset = sum(block.offset for block in tower) / tower.length
heightScale = 1 + tower.length × wobbleHeightFactor    // default: 0.02
targetAngle = (avgOffset / blockSize) × heightScale × 0.3
```

**Rendering:** All tower blocks drawn inside a wobble transform:
```
ctx.translate(pivotX + shake.x, pivotY - camera.y + shake.y)
ctx.rotate(wobble.angle)
ctx.translate(-pivotX, -(pivotY - camera.y))
// Draw each block at its world (x, y - camera.y) position
```

---

### TowerRecord

Persisted summary of a completed tower. Stored in localStorage.

```
TowerRecord {
  height: number      // Number of blocks placed
  score: number       // Final score
  date: string        // ISO 8601 date string (e.g., "2026-05-11")
}
```

**Constraints:**
- Max 50 records kept (FIFO — oldest removed when exceeded)

---

### GameState

State machine controlling game flow.

```
GameState = enum {
  MENU,        // Title screen with PLAY/MY CITY/SETTINGS
  PLAYING,     // Crane swinging, awaiting tap
  DROPPING,    // Block released, falling under gravity + rotation
  GAME_OVER,   // Stats overlay, RETRY/CITY buttons
  CITY_VIEW,   // Horizontal skyline of saved towers
  SETTINGS     // Physics parameters overlay
}
```

**Transitions:**

| From | To | Trigger |
|------|----|---------|
| MENU | PLAYING | Tap/click/space |
| PLAYING | DROPPING | Tap/click/space (releases block) |
| DROPPING | PLAYING | Block lands (≥30% overlap) |
| DROPPING | DROPPING→PLAYING | Block misses but lives > 0 (debris created) |
| DROPPING | GAME_OVER | Block misses (<30% overlap, lives = 0) |
| GAME_OVER | PLAYING | Tap RETRY |
| GAME_OVER | CITY_VIEW | Tap CITY |
| CITY_VIEW | MENU | Tap BACK |
| MENU | SETTINGS | Tap SETTINGS |
| SETTINGS | PLAYING | Apply & Restart |
| SETTINGS | MENU | Cancel |

---

### Crane

Pendulum system that swings the next block.

```
Crane {
  pivotX: number      // Pivot X position (always W/2)
  pivotY: number      // Pivot Y position (world coords, moves with tower height)
  time: number        // Accumulated time for sin-based swing
  cableLength: number // Fixed at 360px (4 × blockSize)
  stretch: number     // Current cable elastic stretch (px)
  stretchVel: number  // Stretch velocity for spring-damper
}
```

**Swing formula (computed in `getSwingState`):**
```
speed = π rad/s (constant)
maxAngle = smoothstepInterpolation(floors) × swingAngleMax
angle = maxAngle × sin(time × speed)
angularVel = maxAngle × speed × cos(time × speed)

cl = cableLength + stretch
hookX = pivotX + sin(angle) × cl
hookY = pivotY + cos(angle) × cl

vx = angularVel × cl    // horizontal velocity at hook
```

**Block rendering on crane (`drawCrane`):**
```
// Block tilts with cable, rotates around hook (top-center attachment)
ctx.translate(hookX, hookY - camera.y)
ctx.rotate(-angle)
ctx.fillRect(-BS/2, 0, BS, BS)    // block hangs below hook
```

**Amplitude table (maxAngle by floor, default max 20°):**

| Floors | Angle |
|--------|-------|
| 0–2 | ~1° (tutorial) |
| 5 | ~2° |
| 10 | ~3° |
| 20 | ~6° |
| 30 | ~9° |
| 50 | ~14° |
| 80+ | ~20° |

**Cable stretch physics:**
```
maxStretch = cableLength × cableStretchFactor   // default: 0.04 (4%)
stretchTarget = maxStretch × sin²(time × speed) // peaks at extremes

springForce = (stretchTarget - stretch) × cableStiffness       // default: 6
dampingForce = -stretchVel × cableStretchDamping × cableStiffness  // default: 12
stretchVel += (springForce + dampingForce) × dt
stretch += stretchVel × dt
```

---

### Camera

Smooth-scrolling viewport tracker.

```
Camera {
  y: number         // Current scroll position (world coords)
  targetY: number   // Target position (lerp destination)
}
```

**Behavior:**
- `y += (targetY - y) × cameraLerp × dt` (cameraLerp = 4.0)
- Camera never moves down

---

### Debris

When a block misses, it becomes debris with rotation.

```
Debris {
  x: number      // World X position
  y: number      // World Y position
  width: number   // Block size (90px)
  height: number  // Block size (90px)
  color: string
  vx: number      // Horizontal velocity (falls sideways)
  vy: number      // Vertical velocity (gravity + initial upward)
  rot: number     // Current rotation (inherited from FallingBlock.rotation)
  vr: number      // Rotation speed (rad/s)
}
```

**Initialization:** `rot` inherits from `fallingBlock.rotation` at moment of miss.

**Lifecycle:** Created on miss, removed when falls below viewport.

---

### Particle

Short-lived visual effect (sparkles on perfect placement).

```
Particle {
  x, y: number
  vx, vy: number    // Random burst velocity
  life: number       // Remaining time (0.4–0.8s)
  maxLife: number
  size: number       // 3–8px
  color: string
}
```

---

### FloatText

Score/perfect text floating upward.

```
FloatText {
  text: string
  x, y: number      // World position
  vy: number         // Upward velocity (-40 to -70 px/s)
  life: number       // Remaining time (0.8–1.2s)
  maxLife: number
  color: string
  size: number       // Font size (16–24px)
}
```

---

## Entity Relationships

```
Game (singleton)
 ├── state: GameState
 ├── score: number
 ├── combo: number
 ├── bestCombo: number
 ├── lives: number (starts at 3)
 ├── crane: Crane
 │     └── stretch, stretchVel, time
 ├── tower: Block[]
 ├── wobble: Wobble { angle, angularVel, targetAngle }
 ├── fallingBlock: FallingBlock | null (during DROPPING)
 ├── debris: Debris[]
 ├── particles: Particle[]
 ├── floatTexts: FloatText[]
 ├── camera: Camera
 ├── shake: ScreenShake
 └── buttons: Button[]
```

---

## Storage Schema (localStorage)

Single key: `towerStack_v2` containing:

```json
{
  "highScore": 4200,
  "totalTowers": 15,
  "highestTower": 42,
  "towers": [
    { "height": 23, "score": 3100, "date": "2026-05-11" }
  ]
}
```

- Max 50 towers in history

---

*Source: ENGINEERING.md, index.html*
*Updated: 2026-05-11 — Added FallingBlock with rotation, fixed drop position geometry, wobble separate from tower array*
