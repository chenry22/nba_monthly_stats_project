import time
from tqdm import tqdm
from nba_etl.extract import search_player, get_player_info, get_game_logs, get_all_seasons
from nba_etl.transform import transform
from nba_etl.load import get_connection, initialize_db, upsert_player, load_monthly_stats

players = [
    # "Keegan Murray", "Davion Mitchell", "Patrick Baldwin Jr.", 
    # "Maxime Raynaud", "Rob Dillingham", "Jared McCain"
    # "Jimmy Butler", "Shai Gilgeous-Alexander", "Jalen Brunson",
    # "Anthony Edwards", "Marcus Smart", "Jeremy Sochan",
    # "Keldon Johnson", "Darius Garland", "Rudy Gobert"
    # "Victor Wembanyama", "Zach Lavine", "Dario Saric",
    # "Michael Jordan", "Jevon Carter", "Giannis Antetokounmpo",
    # "Ja Morant",  "Tobias Harris",
    # "Cade Cunningham", "Kristaps Porzingis", "Jeremy Lin"
    # "Alex Caruso", "Zach Lavine", 
    # "Anthony Davis", "Cason Wallace", "Mikal Bridges",
    # "Aaron Gordon", "Jake Laravia", "Paolo Banchero",
    # "Tyrese Maxey", "Naz Reid", "Jalen Williams"
    # "De'Aaron Fox", "Karl Anthony-Towns", "Andrew Wiggins", 
    # "Greg Oden", "Harrison Barnes", "Nikola Jokic"
    # "Derrick White", "Steve Nash", "Tyus Jones",
    # "Luke Kornet", "Zion Williamson", "Mitchell Robinson",
    # "Joel Embiid", "Dylan Harper", "Derrick Jones Jr.",
    # "Luka Doncic", "Lebron James", "Tyrese Haliburton",
    # "Aaron Nesmith", "Jalen Johnson", "Dyson Daniels"
]

def run_pipeline(player_names: list[str]):
    """
    Main entry point. Pass a list of player names.
    Example: run_pipeline(["LeBron James", "Stephen Curry"])
    """
    get_connection().execute(
        '''
DROP VIEW career_role_scores'''
    )
    initialize_db()

    for name in player_names:
        print(f"\n=== Processing: {name} ===")

        # --- EXTRACT: find player ---
        player = search_player(name)
        if not player: continue
        player_id = player["id"]

        # --- EXTRACT: metadata ---
        info = get_player_info(player_id)
        upsert_player(info)

        # --- EXTRACT + TRANSFORM + LOAD: each season ---
        seasons = get_all_seasons(player_id)
        print(f"  Found {len(seasons)} seasons")

        for season in tqdm(seasons, desc=f"  {name} seasons"):
            raw_df = get_game_logs(player_id, season)
            if raw_df.empty:
                continue

            monthly_df = transform(raw_df, season)
            load_monthly_stats(player_id, monthly_df)
            time.sleep(0.5)  # extra courtesy delay between seasons

    print("\nPipeline complete.")


if __name__ == "__main__":
    run_pipeline(players)