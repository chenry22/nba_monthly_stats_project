import sqlite3
import pandas as pd
from pathlib import Path

DB_PATH = Path("nba_stats.db")

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def initialize_db():
    """Create tables if they don't exist."""
    with get_connection() as conn:
        with open("schema.sql") as f:
            conn.executescript(f.read())

def upsert_player(player_info: dict):
    """Insert or update a player record."""
    sql = """
        INSERT INTO players (player_id, full_name, team_name, position)
        VALUES (:player_id, :full_name, :team_name, :position)
        ON CONFLICT(player_id) DO UPDATE SET
            team_name  = excluded.team_name,
            position   = excluded.position,
            updated_at = CURRENT_TIMESTAMP
    """
    with get_connection() as conn:
        conn.execute(sql, player_info)

def load_monthly_stats(player_id: int, monthly_df: pd.DataFrame):
    """
    Upsert monthly stats. Skips empty DataFrames.
    Uses ON CONFLICT to safely re-run the pipeline.
    """
    if monthly_df.empty:
        return

    monthly_df["player_id"] = player_id

    col_map = {
        "YEAR": "year", "MONTH": "month",
        "pts": "pts_pg", "reb": "reb_pg", "ast": "ast_pg",
        "stl": "stl_pg", "blk": "blk_pg", "tov": "tov_pg",
        "min": "min_pg", "fga": "fga_pg", "fg3a": "fg3a_pg", "fta": "fta_pg",
    }
    monthly_df = monthly_df.rename(columns=col_map)

    sql = """
        INSERT INTO monthly_stats (
            player_id, season, month, year, team_name, games_played,
            pts_pg, reb_pg, ast_pg, stl_pg, blk_pg, tov_pg, min_pg,
            fga_pg, fg_pct, fg3a_pg, fg3_pct, fta_pg, ft_pct,
            ts_pct, efg_pct, ast_to_ratio, usage_pct, reb_pct
        ) VALUES (
            :player_id, :season, :month, :year, :team_name, :games_played,
            :pts_pg, :reb_pg, :ast_pg, :stl_pg, :blk_pg, :tov_pg, :min_pg,
            :fga_pg, :fg_pct, :fg3a_pg, :fg3_pct, :fta_pg, :ft_pct,
            :ts_pct, :efg_pct, :ast_to_ratio, :usage_pct, :reb_pct
        )
        ON CONFLICT(player_id, season, month, year) DO UPDATE SET
            pts_pg         = excluded.pts_pg
    """
    with get_connection() as conn:
        conn.executemany(sql, monthly_df.to_dict(orient="records"))