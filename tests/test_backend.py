"""Unit and integration tests for Tower Stack backend."""

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse

import pytest

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from auth import validate_init_data
from models import ScoreSubmit, VALID_THEMES

# Rate limit constant for test timing
RATE_LIMIT_SECONDS = 5


# ============================================================
# Helper: generate valid Telegram init_data
# ============================================================

def generate_init_data(bot_token: str, user_id: int = 123456789,
                       username: str = "testuser",
                       first_name: str = "Test",
                       auth_date: int | None = None) -> str:
    """Generate a valid Telegram WebApp init_data string for testing."""
    if auth_date is None:
        auth_date = int(time.time())

    user_json = json.dumps({"id": user_id, "username": username, "first_name": first_name})
    
    params = {
        "query_id": "AAHdF8eIAfQyMA",
        "user": user_json,
        "auth_date": str(auth_date),
    }

    # Sort and join
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    # Compute HMAC
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    # Build query string
    params["hash"] = computed_hash
    return urllib.parse.urlencode(params)


# ============================================================
# Auth Tests
# ============================================================

class TestAuth:
    BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"

    def test_valid_init_data(self):
        """Valid init_data should return user dict."""
        init_data = generate_init_data(self.BOT_TOKEN)
        result = validate_init_data(init_data, self.BOT_TOKEN)
        assert result is not None
        assert result["id"] == 123456789
        assert result["username"] == "testuser"
        assert result["first_name"] == "Test"

    def test_invalid_token(self):
        """Wrong bot token should fail validation."""
        init_data = generate_init_data(self.BOT_TOKEN)
        result = validate_init_data(init_data, "999999:WRONG-TOKEN")
        assert result is None

    def test_empty_init_data(self):
        """Empty init_data should return None."""
        assert validate_init_data("", self.BOT_TOKEN) is None
        assert validate_init_data(None, self.BOT_TOKEN) is None

    def test_empty_token(self):
        """Empty token should return None."""
        init_data = generate_init_data(self.BOT_TOKEN)
        assert validate_init_data(init_data, "") is None
        assert validate_init_data(init_data, None) is None

    def test_tampered_data(self):
        """Modified init_data should fail validation."""
        init_data = generate_init_data(self.BOT_TOKEN)
        # Tamper with user ID
        parsed = urllib.parse.parse_qs(init_data)
        user = json.loads(parsed["user"][0])
        user["id"] = 999999999
        parsed["user"] = [json.dumps(user)]
        tampered = urllib.parse.urlencode(parsed, doseq=True)
        result = validate_init_data(tampered, self.BOT_TOKEN)
        assert result is None

    def test_stale_auth_date(self):
        """Old auth_date should be rejected."""
        old_timestamp = int(time.time()) - 100000  # ~28 hours ago
        init_data = generate_init_data(self.BOT_TOKEN, auth_date=old_timestamp)
        result = validate_init_data(init_data, self.BOT_TOKEN, max_age_seconds=86400)
        assert result is None

    def test_fresh_auth_date(self):
        """Recent auth_date should be accepted."""
        init_data = generate_init_data(self.BOT_TOKEN, auth_date=int(time.time()) - 60)
        result = validate_init_data(init_data, self.BOT_TOKEN, max_age_seconds=86400)
        assert result is not None

    def test_no_hash(self):
        """init_data without hash should return None."""
        result = validate_init_data("user=test&auth_date=123", self.BOT_TOKEN)
        assert result is None

    def test_real_bot_token_format(self):
        """Test with a real-looking bot token format."""
        real_token = "1234567890:AAHtest_FAKE_TOKEN_for_unit_tests_only-no-real-value"
        init_data = generate_init_data(real_token, user_id=379891355,
                                       username="uaauaa2", first_name="Konstantin")
        result = validate_init_data(init_data, real_token)
        assert result is not None
        assert result["id"] == 379891355
        assert result["username"] == "uaauaa2"

    def test_url_encoded_special_chars(self):
        """Test that URL-encoded characters in user data work correctly."""
        user_json = json.dumps({"id": 123, "username": "test_user", "first_name": "Тест"})
        params = {
            "query_id": "AAHtest123",
            "user": user_json,
            "auth_date": str(int(time.time())),
        }
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
        secret_key = hashlib.sha256(self.BOT_TOKEN.encode()).digest()
        computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        params["hash"] = computed_hash
        init_data = urllib.parse.urlencode(params)
        
        result = validate_init_data(init_data, self.BOT_TOKEN)
        assert result is not None
        assert result["first_name"] == "Тест"

    def test_signature_field_ignored(self):
        """Telegram includes 'signature' in init_data but NOT in hash computation."""
        user_json = json.dumps({"id": 999, "username": "sig_test", "first_name": "Sig"})
        params = {
            "query_id": "AAHtest456",
            "user": user_json,
            "auth_date": str(int(time.time())),
        }
        # Compute hash WITHOUT signature
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
        secret_key = hashlib.sha256(self.BOT_TOKEN.encode()).digest()
        computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        
        # Add both hash and signature
        params["hash"] = computed_hash
        params["signature"] = "v1.some_signature_value_here"
        init_data = urllib.parse.urlencode(params)
        
        result = validate_init_data(init_data, self.BOT_TOKEN)
        assert result is not None
        assert result["id"] == 999


# ============================================================
# Model Validation Tests
# ============================================================

