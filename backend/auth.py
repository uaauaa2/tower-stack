"""Telegram WebApp initData validation.

Validates the HMAC-SHA256 signature of Telegram initData
using the bot token as the secret key.
"""

import hashlib
import hmac
import time
import urllib.parse


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int = 86400) -> dict | None:
    """
    Validate Telegram WebApp initData.
    Returns parsed user dict if valid, None if invalid.
    
    Algorithm:
    1. Parse init_data as query string
    2. Extract hash value
    3. Sort remaining params alphabetically
    4. Join as key=value\\n pairs
    5. Compute HMAC-SHA256 with SHA256(bot_token) as key
    6. Compare hashes
    7. Check auth_date is not too old (default 24h)
    """
    import sys as _sys

    if not init_data or not bot_token:
        print("[AUTH] FAIL: missing data", file=_sys.stderr)
        return None

    try:
        params = urllib.parse.parse_qs(init_data, keep_blank_values=True)
        params = {k: v[0] for k, v in params.items()}
    except Exception as e:
        print(f"[AUTH] FAIL: parse error ({type(e).__name__})", file=_sys.stderr)
        return None

    received_hash = params.pop("hash", None)
    if not received_hash:
        print("[AUTH] FAIL: no hash param", file=_sys.stderr)
        return None

    # Remove signature — Telegram includes it but does NOT use it in hash computation
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

    # Log param keys (no values) for debugging
    print(f"[AUTH] params: {sorted(params.keys())}", file=_sys.stderr)

    # Sort params and join
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    # Compute secret key: SHA256 of bot_token
    secret_key = hashlib.sha256(bot_token.encode()).digest()

    # Compute HMAC-SHA256
    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        print("[AUTH] FAIL: hash mismatch", file=_sys.stderr)
        return None

    # Parse user data
    import json
    user_data = params.get("user")
    if user_data:
        try:
            user = json.loads(user_data)
        except json.JSONDecodeError:
            return None
    else:
        # Fallback: try to get from params directly
        user = {
            "id": params.get("id"),
            "username": params.get("username"),
            "first_name": params.get("first_name"),
        }

    return {
        "id": user.get("id"),
        "username": user.get("username"),
        "first_name": user.get("first_name"),
    }
