import time
import pandas as pd
from nba_api.stats.static import players
from nba_api.stats.endpoints import (
    playergamelog, commonplayerinfo, playercareerstats
)

# nba_api rate-limits aggressively — always add delays
DELAY = 1.0  # seconds between requests

def search_player(name: str) -> dict | None:
    """Find a player by name. Returns first match or None."""
    results = players.find_players_by_full_name(name)
    if not results:
        print(f"No player found: {name}")
        return None
    return results[0]  # {'id': ..., 'full_name': ..., 'is_active': ...}

def get_player_info(player_id: int) -> dict:
    """Fetch bio info: team, position, etc."""
    time.sleep(DELAY)
    info = commonplayerinfo.CommonPlayerInfo(player_id=player_id)
    df = info.get_data_frames()[0]
    return {
        "player_id": player_id,
        "full_name": df["DISPLAY_FIRST_LAST"].iloc[0],
        "team_name": df["TEAM_NAME"].iloc[0],
        "position": df["POSITION"].iloc[0],
    }

def get_game_logs(player_id: int, season: str) -> pd.DataFrame:
    """
    Fetch every game log for a season.
    season format: "2022-23"
    Returns raw DataFrame with one row per game.
    """
    time.sleep(DELAY)
    log = playergamelog.PlayerGameLog(
        player_id=player_id,
        season=season,
        season_type_all_star="Regular Season"
    )
    df = log.get_data_frames()[0]
    if df.empty:
        return df

    # Parse the game date so we can group by month later
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], format="%b %d, %Y")
    df["MONTH"] = df["GAME_DATE"].dt.month
    df["YEAR"] = df["GAME_DATE"].dt.year
    return df

def get_all_seasons(player_id: int) -> list[str]:
    """Return a list of all seasons a player has stats for."""
    time.sleep(DELAY)
    career = playercareerstats.PlayerCareerStats(player_id=player_id)
    df = career.get_data_frames()[0]
    # Filter out TOT (totals row for traded players) and keep unique seasons
    seasons = df[df["TEAM_ID"] != 0]["SEASON_ID"].unique().tolist()
    return seasons