class TestModels:
    def test_valid_score_submit(self):
        data = {
            "init_data": "test=123&hash=abc",
            "score": 5000,
            "height": 25,
            "best_combo": 3,
            "perfect_count": 10,
            "duration_ms": 60000,
            "theme": "classic",
        }
        model = ScoreSubmit(**data)
        assert model.score == 5000
        assert model.theme == "classic"

    def test_invalid_theme(self):
        with pytest.raises(Exception):
            ScoreSubmit(
                init_data="test", score=100, height=5,
                theme="hacked_theme"
            )

    def test_all_valid_themes(self):
        for theme in VALID_THEMES:
            model = ScoreSubmit(init_data="test", score=100, height=5, theme=theme)
            assert model.theme == theme

    def test_negative_score(self):
        """Score < 0 should fail at API level, not model level."""
        model = ScoreSubmit(init_data="test", score=-1, height=5)
        assert model.score == -1  # Model allows it, API rejects it

    def test_negative_combo(self):
        with pytest.raises(Exception):
            ScoreSubmit(init_data="test", score=100, height=5, best_combo=-1)

    def test_negative_perfect_count(self):
        with pytest.raises(Exception):
            ScoreSubmit(init_data="test", score=100, height=5, perfect_count=-1)

    def test_duration_too_large(self):
        with pytest.raises(Exception):
            ScoreSubmit(init_data="test", score=100, height=5, duration_ms=3600001)

    def test_negative_duration(self):
        with pytest.raises(Exception):
            ScoreSubmit(init_data="test", score=100, height=5, duration_ms=-1)


# ============================================================
# Integration Tests (FastAPI test client)
# ============================================================

class TestAPI:
    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        os.environ["BOT_TOKEN"] = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
        os.environ["DB_PATH"] = "/tmp/test_towerstack.db"
        os.environ["WEBHOOK_SECRET"] = ""
        os.environ["WEBAPP_URL"] = "https://test.local"
        
        # Remove old test DB
        if os.path.exists("/tmp/test_towerstack.db"):
            os.remove("/tmp/test_towerstack.db")
        
        # Force reimport of modules with new env vars
        import importlib
        import database as db_mod
        import main as main_mod
        importlib.reload(db_mod)
        importlib.reload(main_mod)
        
        # Ensure DB is initialized
        db_mod.init_db()
        
        client = TestClient(main_mod.app)
        return client

    def test_health(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    def test_leaderboard_empty(self, client):
        resp = client.get("/api/leaderboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["entries"] == []

    def test_submit_score_valid(self, client):
        token = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
        init_data = generate_init_data(token, user_id=111, username="player1")
        
        resp = client.post("/api/score", json={
            "init_data": init_data,
            "score": 5000,
            "height": 25,
            "best_combo": 3,
            "perfect_count": 5,
            "duration_ms": 60000,
            "theme": "classic",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["personal_best"] is True

    def test_submit_score_invalid_auth(self, client):
        resp = client.post("/api/score", json={
            "init_data": "fake=data&hash=abc123",
            "score": 5000,
            "height": 25,
        })
        assert resp.status_code == 401

    def test_submit_score_too_high(self, client):
        token = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
        init_data = generate_init_data(token, user_id=222)
        
        resp = client.post("/api/score", json={
            "init_data": init_data,
            "score": 999999,
            "height": 25,
        })
        assert resp.status_code == 400

    def test_submit_and_leaderboard(self, client):
        token = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
        init_data = generate_init_data(token, user_id=333, username="leader_player")
        
        # Submit score
        resp = client.post("/api/score", json={
            "init_data": init_data,
            "score": 10000,
            "height": 50,
            "best_combo": 5,
            "perfect_count": 10,
            "duration_ms": 120000,
            "theme": "cyberpunk",
        })
        assert resp.status_code == 200

        # Check leaderboard
        resp = client.get("/api/leaderboard")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["entries"]) == 1
        assert data["entries"][0]["username"] == "leader_player"
        assert data["entries"][0]["score"] == 10000
        # Verify telegram_id is NOT in username
        assert "333" not in data["entries"][0]["username"]

    def test_leaderboard_dedup(self, client):
        """Same player submits twice — only best score appears."""
        token = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
        init_data_1 = generate_init_data(token, user_id=444, username="dedup_player")

        # First score
        resp1 = client.post("/api/score", json={
            "init_data": init_data_1,
            "score": 1000,
            "height": 10,
        })
        assert resp1.status_code == 200, f"First submit failed: {resp1.text}"

        # Better score — generate fresh init_data (new auth_date to bypass rate limit)
        time.sleep(RATE_LIMIT_SECONDS + 0.1)
        init_data_2 = generate_init_data(token, user_id=444, username="dedup_player")

        resp2 = client.post("/api/score", json={
            "init_data": init_data_2,
            "score": 5000,
            "height": 25,
        })
        assert resp2.status_code == 200, f"Second submit failed: {resp2.text}"
        
        # Check leaderboard has only 1 entry
        resp = client.get("/api/leaderboard")
        data = resp.json()
        player_entries = [e for e in data["entries"] if e["username"] == "dedup_player"]
        assert len(player_entries) == 1
        assert player_entries[0]["score"] == 5000

    def test_stats(self, client):
        token = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
        init_data = generate_init_data(token, user_id=555, username="stats_player")
        
        # Submit a game
        client.post("/api/score", json={
            "init_data": init_data,
            "score": 3000,
            "height": 15,
            "perfect_count": 7,
            "duration_ms": 90000,
        })
        
        # Get stats
        resp = client.post("/api/stats", json={"init_data": init_data})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 1
        assert data["best_score"] == 3000
        assert data["total_perfects"] == 7
        assert data["total_playtime_min"] == 2  # 90000ms = 1.5 min, rounded up

    def test_invalid_theme_rejected(self, client):
        token = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
        init_data = generate_init_data(token, user_id=666)
        
        resp = client.post("/api/score", json={
            "init_data": init_data,
            "score": 100,
            "height": 5,
            "theme": "evil_theme",
        })
        assert resp.status_code == 422  # Validation error


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
