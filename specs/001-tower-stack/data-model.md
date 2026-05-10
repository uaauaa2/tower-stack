# Tower Stack — Data Model

> **Spec ID:** 001-tower-stack
> **Source:** ENGINEERING.md §2.3, §9

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
}
```

**Invariants:**
- `width === height === 90` (constant, never changes)
- `x ≥ 0`, positioned via overlap calculation on landing
- Color cycles through palette: `#FF6B6B`, `#FFD93D`, `#6BCB77`, `#4D96FF`, `#C084FC`, `#FFA07A`

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

**Wobble state (attached to tower):**
```
TowerWobble {
  targetAngle: number   // Set on block land, constant until next land
  currentAngle: number  // Current wobble angle (radians)
  velocity: number      // Angular velocity for spring simulation
}
```

---

### TowerRecord

Persisted summary of a completed tower. Stored in localStorage.

```
TowerRecord {
  height: number      // Number of blocks placed
  date: string        // ISO 8601 date string (e.g., "2026-05-09")
  width: number       // Final block width at game end (for city rendering)
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
  DROPPING,    // Block released, falling under gravity
  GAME_OVER,   // Stats overlay, RETRY/CITY buttons
  CITY_VIEW    // Horizontal skyline of saved towers
}
```

**Transitions:**

| From | To | Trigger |
|------|----|---------|
| MENU | PLAYING | Tap/click/space |
| PLAYING | DROPPING | Tap/click/space |
| DROPPING | PLAYING | Block lands (≥30% overlap) |
| DROPPING | GAME_OVER | Block misses (<30% overlap, lives = 0) |
| GAME_OVER | PLAYING | Tap RETRY |
| GAME_OVER | CITY_VIEW | Tap CITY |
| CITY_VIEW | MENU | Tap BACK |

---

### Crane

Pendulum system that swings the next block.

```
Crane {
  x: number           // Pivot X position (world coords)
  y: number           // Pivot Y position (world coords, moves with camera)
  angle: number       // Current swing angle (radians, oscillates ±maxAngle)
  speed: number       // Angular velocity (constant ~π rad/s)
  cableLength: number  // Fixed at 360px (4 × blockHeight)
  stretch: number     // Current cable elastic stretch (0 to ~4% of cableLength)
  block: Block | null // Attached block (null during DROPPING state)
}
```

**Swing formula:**
```
angle = maxAngle(floors) × sin(time × swingSpeed)
blockX = pivotX + sin(angle) × (cableLength + stretch)
blockY = pivotY + cos(angle) × (cableLength + stretch)
```

**Amplitude table (maxAngle by floor, default 20°):**

| Floors | Angle |
|--------|-------|
| 0–2 | ~1° (tutorial) |
| 5 | ~2° |
| 10 | ~3° |
| 20 | ~6° |
| 30 | ~9° |
| 50 | ~14° |
| 80+ | ~20° |

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
- `targetY = max(0, towerTopY - canvasHeight × 0.6)`
- `y += (targetY - y) × lerpSpeed × dt` (lerpSpeed = 5.0)
- Camera never moves down: `y = max(y, newY)`
- Bottom portion shows last 3.5 blocks

---

### City

Collection of all saved TowerRecords, rendered as a skyline.

```
City = TowerRecord[]
```

**Rendering:**
- Towers sorted by height (shortest → tallest, left → right)
- Each rendered as a colored rectangle proportional to `width`
- Windows drawn as small squares in grid pattern
- Horizontally scrollable with touch pan

---

### Debris (Falling Overhang)

When a block lands off-center, the overhang becomes falling debris.

```
Debris {
  x: number      // World X position
  y: number      // World Y position
  width: number   // Overhang width
  height: number  // Same as block height (90px)
  vx: number      // Horizontal velocity (falls sideways)
  vy: number      // Vertical velocity (gravity)
  rotation: number // Current rotation angle
  rotSpeed: number // Rotation speed (rad/s)
}
```

**Lifecycle:** Created on partial overlap landing, removed when falls below viewport.

---

### ScreenShake

Transient visual effect on perfect placement and game over.

```
ScreenShake {
  x: number         // Current offset X
  y: number         // Current offset Y
  intensity: number // Shake magnitude (px)
  timer: number     // Remaining duration (seconds)
}
```

**Values:**
- Perfect: intensity 3px, duration 200ms
- Game over: intensity 8px, duration 400ms

---

## Entity Relationships

```
Game (singleton)
 ├── state: GameState
 ├── score: number
 ├── combo: number
 ├── bestCombo: number
 ├── missesLeft: number (starts at 3)
 ├── crane: Crane
 │     └── block: Block | null
 ├── tower: Block[]
 │     └── wobble: TowerWobble
 ├── fallingBlock: Block | null (during DROPPING)
 ├── debris: Debris[]
 ├── camera: Camera
 ├── city: TowerRecord[] (loaded from localStorage)
 └── screenShake: ScreenShake
```

---

## Storage Schema (localStorage)

| Key | Type | Description |
|-----|------|-------------|
| `towerStack_city` | `TowerRecord[]` (JSON) | Saved towers (max 50) |
| `towerStack_bestScore` | `number` (string) | All-time best score |
| `towerStack_bestHeight` | `number` (string) | All-time highest tower |
| `towerStack_settings` | `object` (JSON) | Custom physics settings |

---

*Source: ENGINEERING.md §2.3 (Object Diagram), §9 (Storage Schema)*
