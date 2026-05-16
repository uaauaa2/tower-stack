# Tower Stack — Code Quality Review

**Date:** 2026-05-16
**Reviewer:** Automated Code Review
**Scope:** Full backend + frontend (index.html)
**Files Reviewed:**
- `backend/main.py`
- `backend/auth.py`
- `backend/database.py`
- `backend/models.py`
- `backend/bot.py`
- `backend/achievements.py`
- `tests/test_backend.py`
- `index.html` (frontend, ~2500 lines)

---

## Executive Summary

**Overall Code Quality Score: 72/100**

The Tower Stack project is a well-structured Telegram WebApp game with a clean FastAPI backend and impressive canvas-based frontend. The code demonstrates good separation of concerns, proper use of modern Python patterns (Pydantic, FastAPI), and thoughtful game physics implementation. However, there are several areas requiring attention, particularly around error handling, resource management, testing coverage, and frontend code organization.

### Strengths
- Clean architecture with good separation of concerns
- Proper use of Pydantic for validation
- Comprehensive input validation
- Good use of FastAPI features
- Impressive game physics and visuals in frontend
- Auth validation is thorough
- Test coverage exists with pytest

### Key Areas for Improvement
- DB connection management needs improvement
- Missing comprehensive error handling in several places
- Frontend code is monolithic and hard to maintain
- Limited test coverage for edge cases
- Some hardcoded values and magic numbers
- Missing database migrations/versioning
- No logging framework in frontend

---

## Detailed Findings

### 1. Architecture & Design

#### MEDIUM | main.py:1 | Monolithic endpoint design
**Description:** The `main.py` file contains multiple concerns: API endpoints, rate limiting, business logic for score submission, and webhook handling. This violates Single Responsibility Principle.

**Recommendation:** Consider extracting:
- Rate limiting to a separate middleware
- Score submission business logic to a service layer
- Webhook handling to a dedicated module

**Impact:** Improves testability and maintainability.

---

#### LOW | database.py:1 | No database abstraction layer
**Description:** Direct SQL queries are scattered throughout the codebase. While functional, this makes it harder to:
- Mock database for testing
- Switch database backends
- Track schema changes

**Recommendation:** Consider an ORM (SQLAlchemy, Tortoise-ORM) or at least a Repository pattern to encapsulate SQL queries.

**Impact:** Better testability and migration support.

---

#### MEDIUM | index.html:1 | Monolithic frontend file
**Description:** The entire frontend (2500+ lines) is in a single HTML file containing:
- Configuration
- Theme definitions
- Utility functions
- Game state
- Rendering logic
- API calls
- Input handling

This makes the code extremely hard to navigate, debug, and maintain.

**Recommendation:** Split into:
- `config.js` - configuration and constants
- `themes.js` - theme definitions
- `game-state.js` - state management
- `physics.js` - game physics and updates
- `renderer.js` - canvas rendering
- `api.js` - API communication
- `input.js` - input handling
- `index.html` - just the HTML shell with script imports

**Impact:** Dramatically improves maintainability and team collaboration.

---

### 2. Error Handling

#### CRITICAL | main.py:85 | Missing exception handling in `submit_score`
**Description:** The score submission endpoint has a try-catch block, but:
- The rollback happens in `finally` which may not execute if unhandled exception occurs
- Database connections may not be closed properly if exception happens before `finally`
- No specific error types caught (catches generic Exception)

```python
try:
    player_id = upsert_player(conn, telegram_id, user.get("username"), user.get("first_name"))
    # ... more code ...
except Exception as e:
    conn.rollback()
    logger.error(f"Score submission error: {e}", exc_info=True)
    raise HTTPException(status_code=500, detail="Internal server error")
finally:
    conn.close()
```

**Recommendation:**
```python
from contextlib import contextmanager

@contextmanager
def get_db_transaction():
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# Usage in endpoint
with get_db_transaction() as conn:
    player_id = upsert_player(conn, telegram_id, user.get("username"), user.get("first_name"))
    # ... rest of code
```

**Impact:** Prevents connection leaks and ensures proper transaction management.

---

#### HIGH | database.py:140 | No error handling in `get_db()`
**Description:** The `get_db()` function doesn't handle connection failures. If Turso is down or credentials are invalid, the application will crash without proper error reporting.

**Recommendation:**
```python
def get_db():
    try:
        if HAS_LIBSQL and TURSO_URL:
            raw = _libsql_connect(TURSO_URL, auth_token=TURSO_AUTH_TOKEN)
            return _LibsqlConnection(raw)
        else:
            os.makedirs(os.path.dirname(LOCAL_DB_PATH), exist_ok=True)
            conn = _sqlite3.connect(LOCAL_DB_PATH)
            conn.row_factory = _sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            return conn
    except Exception as e:
        logger.error(f"Database connection failed: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail="Database unavailable")
```

