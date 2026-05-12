"""Telegram bot command handlers.

Processes incoming updates via webhook.
"""

import json
from database import get_db, get_leaderboard, get_player_stats


def format_leaderboard_text(entries: list, title: str) -> str:
    """Format leaderboard entries as Telegram-friendly text."""
    lines = [f"🏆 <b>{title}</b>\n"]
    medals = ["🥇", "🥈", "🥉"]
    for e in entries[:10]:
        medal = medals[e["rank"] - 1] if e["rank"] <= 3 else f"  {e['rank']}."
        lines.append(f"{medal} <b>{e['username']}</b> — {e['score']:,} pts ({e['height']} floors)")
    lines.append("\n🎮 Play now: /play")
    return "\n".join(lines)


def format_stats_text(stats: dict) -> str:
    """Format player stats as Telegram-friendly text."""
    lines = [
        f"📊 <b>Your Stats</b>\n",
        f"Games: <b>{stats['total_games']}</b>",
        f"Best score: <b>{stats['best_score']:,}</b>",
        f"Highest tower: <b>{stats['best_height']}</b> floors",
        f"Best combo: <b>×{stats['best_combo']}</b>",
        f"Avg score: {stats['avg_score']:,}",
        f"Avg height: {stats['avg_height']} floors",
        f"Total perfects: {stats['total_perfects']}",
        f"Playtime: {stats['total_playtime_min']} min",
        f"Rank: <b>#{stats['rank']}</b>",
    ]
    if stats["achievements"]:
        lines.append(f"\n🏅 Achievements: {len(stats['achievements'])}")
    lines.append("\n🎮 Play now: /play")
    return "\n".join(lines)


async def handle_update(update: dict, bot_token: str, webapp_url: str):
    """Process a single Telegram update."""
    message = update.get("message")
    if not message:
        return {"ok": True}

    text = message.get("text", "").strip()
    chat_id = message["chat"]["id"]
    from_user = message.get("from", {})
    telegram_id = from_user.get("id")

    if text == "/play":
        return {
            "method": "sendMessage",
            "chat_id": chat_id,
            "text": "🎮 <b>Tower Stack</b>\nClick to play!",
            "parse_mode": "HTML",
            "reply_markup": json.dumps({
                "inline_keyboard": [[{
                    "text": "▶ Play Tower Stack",
                    "web_app": {"url": webapp_url},
                }]],
            }),
        }

    elif text == "/top":
        conn = get_db()
        try:
            entries = get_leaderboard(conn, "all", 5)
            text_out = format_leaderboard_text(entries, "Tower Stack Leaderboard")
        finally:
            conn.close()
        return {
            "method": "sendMessage",
            "chat_id": chat_id,
            "text": text_out,
            "parse_mode": "HTML",
        }

    elif text == "/stats":
        if not telegram_id:
            return {
                "method": "sendMessage",
                "chat_id": chat_id,
                "text": "❌ Could not identify your account.",
            }
        conn = get_db()
        try:
            from database import upsert_player
            player_id = upsert_player(conn, telegram_id, from_user.get("username"), from_user.get("first_name"))
            stats = get_player_stats(conn, player_id)
            stats["username"] = from_user.get("username") or from_user.get("first_name", f"Player #{telegram_id}")
            text_out = format_stats_text(stats)
        finally:
            conn.close()
        return {
            "method": "sendMessage",
            "chat_id": chat_id,
            "text": text_out,
            "parse_mode": "HTML",
        }

    elif text == "/start":
        return {
            "method": "sendMessage",
            "chat_id": chat_id,
            "text": "🏗️ <b>Welcome to Tower Stack!</b>\n\n"
                    "/play — Launch game\n"
                    "/top — Leaderboard\n"
                    "/stats — Your stats",
            "parse_mode": "HTML",
        }

    return {"ok": True}
