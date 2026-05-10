# Tower Stack — Storage Contract

> **Spec ID:** 001-tower-stack
> **Layer:** localStorage Persistence API
> **Source:** ENGINEERING.md §9

---

## Overview

All game persistence uses browser `localStorage`. No backend. Synchronous reads, async-safe writes. All data stored as JSON strings.

---

## Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `towerStack_city` | `TowerRecord[]` | `[]` | Saved towers (max 50) |
| `towerStack_bestScore` | `string` (number) | `"0"` | All-time best score |
| `towerStack_bestHeight` | `string` (number) | `"0"` | All-time highest tower (blocks) |
| `towerStack_settings` | `object` (JSON) | `{}` | Custom physics parameters |

---

## Schemas

### TowerRecord

```json
{
  "height": 23,
  "date": "2026-05-09",
  "width": 80
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `height` | `number` | Yes | Number of blocks placed (≥ 1) |
| `date` | `string` | Yes | ISO 8601 date (`YYYY-MM-DD`) |
| `width` | `number` | Yes | Final block width in pixels (for city rendering) |

### Settings

```json
{
  "blockSize": 90,
  "swingSpeed": 3.14159,
  "cableLength": 360,
  "gravity": 2000,
  "missOverlapRatio": 0.3,
  "lives": 3,
  "perfectTolerance": 3
}
```

All fields optional — missing fields fall back to hardcoded defaults in `CONFIG`.

---

## Read Operations

### `loadCity(): TowerRecord[]`

```javascript
function loadCity() {
    try {
        const data = localStorage.getItem('towerStack_city');
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}
```

**Contract:**
- Returns `[]` on missing key, invalid JSON, or parse error.
- Never throws.
- Result is a new array (not a reference to stored data).

### `getBestScore(): number`

```javascript
function getBestScore() {
    const val = localStorage.getItem('towerStack_bestScore');
    return val ? parseInt(val, 10) : 0;
}
```

**Contract:**
- Returns `0` on missing key or NaN.
- Never throws.

### `getBestHeight(): number`

```javascript
function getBestHeight() {
    const val = localStorage.getItem('towerStack_bestHeight');
    return val ? parseInt(val, 10) : 0;
}
```

Same contract as `getBestScore`.

### `loadSettings(): object`

```javascript
function loadSettings() {
    try {
        const data = localStorage.getItem('towerStack_settings');
        return data ? JSON.parse(data) : {};
    } catch {
        return {};
    }
}
```

**Contract:**
- Returns `{}` on missing key or parse error.
- Caller merges with defaults.

---

## Write Operations

### `saveCity(towerRecord: TowerRecord): void`

```javascript
function saveCity(record) {
    const city = loadCity();
    city.push(record);
    if (city.length > 50) city.shift();
    localStorage.setItem('towerStack_city', JSON.stringify(city));
}
```

**Contract:**
- Appends record to existing city.
- Enforces max 50 records (FIFO eviction).
- Called once per game over.

### `saveBestScore(score: number): void`

```javascript
function saveBestScore(score) {
    const best = getBestScore();
    if (score > best) {
        localStorage.setItem('towerStack_bestScore', score.toString());
    }
}
```

**Contract:**
- Only writes if new score exceeds current best.
- Called on game over.

### `saveBestHeight(height: number): void`

```javascript
function saveBestHeight(height) {
    const best = getBestHeight();
    if (height > best) {
        localStorage.setItem('towerStack_bestHeight', height.toString());
    }
}
```

Same contract as `saveBestScore`.

### `saveSettings(settings: object): void`

```javascript
function saveSettings(settings) {
    localStorage.setItem('towerStack_settings', JSON.stringify(settings));
}
```

**Contract:**
- Overwrites entire settings object.
- Called from Settings screen "Apply & Restart".

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `localStorage` unavailable (private browsing, quota) | All reads return defaults. Writes silently fail. Game works without persistence. |
| Corrupt JSON in storage | `try/catch` returns defaults. No crash. |
| Quota exceeded on write | `try/catch` around `setItem`. Game continues without saving. |
| `null` values | Parsed as defaults (empty array, 0, empty object). |

---

## Data Lifecycle

```
Game Start
    │
    ├── loadCity()          → populate city view data
    ├── getBestScore()      → display on menu
    ├── getBestHeight()     → display on menu
    ├── loadSettings()      → apply custom physics
    │
    ▼
Gameplay (no storage writes)
    │
    ▼
Game Over
    │
    ├── saveCity(record)    → add tower to skyline
    ├── saveBestScore()     → update if beaten
    └── saveBestHeight()    → update if beaten
```

**Rule:** localStorage writes only happen on game over and settings save. Never during gameplay frames.

---

*Source: ENGINEERING.md §9 (Persistent Storage)*