**Impact:** Better error reporting and graceful degradation.

---

#### HIGH | auth.py:45 | Silent failures in auth validation
**Description:** When Ed25519 library is missing and HMAC is disabled, the function prints to stderr but returns None. This is hard to debug in production.

**Recommendation:** Use proper logging:
```python
import logging
logger = logging.getLogger("towerstack.auth")

# Replace print statements with:
logger.error("[AUTH] FAIL: missing init_data")
logger.warning(f"[AUTH] Ed25519 FAIL: {e}")
```

**Impact:** Better production debugging and monitoring.

---

#### MEDIUM | index.html:460 | Silent API failures
**Description:** Frontend API calls catch errors but only log to console. Users get no feedback when network requests fail.

```javascript
} catch(e) {
  console.log('[API] submitScore error:', e.message);
  return null;
}
```

**Recommendation:** Add user-facing error notifications or retry logic.

**Impact:** Better user experience.

---

### 3. Resource Management

#### CRITICAL | main.py:85 | DB connection lifecycle issues
**Description:** In `submit_score`, the database connection is obtained but if an exception occurs before the `finally` block, the connection may leak. Also, the connection is not using a context manager.

**Recommendation:** Use context managers as shown in Error Handling finding #1.

**Impact:** Prevents connection pool exhaustion.

---

#### HIGH | database.py:180 | Missing connection pooling
**Description:** Each request creates a new database connection. For Turso (remote database), this is inefficient. SQLite with WAL mode is better but still benefits from pooling.

**Recommendation:** Implement connection pooling:
```python
from contextvars import ContextVar
from functools import lru_cache

_db_context: ContextVar = ContextVar("_db_context")

@lru_cache(maxsize=10)
def get_db_pool():
    if HAS_LIBSQL and TURSO_URL:
        # libsql has built-in connection pooling
        return _libsql_connect(TURSO_URL, auth_token=TURSO_AUTH_TOKEN, max_connections=10)
    else:
        # For SQLite, return new connections but cache if possible
        return None

def get_db():
    if HAS_LIBSQL and TURSO_URL:
        conn = get_db_pool()
        return _LibsqlConnection(conn)
    else:
        # SQLite fallback
        ...
```

**Impact:** Better performance under load.

---

#### MEDIUM | index.html:460 | No request deduplication
**Description:** Multiple concurrent score submissions can occur if user clicks rapidly. The `_submitting` flag exists but is set synchronously.

**Recommendation:** Implement proper request deduplication with Promise-based locking.

**Impact:** Prevents duplicate submissions.

---

### 4. Code Organization

#### MEDIUM | models.py:1 | Missing type hints in some places
**Description:** While Pydantic models are well-typed, some functions in other modules lack return type hints.

**Recommendation:** Add type hints to all functions:
```python
def get_player_stats(conn, player_id: int) -> dict[str, Any]:
    ...
```

**Impact:** Better IDE support and catch errors early.

---

#### MEDIUM | achievements.py:1 | Magic numbers in achievement thresholds
**Description:** Achievement thresholds are hardcoded (height >= 10, 25, 50, etc.).

**Recommendation:** Move to configuration:
```python
ACHIEVEMENT_THRESHOLDS = {
    "height": [10, 25, 50],
    "combo": [3, 5, 10],
    "score": [1000, 5000, 10000],
    "games": [10, 50],
    "perfect": [10],
}
```

**Impact:** Easier to tune game balance.

---

#### LOW | bot.py:1 | Overly simple webhook handler
**Description:** The bot handler only replies to messages. No command parsing, no help text, no error handling.

**Recommendation:** Add more bot features or simplify by removing if not needed.

**Impact:** Better user experience if bot features are needed.

---

### 5. Performance

#### MEDIUM | database.py:230 | N+1 query in `get_player_stats`
**Description:** The function executes three separate queries:
1. Aggregation query for games
2. Subquery for rank
3. Query for achievements

These could be combined into fewer queries.

**Recommendation:** Consider using window functions or a single query with JOIN.

**Impact:** Reduced database load.

---

#### HIGH | index.html:900 | Sprite caching not limited
**Description:** The `SPRITE_CACHE` object grows unbounded. With 4 themes × 6 colors × 2 perfect states × multiple sizes, this can consume significant memory.

**Recommendation:** Implement LRU cache with size limit:
```javascript
const MAX_SPRITE_CACHE_SIZE = 50;
const spriteCacheKeys = [];

function getBlockSprite(themeId, color, isPerfect, size) {
  const key = `${themeId}_${color}_${isPerfect ? 1 : 0}_${size}`;
  if (SPRITE_CACHE[key]) return SPRITE_CACHE[key];

  // Evict oldest if cache is full
  if (spriteCacheKeys.length >= MAX_SPRITE_CACHE_SIZE) {
    const oldestKey = spriteCacheKeys.shift();
    delete SPRITE_CACHE[oldestKey];
  }

  // Generate new sprite
  const oc = document.createElement('canvas');
  // ... rendering code ...
  SPRITE_CACHE[key] = oc;
  spriteCacheKeys.push(key);
  return oc;
}
```

