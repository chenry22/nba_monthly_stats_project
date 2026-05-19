CREATE TABLE IF NOT EXISTS players (
    player_id   INTEGER PRIMARY KEY,
    full_name   TEXT NOT NULL,
    team_name   TEXT, 
    position    TEXT,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monthly_stats (
    player_id       INTEGER NOT NULL,
    season          TEXT NOT NULL,
    month           INTEGER NOT NULL,   -- 1-12
    year            INTEGER NOT NULL,
    team_name       TEXT,
    games_played    INTEGER,

    -- Simple stats (per-game averages for the month)
    pts_pg          REAL,
    reb_pg          REAL,
    ast_pg          REAL,
    stl_pg          REAL,
    blk_pg          REAL,
    tov_pg          REAL,
    min_pg          REAL,
    fga_pg          REAL,
    fg_pct          REAL,
    fg3a_pg         REAL,
    fg3_pct         REAL,
    fta_pg          REAL,
    ft_pct          REAL,

    -- Advanced stats
    ts_pct          REAL,   -- True Shooting %
    efg_pct         REAL,   -- Effective FG %
    ast_to_ratio    REAL,   -- Assist-to-Turnover ratio
    usage_pct       REAL,   -- Estimated usage rate (rough)
    reb_pct         REAL,   -- Rebound contribution

    FOREIGN KEY (player_id) REFERENCES players(player_id),
    UNIQUE(player_id, season, month, year)
);

CREATE INDEX IF NOT EXISTS idx_player_season
    ON monthly_stats(player_id, season);

CREATE VIEW IF NOT EXISTS career_role_scores AS
SELECT
    player_id, season, year, month,
    pts_pg, ast_pg, reb_pg,
    stl_pg, blk_pg,
    ts_pct, efg_pct, ast_to_ratio,
    
    -- Scorer: weighted composite before normalization
    (pts_pg * 0.60 + ts_pct * 100 * 0.2 + efg_pct * 100 * 0.10 + usage_pct * 100 * 0.2)
        AS scorer_raw,
    -- Playmaker
    (ast_pg * 0.50 + ast_to_ratio * 0.4 + (1.0 / MAX(tov_pg, 0.1)) * 0.1)
        AS playmaker_raw,
    -- Defender
    (stl_pg * 0.40 + blk_pg * 0.4 + reb_pg * 0.2)
        AS defender_raw
FROM monthly_stats;