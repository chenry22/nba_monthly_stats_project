from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3
import pandas as pd
from pathlib import Path

app = Flask(__name__, static_folder='web', static_url_path='')
CORS(app)

@app.route('/')
def index():
    return send_from_directory('web', 'dashboard.html')

DB_PATH = Path("nba_stats.db")

def query_db(sql: str, params: tuple = ()) -> list[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(sql, params)
        return [dict(row) for row in cur.fetchall()]

def normalize_col(rows: list[dict], raw_key: str, score_key: str):
    """Min-max normalize a raw column into a 0-100 score in-place."""
    vals = [r[raw_key] for r in rows if r[raw_key] is not None]
    if not vals:
        return
    mn, mx = min(vals), max(vals)
    for r in rows:
        v = r.get(raw_key)
        if v is None:
            r[score_key] = None
        elif mx == mn:
            r[score_key] = 50.0
        else:
            r[score_key] = round((v - mn) / (mx - mn) * 100, 2)


@app.route("/api/players")
def list_players():
    rows = query_db("SELECT player_id, full_name, team_name, position FROM players ORDER BY full_name")
    return jsonify(rows)


@app.route("/api/player/<int:player_id>/career")
def career(player_id):
    rows = query_db("""
        SELECT
            ms.season, ms.year, ms.month, ms.games_played,
            ms.pts_pg, ms.ast_pg, ms.reb_pg, ms.stl_pg, ms.blk_pg, ms.tov_pg,
            ms.min_pg, ms.fga_pg, ms.fg_pct, ms.fg3a_pg, ms.fg3_pct,
            ms.fta_pg, ms.ft_pct,
            ms.ts_pct, ms.efg_pct, ms.ast_to_ratio, ms.usage_pct, ms.reb_pct,
            crs.scorer_raw, crs.playmaker_raw, crs.defender_raw
        FROM monthly_stats ms
        JOIN career_role_scores crs
            ON  crs.player_id = ms.player_id
            AND crs.season    = ms.season
            AND crs.month     = ms.month
            AND crs.year      = ms.year
        WHERE ms.player_id = ?
        ORDER BY ms.year, ms.month
    """, (player_id,))

    normalize_col(rows, "scorer_raw",    "scorer_score")
    normalize_col(rows, "playmaker_raw", "playmaker_score")
    normalize_col(rows, "defender_raw",  "defender_score")
    return jsonify(rows)


@app.route("/api/player/<int:player_id>/summary")
def summary(player_id):
    rows = query_db("""
        SELECT
            ms.pts_pg, ms.ast_pg, ms.reb_pg, ms.stl_pg, ms.blk_pg,
            ms.tov_pg, ms.min_pg, ms.ts_pct, ms.efg_pct, ms.ast_to_ratio,
            ms.usage_pct,
            crs.scorer_raw, crs.playmaker_raw, crs.defender_raw
        FROM monthly_stats ms
        JOIN career_role_scores crs
            ON  crs.player_id = ms.player_id
            AND crs.season    = ms.season
            AND crs.month     = ms.month
            AND crs.year      = ms.year
        WHERE ms.player_id = ?
        ORDER BY ms.year, ms.month
    """, (player_id,))

    n = len(rows)
    def avg(data, key):
        vals = [r[key] for r in data if r.get(key) is not None]
        return round(sum(vals) / len(vals), 4) if vals else None

    keys = ["pts_pg","ast_pg","reb_pg","stl_pg","blk_pg","tov_pg","min_pg",
            "ts_pct","efg_pct","ast_to_ratio","usage_pct",
            "scorer_raw","playmaker_raw","defender_raw"]

    early, late = rows[:n//2], rows[n//2:]
    return jsonify({
        "early": {k: avg(early, k) for k in keys},
        "late":  {k: avg(late,  k) for k in keys},
    })


@app.route("/api/leaderboard")
def leaderboard():
    role = request.args.get("role", "scorer")
    min_games = request.args.get('min_games', 0)
    score_col = {
        "scorer":    "crs.scorer_raw",
        "playmaker": "crs.playmaker_raw",
        "defender":  "crs.defender_raw",
    }.get(role, "crs.scorer_raw")

    rows = query_db(f"""
        SELECT
            p.full_name,
            ms.season, ms.month, ms.year, ms.games_played,
            ms.pts_pg, ms.ast_pg, ms.reb_pg, ms.stl_pg, ms.blk_pg,
            ms.fg_pct, ms.fg3_pct, ms.ft_pct,  ms.ts_pct,
            ms.ast_to_ratio, ms.tov_pg, ms.usage_pct,
            {score_col} AS raw_score
        FROM monthly_stats ms
        JOIN players p ON p.player_id = ms.player_id
        JOIN career_role_scores crs
            ON  crs.player_id = ms.player_id
            AND crs.season    = ms.season
            AND crs.month     = ms.month
            AND crs.year      = ms.year
        JOIN (
            SELECT player_id, season,
                   SUM(min_pg * games_played) AS total_min
            FROM monthly_stats
            GROUP BY player_id, season
        ) season_mins
            ON  season_mins.player_id = ms.player_id
            AND season_mins.season    = ms.season
        WHERE season_mins.total_min >= 200
            AND ms.games_played >= {min_games}
        ORDER BY raw_score DESC
        LIMIT 50
    """)
    return jsonify(rows)


if __name__ == "__main__":
    app.run(debug=True, port=5000)