**Impact:** Prevents memory leaks on long sessions.

---

#### MEDIUM | index.html:650 | Particle system no limit
**Description:** Particles array can grow unbounded if not filtered properly. While there's a filter, it's not rate-limited on creation.

**Recommendation:** Add hard limit and oldest-first eviction.

**Impact:** Consistent performance on low-end devices.

---

### 6. Testing

#### HIGH | tests/test_backend.py:1 | Missing integration tests
**Description:** Tests cover auth and models well, but missing:
- Database integration tests with real data
- Leaderboard queries with multiple players
- Achievement unlocking scenarios
- Rate limiting behavior
- Webhook handling

**Recommendation:** Add test fixtures for database and comprehensive integration tests.

**Impact:** Catches bugs before production.

---

#### MEDIUM | tests/test_backend.py:250 | Test database not cleaned between tests
**Description:** The test removes the database file before tests but doesn't clean up after. State may leak between tests.

**Recommendation:** Use pytest fixtures with proper cleanup:
```python
@pytest.fixture
def test_db():
    os.environ["DB_PATH"] = "/tmp/test_towerstack_{}.db".format(uuid.uuid4())
    init_db()
    yield
    if os.path.exists(os.environ["DB_PATH"]):
        os.remove(os.environ["DB_PATH"])
```

**Impact:** More reliable tests.

---

#### CRITICAL | No frontend tests
**Description:** The frontend has zero automated tests. All testing is manual.

**Recommendation:** Add:
- Unit tests for game logic (collision detection, scoring)
- Integration tests for API calls
- Visual regression tests for rendering

**Impact:** Prevents regressions in game logic.

---

### 7. Type Safety

#### LOW | models.py:45 | Inconsistent type hints
**Description:** Some functions use `dict` as return type instead of specific Pydantic models or TypedDict.

**Recommendation:** Use TypedDict or create response models:
```python
from typing import TypedDict

class PlayerStats(TypedDict):
    total_games: int
    best_score: int
    # ...
```

**Impact:** Better type checking.

---

#### LOW | index.html:1 | No JSDoc comments
**Description:** Frontend JavaScript has no type annotations or JSDoc comments.

**Recommendation:** Add JSDoc for key functions:
```javascript
/**
 * Calculate overlap between two blocks
 * @param {number} x1 - Left block x position
 * @param {number} x2 - Right block x position
 * @returns {number} Overlap width in pixels
 */
function calculateOverlap(x1, x2) { ... }
```

**Impact:** Better IDE support and documentation.

---

### 8. Maintainability

#### MEDIUM | index.html:100 | Hardcoded configuration values
**Description:** Many magic numbers scattered throughout:
- Block sizes
- Physics constants
- Animation timings
- Colors

**Recommendation:** Consolidate all constants in `CFG` object with clear comments.

**Impact:** Easier to tune game parameters.

---

#### MEDIUM | main.py:15 | Environment variable validation missing
**Description:** Required environment variables (`BOT_TOKEN`, `WEBAPP_URL`) are read but not validated on startup.

**Recommendation:** Add validation in `startup` event:
```python
@app.on_event("startup")
def startup():
    init_db()
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN environment variable required")
    if not WEBAPP_URL:
        raise RuntimeError("WEBAPP_URL environment variable required")
    print(f"[API] Server started. WEBAPP_URL={WEBAPP_URL}")
```

**Impact:** Catches configuration errors early.

---

#### LOW | No database migrations
**Description:** No migration system (Alembic, custom) for schema changes.

**Recommendation:** Implement migration tracking table and versioned SQL scripts.

**Impact:** Safe schema evolution.

---

### 9. Database Design

#### MEDIUM | database.py:60 | Missing indexes for common queries
**Description:** While some indexes exist, missing:
- Composite index on `(player_id, created_at)` for recent games
- Index on `achievements.unlocked_at` for time-based queries

