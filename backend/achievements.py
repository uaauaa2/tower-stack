"""Achievement definitions and checking logic."""

ACHIEVEMENTS = {
    "first_game":    {"name": "First Steps",    "check": lambda g, s: s["total_games"] >= 1},
    "height_10":     {"name": "Getting Started", "check": lambda g, s: g["height"] >= 10},
    "height_25":     {"name": "Reaching High",   "check": lambda g, s: g["height"] >= 25},
    "height_50":     {"name": "Sky Scraper",     "check": lambda g, s: g["height"] >= 50},
    "combo_3":       {"name": "On Fire",         "check": lambda g, s: g["best_combo"] >= 3},
    "combo_5":       {"name": "Unstoppable",     "check": lambda g, s: g["best_combo"] >= 5},
    "combo_10":      {"name": "Perfect Machine", "check": lambda g, s: g["best_combo"] >= 10},
    "score_1000":    {"name": "Points!",         "check": lambda g, s: g["score"] >= 1000},
    "score_5000":    {"name": "High Roller",     "check": lambda g, s: g["score"] >= 5000},
    "score_10000":   {"name": "Legend",          "check": lambda g, s: g["score"] >= 10000},
    "games_10":      {"name": "Dedicated",       "check": lambda g, s: s["total_games"] >= 10},
    "games_50":      {"name": "Addicted",        "check": lambda g, s: s["total_games"] >= 50},
    "perfect_10":    {"name": "Sharp Eye",       "check": lambda g, s: g["perfect_count"] >= 10},
}


def check_achievements(conn, player_id: int, game_data: dict, stats: dict) -> list[str]:
    """
    Check and unlock new achievements for a player.
    Returns list of newly unlocked achievement keys.
    """
    # Get already unlocked
    existing = conn.execute(
        "SELECT key FROM achievements WHERE player_id = ?",
        (player_id,),
    ).fetchall()
    existing_keys = {r["key"] for r in existing}

    newly_unlocked = []
    for key, ach in ACHIEVEMENTS.items():
        if key in existing_keys:
            continue
        if ach["check"](game_data, stats):
            conn.execute(
                "INSERT INTO achievements (player_id, key) VALUES (?, ?)",
                (player_id, key),
            )
            newly_unlocked.append(key)

    return newly_unlocked


def get_achievement_name(key: str) -> str:
    """Get display name for an achievement key."""
    return ACHIEVEMENTS.get(key, {}).get("name", key)
