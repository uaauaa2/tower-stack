"""Telegram WebApp initData validation.

Two modes:
1. Full HMAC validation (default) — verifies init_data is signed by Telegram
2. Fallback mode (HMAC_VALIDATE=false) — only checks auth_date freshness
"""

import hashlib
import hmac
import json
import os
import time
import urllib.parse


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int = 86400) -> dict | None:
    """
    Validate Telegram WebApp initData.
    Returns parsed user dict if valid, None if invalid.
    """
    import sys as _sys

    if not init_data:
        print("[AUTH] FAIL: missing init_data", file=_sys.stderr)
        return None

    try:
        # URL-decode first (as per Telegram docs and official libraries)
        decoded = urllib.parse.unquote(init_data)
        params = urllib.parse.parse_qs(decoded, keep_blank_values=True)
        params = {k: v[0] for k, v in params.items()}
    except Exception as e:
        print(f"[AUTH] FAIL: parse error ({type(e).__name__})", file=_sys.stderr)
        return None

    received_hash = params.pop("hash", None)
    params.pop("signature", None)

    # Check auth_date freshness (replay protection)
    auth_date = params.get("auth_date")
    if auth_date:
        try:
            age = time.time() - int(auth_date)
            if age > max_age_seconds:
                print(f"[AUTH] FAIL: stale ({age:.0f}s old)", file=_sys.stderr)
                return None
        except (ValueError, TypeError):
            print("[AUTH] FAIL: bad auth_date", file=_sys.stderr)
            return None

    # Parse user data FIRST (we need it for both modes)
    user_data = params.get("user")
    if user_data:
        try:
            user = json.loads(user_data)
        except json.JSONDecodeError:
            print("[AUTH] FAIL: bad user JSON", file=_sys.stderr)
            return None
    else:
        user = {}

    user_id = user.get("id")
    if not user_id:
        print("[AUTH] FAIL: no user id", file=_sys.stderr)
        return None

    # Check if HMAC validation is enabled
    hmac_enabled = os.environ.get("HMAC_VALIDATE", "true").lower() != "false"

    if not hmac_enabled:
        # Fallback: skip HMAC, just check freshness + user_id
        print(f"[AUTH] OK (no-HMAC mode): user_id={user_id}, username={user.get('username')}", file=_sys.stderr)
        return {
            "id": user_id,
            "username": user.get("username"),
            "first_name": user.get("first_name"),
        }

    # Full HMAC validation
    if not bot_token:
        print("[AUTH] FAIL: missing bot_token", file=_sys.stderr)
        return None

    # Build data_check_string
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    # Secret key: HMAC-SHA256("WebAppData", bot_token)
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()

    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    print(f"[AUTH] received_hash: {received_hash}", file=_sys.stderr)
    print(f"[AUTH] computed_hash:  {computed_hash}", file=_sys.stderr)

    if not received_hash or not hmac.compare_digest(computed_hash, received_hash):
        print("[AUTH] FAIL: hash mismatch", file=_sys.stderr)
        return None

    print(f"[AUTH] OK: user_id={user_id}, username={user.get('username')}", file=_sys.stderr)
    return {
        "id": user_id,
        "username": user.get("username"),
        "first_name": user.get("first_name"),
    }