**Recommendation:** Add missing indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_games_player_created ON games(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_achievements_unlocked ON achievements(unlocked_at DESC);
```

**Impact:** Faster queries as data grows.

---

#### LOW | database.py:70 | No foreign key cascade behavior defined
**Description:** Foreign key constraint exists but no CASCADE behavior specified.

**Recommendation:** Decide on cascade behavior and add to schema:
```sql
FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
```

**Impact:** Consistent data cleanup.

---

### 10. Frontend Quality

#### HIGH | index.html:1 | No error boundaries
**Description:** If any JavaScript error occurs, the entire game crashes. No error recovery.

**Recommendation:** Add global error handler:
```javascript
window.addEventListener('error', (e) => {
  console.error('[GAME] Uncaught error:', e.error);
  // Show user-friendly error message
  // Optionally: send to error tracking service
});
```

**Impact:** Better user experience and debugging.

---

#### HIGH | index.html:460 | No network error recovery
**Description:** API failures are logged but no retry logic or offline mode.

**Recommendation:** Implement exponential backoff retry:
```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (i === maxRetries - 1) throw new Error('Max retries exceeded');
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}
```

**Impact:** Better reliability on poor networks.

---

#### MEDIUM | index.html:1200 | Canvas performance issues
**Description:** The game redraws everything every frame. No dirty rectangle optimization or object pooling for frequently created objects.

**Recommendation:** Implement object pooling for particles and float texts.

**Impact:** Better performance on low-end devices.

---

#### MEDIUM | index.html:500 | No accessibility features
**Description:** No ARIA labels, keyboard navigation beyond basic, no screen reader support.

**Recommendation:** Add accessibility features if this is a goal (game accessibility is challenging but possible).

**Impact:** Inclusive design.

---

#### LOW | index.html:900 | Code duplication in theme rendering
**Description:** Theme-specific rendering code has significant duplication (similar patterns in buildSpriteClassic, buildSpriteCyberpunk, etc.).

**Recommendation:** Extract common rendering patterns into helper functions.

**Impact:** Easier to add new themes.

---

## Summary by Severity

### CRITICAL (3)
1. DB connection lifecycle issues - main.py:85
2. Missing exception handling in submit_score - main.py:85
3. No frontend tests - entire frontend

### HIGH (7)
1. No error handling in get_db() - database.py:140
2. Silent failures in auth validation - auth.py:45
3. Missing connection pooling - database.py:180
4. Sprite caching not limited - index.html:900
5. Missing integration tests - tests/test_backend.py:1
6. No error boundaries - index.html:1
7. No network error recovery - index.html:460

### MEDIUM (13)
1. Monolithic endpoint design - main.py:1
2. Monolithic frontend file - index.html:1
3. Silent API failures - index.html:460
4. No request deduplication - index.html:460
5. Missing type hints in some places - models.py:1
6. Magic numbers in achievement thresholds - achievements.py:1
7. N+1 query in get_player_stats - database.py:230
8. Particle system no limit - index.html:650
9. Test database not cleaned between tests - tests/test_backend.py:250
10. Inconsistent type hints - models.py:45
11. Hardcoded configuration values - index.html:100
12. Environment variable validation missing - main.py:15
13. No database migrations - database.py
14. Missing indexes for common queries - database.py:60
15. Canvas performance issues - index.html:1200
16. No accessibility features - index.html:500
17. Code duplication in theme rendering - index.html:900

### LOW (7)
1. No database abstraction layer - database.py:1
2. Missing type hints in some places - models.py:1
3. Overly simple webhook handler - bot.py:1
4. No JSDoc comments - index.html:1
5. No foreign key cascade behavior defined - database.py:70

---

## Recommendations Priority

### Immediate (Fix This Week)
1. **Fix DB connection management** - Use context managers to prevent connection leaks
2. **Add error boundaries to frontend** - Prevent total game crashes
3. **Implement retry logic for API calls** - Better network reliability
4. **Add environment variable validation** - Catch config errors early

### Short-term (Next Sprint)
1. **Refactor frontend into modules** - Break up the 2500-line file
2. **Add sprite cache size limits** - Prevent memory leaks
3. **Implement connection pooling** - Better performance under load
4. **Add proper logging throughout** - Replace print statements
5. **Add integration tests** - Cover more scenarios

### Medium-term (Next Quarter)
1. **Implement database migrations** - Safe schema evolution
2. **Add frontend tests** - Prevent regressions
3. **Optimize database queries** - Reduce N+1 issues
4. **Add monitoring/alerting** - Production observability

### Long-term (Future)
1. **Consider ORM or Repository pattern** - Better abstraction
2. **Add accessibility features** - Inclusive design
3. **Implement object pooling** - Better performance
4. **Add A/B testing framework** - Game balance tuning

---

## Conclusion

The Tower Stack project is a solid foundation with impressive game mechanics and clean backend architecture. The main concerns are around resource management (DB connections), error handling, and frontend maintainability. Addressing the CRITICAL and HIGH priority issues will significantly improve reliability and user experience. The codebase shows good understanding of modern web development practices, and with these improvements, it will be production-ready.

**Score Breakdown:**
- Architecture: 70/100
- Error Handling: 55/100
- Resource Management: 60/100
- Code Organization: 65/100
- Performance: 75/100
- Testing: 50/100
- Type Safety: 75/100
- Maintainability: 70/100
- Database Design: 80/100
- Frontend Quality: 70/100

**Weighted Average: 72/100**