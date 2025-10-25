# backend/utils/run_ai.py
import sys
import json
from pathlib import Path
import os
import subprocess

# --- Exception placeholder you can expand later --------------------------------
class CustomPlaceholderError(Exception):
    """
    Placeholder for future, more specific exceptions you want to raise.
    Replace usages of this with more concrete exception types as needed.
    """
    pass
# -------------------------------------------------------------------------------

# Change the working directory to the project's root
# This ensures that relative paths like "config/config.json" work correctly.
os.chdir(Path(__file__).resolve().parents[1])

# Add the current directory to the system path to allow importing AI.py
sys.path.append(str(Path(__file__).resolve().parent))

from ai_core import AIAnalyst


def load_config(config_path: Path) -> dict:
    if not config_path.exists():
        print(f"❌ FATAL: Config file not found at {config_path.resolve()}")
        # Keep a placeholder raise so callers can handle it differently if needed
        raise CustomPlaceholderError("Config file missing. Please create config/config.json.")
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_mongo_params(config: dict):
    """
    Resolve MongoDB connection params in this priority order:
      1) config["mongo_uri"], config["mongo_db"]
      2) ENV MONGO_URI, MONGO_DB
      3) (optional) very last-resort sensible defaults
    """
    mongo_uri = config.get("mongo_uri") or os.getenv("MONGO_URI")
    mongo_db = config.get("mongo_db") or os.getenv("MONGO_DB")

    if not mongo_uri or not mongo_db:
        # Last-resort defaults (safe to override)
        mongo_uri = mongo_uri or "mongodb://localhost:27017"
        mongo_db = mongo_db or "school_system"

    return mongo_uri, mongo_db


def list_all_collections(config: dict):
    """
    Return all collection names in the configured MongoDB database.
    Honors optional allow/deny lists:
      - config["collections_whitelist"]: list[str]
      - config["collections_blacklist"]: list[str]
    Falls back to a static list if discovery fails.
    """
    try:
        from pymongo import MongoClient  # lazy import to avoid hard dependency during tooling
    except Exception as e:
        print(f"⚠️ pymongo not available ({e}). Falling back to static collections.")
        return ["students_ccs", "schedules_ccs"]

    mongo_uri, mongo_db = get_mongo_params(config)

    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=4000)
        db = client[mongo_db]

        # Touch server to fail fast if unreachable
        _ = client.admin.command("ping")

        discovered = db.list_collection_names()

        # Filter out system/internal collections just in case
        discovered = [c for c in discovered if not c.startswith("system.")]

        # Apply optional whitelist/blacklist from config
        whitelist = set(config.get("collections_whitelist") or [])
        blacklist = set(config.get("collections_blacklist") or ["query_log", "sessions", "dynamic_examples", "pending_media"])

        if whitelist:
            discovered = [c for c in discovered if c in whitelist]
        if blacklist:
            discovered = [c for c in discovered if c not in blacklist]

        if not discovered:
            print("⚠️ No user collections discovered; falling back to static defaults.")
            return ["students_ccs", "schedules_ccs"]

        return sorted(discovered)

    except Exception as e:
        print(f"⚠️ Could not discover collections from MongoDB: {e}")
        print("   Falling back to static defaults.")
        return ["students_ccs", "schedules_ccs"]


def main():
    """
    Initializes and runs the AI Analyst.
    """
    config_path = Path("config/config.json")  # Use a relative path from the new working directory

    # 1) Load configuration
    try:
        config = load_config(config_path)
    except CustomPlaceholderError:
        # Already printed a helpful message in load_config; just stop gracefully.
        return

    # 2) Resolve execution mode
    execution_mode = config.get("execution_mode", "split")

    # 3) Discover all collections dynamically (with fallbacks)
    collections = list_all_collections(config)
    print("\n🗂️  MongoDB collections to be used:", collections)

    print("\n🚀 Starting AI Analyst (now using MongoDB)...")

    # 4) Create the AIAnalyst instance, providing all required arguments
    ai = AIAnalyst(collections=collections, llm_config=config, execution_mode=execution_mode)

    # 5) Start the AI's interactive loop
    if hasattr(ai, "start_ai_analyst"):
        try:
            ai.start_ai_analyst()
        except Exception as e:
            # Example usage of the placeholder exception; adapt as you narrow failure modes.
            raise CustomPlaceholderError(f"AIAnalyst failed to start: {e}") from e
    else:
        print("⚠️ AIAnalyst has no start_ai_analyst() method.")

if __name__ == "__main__":
    main()
