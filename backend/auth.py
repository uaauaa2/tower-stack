"""Telegram WebApp initData validation.

Uses Telegram's Ed25519 third-party verification method.
No bot token required — only the bot ID and Telegram's public key.
"""

import os
import json
import time
import urllib.parse

# Try to import the validation library
try:
    from telegram_webapp_auth.auth import TelegramAuthenticator
    _HAS_LIB = True
except ImportError:
    _HAS_LIB = False


def validate_init_data(init_data: str, bot_token: str = "", max_age_seconds: int = 86400) -> dict | None:
    """
    Validate Telegram WebApp initData using Ed25519 third-party method.
    Returns parsed user dict if valid, None if invalid.
    """
    import sys as _sys

    if not init_data:
        print("[AUTH] FAIL: missing init_data", file=_sys.stderr)
        return None

    bot_id_str = os.environ.get("BOT_ID", "")
    if not bot_id_str:
        # Extract bot ID from token (everything before the colon)
        if bot_token:
            bot_id_str = bot_token.split(":")[0]
        else:
            print("[AUTH] FAIL: no BOT_ID or bot_token", file=_sys.stderr)
            return None

    try:
        bot_id = int(bot_id_str)
    except (ValueError, TypeError):
        print(f"[AUTH] FAIL: invalid BOT_ID ({bot_id_str})", file=_sys.stderr)
        return None

    hmac_enabled = os.environ.get("HMAC_VALIDATE", "true").lower() != "false"

    if _HAS_LIB and not hmac_enabled:
        # Use Ed25519 third-party validation (preferred, no bot token needed)
        try:
            auth = TelegramAuthenticator(secret=b"")  # dummy, not used for third-party
            result = auth.validate_third_party(
                init_data=init_data,
                bot_id=bot_id,
            )
            user = result.user
            print(f"[AUTH] OK (Ed25519): user_id={user.id}, username={user.username}", file=_sys.stderr)
            return {
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
            }
        except Exception as e:
            print(f"[AUTH] Ed25519 FAIL: {e}", file=_sys.stderr)
            return None

    # No library available and HMAC not enabled — reject
    if not _HAS_LIB and not hmac_enabled:
        print("[AUTH] FAIL: no Ed25519 library and HMAC disabled — cannot validate", file=_sys.stderr)
        return None

    # Full HMAC validation (legacy, currently broken)
    import hashlib
    import hmac as _hmac

    if not bot_token:
        return None

    try:
        decoded = urllib.parse.unquote(init_data)
        params = urllib.parse.parse_qs(decoded, keep_blank_values=True)
        params = {k: v[0] for k, v in params.items()}
    except Exception:
        return None

    received_hash = params.pop("hash", None)
    params.pop("signature", None)

    auth_date = params.get("auth_date")
    if auth_date:
        try:
            if time.time() - int(auth_date) > max_age_seconds:
                return None
        except (ValueError, TypeError):
            return None

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    secret_key = _hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed_hash = _hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not received_hash or not _hmac.compare_digest(computed_hash, received_hash):
        print("[AUTH] FAIL: hash mismatch", file=_sys.stderr)
        return None

    user_data = params.get("user")
    if user_data:
        try:
            user = json.loads(user_data)
        except json.JSONDecodeError:
            return None
    else:
        user = {}

    print(f"[AUTH] OK (HMAC): user_id={user.get('id')}", file=_sys.stderr)
    return {
        "id": user.get("id"),
        "username": user.get("username"),
        "first_name": user.get("first_name"),
    }
