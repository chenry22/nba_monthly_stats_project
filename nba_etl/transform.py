import pandas as pd
import numpy as np
from statistics import mode

def aggregate_monthly(df: pd.DataFrame, season: str) -> pd.DataFrame:
    """
    Group game-level logs by month and compute per-game averages.
    Input: raw game log DataFrame from extract.py
    Output: one row per (season, year, month)
    """
    if df.empty:
        return pd.DataFrame()

    # Rename columns to lowercase for cleanliness
    col_map = {
        "PTS": "pts", "REB": "reb", "AST": "ast",
        "STL": "stl", "BLK": "blk", "TOV": "tov",
        "MIN": "min", "FGA": "fga", "FGM": "fgm",
        "FG3A": "fg3a", "FG3M": "fg3m",
        "FTA": "fta", "FTM": "ftm", "MATCHUP" : 'match'
    }
    df = df.rename(columns=col_map)
    df['match'] = df['match'].map(lambda s : str(s).split(' ')[0])

    # Group by month
    grouped = df.groupby(["YEAR", "MONTH"]).agg(
        games_played=("pts", "count"), 
        team_name=('match', lambda teams : mode(teams)),
        pts=("pts", "mean"), reb=("reb", "mean"), ast=("ast", "mean"),
        stl=("stl", "mean"), blk=("blk", "mean"), 
        tov=("tov", "mean"), min=("min", "mean"),
        fga=("fga", "mean"), fgm=("fgm", "mean"),
        fg3a=("fg3a", "mean"), fg3m=("fg3m", "mean"),
        fta=("fta", "mean"), ftm=("ftm", "mean"),
    ).reset_index()

    grouped['fg_pct'] = np.where(
        grouped['fga'] > 0,
        (grouped['fgm'] / grouped['fga']).round(2),
        0
    )
    grouped['fg3_pct'] = np.where(
        grouped['fg3a'] > 0,
        (grouped['fg3m'] / grouped['fg3a']).round(2),
        0
    )
    grouped['ft_pct'] = np.where(
        grouped['fta'] > 0,
        (grouped['ftm'] / grouped['fta']).round(2),
        0
    )
    grouped["season"] = season
    return grouped


def compute_advanced(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add advanced stats columns to an aggregated monthly DataFrame.
    All formulas work on per-game averages.
    """
    # True Shooting % — accounts for 3s and free throws
    # Formula: PTS / (2 * (FGA + 0.44 * FTA))
    denom = 2 * (df["fga"] + 0.44 * df["fta"])
    df["ts_pct"] = np.where(denom > 0, df["pts"] / denom, 0.0)

    # Effective FG % — weights 3-pointers
    # Formula: (FGM + 0.5 * FG3M) / FGA
    df["efg_pct"] = np.where(
        df["fga"] > 0,
        (df["fgm"] + 0.5 * df["fg3m"]) / df["fga"],
        0.0
    )

    # Assist-to-Turnover ratio
    df["ast_to_ratio"] = np.where(
        df["tov"] > 0,
        df["ast"] / df["tov"],
        df["ast"]  # if no turnovers, use raw assists
    )

    # Usage estimate: % of possessions a player "uses"
    # Simplified (full formula needs team stats): (FGA + 0.44*FTA + TOV) / min
    df["usage_pct"] = np.where(
        df["min"] > 0,
        (df["fga"] + 0.44 * df["fta"] + df["tov"]) / df["min"],
        0.0
    )

    # Rebound contribution (boards per minute as a proxy)
    df["reb_pct"] = np.where(
        df["min"] > 0,
        df["reb"] / df["min"],
        0.0
    )
    return df


def _normalize(series: pd.Series, floor=0, ceiling=100) -> pd.Series:
    """Min-max normalize a series to [0, 100]. Safe with single-value series."""
    mn, mx = series.min(), series.max()
    if mx == mn:
        return pd.Series([50.0] * len(series), index=series.index)
    return floor + (series - mn) / (mx - mn) * ceiling


# roles are relative to the player at other points in their career
def compute_role_scores(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute three composite role scores (0–100 scale).

    SCORER:     weights pts, ts_pct, efg_pct, usage
    PLAYMAKER:  weights ast, ast_to_ratio, usage (negatively for ball-hog)
    DEFENDER:   weights stl, blk, reb (no direct steal/block rate without
                team data, so this is a proxy)

    Each dimension is normalized then blended.
    """

    # --- Scorer score ---
    # High pts, good efficiency, high usage = scorer
    df["_sc_pts"]    = _normalize(df["pts"])
    df["_sc_ts"]     = _normalize(df["ts_pct"])
    df["_sc_efg"]    = _normalize(df["efg_pct"])
    df["_sc_usage"]  = _normalize(df["usage_pct"])
    df["scorer_score"] = (
        0.40 * df["_sc_pts"] +
        0.25 * df["_sc_ts"] +
        0.20 * df["_sc_efg"] +
        0.15 * df["_sc_usage"]
    ).round(2)

    # --- Playmaker score ---
    # High ast, great ast/tov ratio, not wasteful
    df["_pm_ast"]    = _normalize(df["ast"])
    df["_pm_ratio"]  = _normalize(df["ast_to_ratio"])
    df["_pm_tov_inv"] = _normalize(-df["tov"])  # fewer TOV = better
    df["playmaker_score"] = (
        0.50 * df["_pm_ast"] +
        0.35 * df["_pm_ratio"] +
        0.15 * df["_pm_tov_inv"]
    ).round(2)

    # --- Defender score ---
    # Proxy only — stl + blk + boards (document this caveat)
    df["_def_stl"]   = _normalize(df["stl"])
    df["_def_blk"]   = _normalize(df["blk"])
    df["_def_reb"]   = _normalize(df["reb"])
    df["defender_score"] = (
        0.40 * df["_def_stl"] +
        0.35 * df["_def_blk"] +
        0.25 * df["_def_reb"]
    ).round(2)

    # Drop helper columns
    tmp_cols = [c for c in df.columns if c.startswith("_")]
    df.drop(columns=tmp_cols, inplace=True)
    return df


def transform(raw_df: pd.DataFrame, season: str) -> pd.DataFrame:
    """Full transform pipeline: aggregate → advanced → role scores."""
    monthly = aggregate_monthly(raw_df, season)
    if monthly.empty:
        return monthly
    monthly = compute_advanced(monthly)
    # monthly = compute_role_scores(monthly)
    return monthly