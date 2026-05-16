"""Telegram WebApp initData validation.

Uses Telegram's Ed25519 third-party verification method.
No bot token required — only the bot ID and Telegram's public key.
"""

import os
import json
import time
import urllib.parse
import logging

logger = logging.getLogger("towerstack.auth")

# Try to import the validation library
try:
    from telegram_webapp_auth.auth import TelegramAuthenticator
    _HAS_LIB = True
except ImportError:
    _HAS_LIB = False


def _parse_auth_date(init_data: str) -> int | None:
    """Extract auth_date from init_data query string."""
    try:
        decoded = urllib.parse.unquote(init_data)
        params = urllib.parse.parse_qs(decoded, keep_blank_values=True)
        auth_date_str = params.get("auth_date", [None])[0]
        if auth_date_str:
            return int(auth_date_str)
    except Exception:
        pass
    return None


def validate_init_data(init_data: str, bot_token: str = "", max_age_seconds: int = 86400) -> dict | None:
    """
    Validate Telegram WebApp initData using Ed25519 third-party method.
    Returns parsed user dict if valid, None if invalid.
    """
    if not init_data:
        logger.warning("Auth failed: missing init_data")
        return None

    bot_id_str = os.environ.get("BOT_ID", "")
    if not bot_id_str:
        if bot_token:
            bot_id_str = bot_token.split(":")[0]
        else:
            logger.warning("Auth failed: no BOT_ID or bot_token")
            return None

    try:
        bot_id = int(bot_id_str)
    except (ValueError, TypeError):
        logger.warning(f"Auth failed: invalid BOT_ID ({bot_id_str})")
        return None

    # Validate auth_date BEFORE any validation method
    auth_date = _parse_auth_date(init_data)
    if auth_date is not None:
        if time.time() - auth_date > max_age_seconds:
            logger.warning(f"Auth failed: stale auth_date ({auth_date}, max_age={max_age_seconds}s)")
            return None
    else:
        logger.warning("Auth failed: no auth_date in init_data")
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
            logger.info(f"Auth OK (Ed25519): user_id={user.id}, username={user.username}")
            return {
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
            }
        except Exception as e:
            logger.warning(f"Ed25519 validation failed: {e}")
            return None

    # No library available and HMAC not enabled — reject
    if not _HAS_LIB and not hmac_enabled:
        logger.error("Auth failed: no Ed25519 library and HMAC disabled")
        return None

    # Full HMAC validation (legacy)
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
        logger.warning("Auth failed (HMAC): hash mismatch")
        return None

    user_data = params.get("user")
    if user_data:
        try:
            user = json.loads(user_data)
        except json.JSONDecodeError:
            return None
    else:
        user = {}

    logger.info(f"Auth OK (HMAC): user_id={user.get('id')}")
    return {
        "id": user.get("id"),
        "username": user.get("username"),
        "first_name": user.get("first_name"),
    }
