# NBA Career Lab

(Editor's Note: This is a little generative AI experiment where I worked with Claude AI to create a simple data pipeline and lightweight frontend. Much of this code was originally AI generated and I mainly edited things in different places as I saw fit. This README is also an edited version of an AI generated response)

A local data engineering project that builds an ETL pipeline on top of the NBA Stats API, stores player career data in a PostgreSQL database, and serves it through a Flask app.

Tracks simple, advanced, and custom role-based stats (scorer / playmaker / defender) aggregated by month across a player's full career, so you can visualize how a player's role and performance evolved over time.

---

## What it demonstrates

- End-to-end ETL pipeline (extract → transform → load) in Python
- REST API rate-limit handling and retry patterns
- Relational database design with views and indexes
- Custom composite metric design and career-relative normalization
- Flask REST API with upsert patterns
- Development cycle using Claude AI to speed things up and streamline processes

---

## Project structure

```
project/
├── nba_etl/  
    ├── extract.py          # Pull raw data from nba_api
    ├── transform.py        # Aggregate, compute advanced + role stats
    └── load.py             # Write to PostgreSQL (upsert)
├── pipeline.py         # Orchestrates extract → transform → load
├── app.py              # Flask app
├── schema.sql          # Database schema and career_role_scores view
├── requirements.txt
└── web/                # Static HTML dashboard
    ├── dashboard.html
    ├── style.css
    └── main.js
```

---

## Prerequisites

- Python 3.10+
- PostgreSQL 14+ installed and running locally
- pip

---

## Local setup

### 1 — Clone and install dependencies

```bash
git clone https://github.com/you/nba-etl.git
cd nba-etl
pip install -r requirements.txt
```

### 2 — Run the pipeline

Edit the player list at the top of `pipeline.py`:

```python
players = [
    "LeBron James",
    "Stephen Curry",
    "Nikola Jokic",
    "Giannis Antetokounmpo",
]
```

Then run:

```bash
python3 pipeline.py
```

This pulls every season of game logs for each player, aggregates by month, computes all stats, and loads into PostgreSQL. Expect a few minutes per player— `nba_api` hits real NBA.com endpoints that rate-limit aggressively, so delays between requests are intentional.

### 3 — Start the Flask API

```bash
python3 app.py
```


### 4 — Launch the dashboard

With Flask running, open `http://127.0.0.1:5000` directly in your browser. Your current database of players will be shown and can be interacted with (this will only show players you have already requested data of using `pipeline.py`)

---

## Data pipeline

### Overview

```
nba_api (NBA.com)
    │
    ▼
Extract          pull game logs per player per season
    │
    ▼
Transform        aggregate to monthly summaries
                 compute advanced stats
                 compute role score components
    │
    ▼
Load             upsert into PostgreSQL
                 (safe to re-run — no duplicates)
    │
    ▼
career_role_scores view
                 normalizes role scores across full career at query time
```

### Role score normalization

Role scores are **not** stored in the database. The `career_role_scores` view stores raw composite values. Normalization happens at query time in `app.py` using min-max scaling across all months in a player's career:

```
score = (raw - career_min) / (career_max - career_min) × 100
```

A score of 85 means that month was in the 85th percentile of that player's entire career for that role — not a comparison against other players. This means adding new seasons automatically rescales all historical scores, which is the correct behavior for a career progression tool.

---

## API endpoints

All endpoints served by Flask at `http://127.0.0.1:5000`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/players` | All players in the database |
| GET | `/api/player/<id>/career` | Full monthly career stats + role scores |
| GET | `/api/player/<id>/summary` | Early vs late career averages |
| GET | `/api/leaderboard?role=scorer&min_games=0` | Top 50 months by role (scorer / playmaker / defender), optionally filtered by a games played minimum |

Leaderboard filters to months where the player logged ≥ 200 total minutes in that season, to exclude small-sample outliers.

---

## Database schema

```sql
players
  player_id   PK
  full_name
  team_name
  position
  updated_at

monthly_stats
  player_id   FK → players
  season          e.g. "2022-23"
  month           1–12
  year
  team_name
  games_played
  -- per-game averages
  pts_pg, reb_pg, ast_pg, stl_pg, blk_pg, tov_pg, min_pg
  fga_pg, fg_pct, fg3a_pg, fg3_pct, fta_pg, ft_pct
  -- advanced
  ts_pct, efg_pct, ast_to_ratio, usage_pct, reb_pct
  UNIQUE (player_id, season, month, year)

career_role_scores  (VIEW)
  -- scorer_raw, playmaker_raw, defender_raw
```

---

## Known limitations

- **Defender score is a proxy.** It uses STL, BLK, and REB since defensive metrics like DRTG and contested shots require team-level data not available per-game from `nba_api`. This is documented intentionally — it's a good conversation starter about data availability constraints.
- **Usage % is estimated.** The true NBA usage rate formula requires team field goal attempts and team minutes, which `nba_api` doesn't expose at the game-log level. The estimate is `(FGA + 0.44×FTA + TOV) / MIN`.
- **Role scores are intra-player only.** A defender score of 90 for a center and a guard are not directly comparable — each is relative to that player's own career. Cross-player normalization would require pulling all players at once and rescaling globally.
- **nba_api rate limits.** NBA.com throttles requests. If the pipeline fails mid-run, re-running is safe — it will upsert whatever it already loaded and continue from where the API allows.
