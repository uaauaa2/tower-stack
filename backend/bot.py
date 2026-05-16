"""Telegram bot webhook handler.

Replies to any message with a welcome text and Play button.
"""

import json


async def handle_update(update: dict, bot_token: str, webapp_url: str):
    """Process a single Telegram update."""
    message = update.get("message")
    if not message:
        return {"ok": True}

    chat_id = message["chat"]["id"]

    return {
        "method": "sendMessage",
        "chat_id": chat_id,
        "text": (
            "🏗️ <b>Welcome to Tower Stack!</b>\n\n"
            "Stack blocks as high as you can!\n"
            "Perfect timing = combos & bonus points.\n\n"
            "Tap the button below to play 👇"
        ),
        "parse_mode": "HTML",
        "reply_markup": json.dumps({
            "inline_keyboard": [[{
                "text": "▶ Play Tower Stack",
                "web_app": {"url": webapp_url},
            }]],
        }),
    }
