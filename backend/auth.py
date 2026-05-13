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
    if not init_data or not bot_token:
        import sys
        print(f"[AUTH] Missing data: init_data={bool(init_data)}, bot_token={bool(bot_token)}", file=sys.stderr)
        return None

    try:
        params = urllib.parse.parse_qs(init_data, keep_blank_values=True)
        # parse_qs returns lists, flatten
        params = {k: v[0] for k, v in params.items()}
    except Exception as e:
        import sys
        print(f"[AUTH] Parse error: {e}", file=sys.stderr)
        return None

    received_hash = params.pop("hash", None)
    if not received_hash:
        import sys
        print(f"[AUTH] No hash in params. Keys: {list(params.keys())}", file=sys.stderr)
        return None

    # Check auth_date freshness (replay protection)
    auth_date = params.get("auth_date")
    if auth_date:
        try:
            age = time.time() - int(auth_date)
            if age > max_age_seconds:
                import sys
                print(f"[AUTH] Stale init_data: age={age}s, max={max_age_seconds}s", file=sys.stderr)
                return None
        except (ValueError, TypeError) as e:
            import sys
            print(f"[AUTH] Bad auth_date: {e}", file=sys.stderr)
            return None

    # Sort params and join
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    import sys
    print(f"[AUTH] data_check_string (first 200): {data_check_string[:200]}", file=sys.stderr)

    # Compute secret key: SHA256 of bot_token
    secret_key = hashlib.sha256(bot_token.encode()).digest()

    # Compute HMAC-SHA256
    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        import sys
        print(f"[AUTH] Hash mismatch. Computed: {computed_hash}, Received: {received_hash}", file=sys.stderr)
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
