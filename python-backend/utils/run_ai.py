# backend/utils/run_ai.py
import sys
import json
import argparse
from pathlib import Path
import os
from utils.ai_core.analyst import AIAnalyst
from utils.ai_core.admin_analyst import AdminAnalyst

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
# Also add python-backend to sys.path so "utils" package can be resolved
sys.path.append(str(Path(__file__).resolve().parent.parent))
from utils.rbac_guard import apply_rbac_to_collections, resolve_allowed_collections, load_last_role_assign


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


def list_all_collections(config: dict, role: None, assign: str):
    """
    Return all collection names in the configured MongoDB database.
    Honors optional allow/deny lists:
      - config["collections_whitelist"]: list[str]
      - config["collections_blacklist"]: list[str]
    Falls back to a static list if discovery fails.
    """
    try:
        from pymongo import MongoClient  #type:ignore  lazy import to avoid hard dependency during tooling
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
        
        # Apply role-based filtering
        if role.lower() == "admin":
            # Admin can access all collections
            pass
        elif role.lower() == "teaching_faculty":
            # Teaching faculty can access collections related to their assigned courses
            allowed_collections = []
            for course in assign:
                course_lower = course.lower()
                allowed_collections.extend([c for c in discovered if course_lower in c.lower()])
            discovered = allowed_collections
        elif role.lower() == "guest":
            # Guest has limited access
            discovered = [c for c in discovered if "guest" in c.lower()]
        else:
            # Default: no access
            discovered = []

        # Apply optional whitelist/blacklist from config
        whitelist = set(config.get("collections_whitelist") or [])
        blacklist = set(config.get("collections_blacklist") or ["query_log", "sessions", "dynamic_examples", "pending_media"])

        if whitelist:
            discovered = [c for c in discovered if c in whitelist]
        if blacklist:
            discovered = [c for c in discovered if c not in blacklist]

        if not discovered:
            print("⚠️ No user collections discovered; falling back to static defaults.")
            return []

        return sorted(discovered)

    except Exception as e:
        print(f"⚠️ Could not discover collections from MongoDB: {e}")
        print("   Falling back to static defaults.")
        return []
    
def endpoint_connection(collection = []):
    
    """function connection to entrypoint API
    """
    config_path = Path("config/config.json")
    config = load_config(config_path)
    collection = list_all_collections(config, role=None, assign=None)
    
    return AIAnalyst(collections= collection, llm_config=config), AdminAnalyst(llm_config=config)

def main():
    """
    Initializes and runs the AI Analyst.
    """
    # CLI overrides for RBAC
    parser = argparse.ArgumentParser(description="Run AI Analyst with optional RBAC overrides")
    parser.add_argument("--role", dest="role", help="Override RBAC role (e.g., Admin, Guest, Teaching_Faculty, student)")
    parser.add_argument("-a", "--assign", dest="assigns", action="append", help="Override RBAC assign(s); use multiple -a for more (e.g., -a BSIT -a BSCS)")
    args, _ = parser.parse_known_args()

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
    base_root = Path(__file__).resolve().parents[1]  # project root
    collections = list_all_collections(config)
    print("\n🗂️  Discovered collections:", collections)

    # Apply RBAC filtering based on last_role_assign.json or CLI overrides
    if args.role or args.assigns:
        py_backend_dir = base_root / "python-backend"
        current_role, current_assign = load_last_role_assign(py_backend_dir)
        role = args.role or current_role
        assign = args.assigns if args.assigns else current_assign
        allowed = resolve_allowed_collections(collections, role, assign)
        dbg = {"role": role, "assign": assign}
    else:
        allowed, dbg = apply_rbac_to_collections(collections, base_root)

    print(f"👤 RBAC role: {dbg['role']}, assign: {dbg['assign']}")
    if not allowed:
        print("⚠️ RBAC produced no collections; the AI Analyst will use an empty set. Adjust role/assign or rules if needed.")
    collections = allowed
    print("✅ Collections after RBAC:", collections)

    print("\n🚀 Starting AI Analyst (now using MongoDB)...")

    # 4) Create the AI Analyst instance, providing all required arguments (lazy import to avoid hard dependency during RBAC-only checks)
    try:
        from ai_core import AIAnalyst  # type: ignore
    except Exception as e:
        print(f"ℹ️ Skipping AIAnalyst run due to import error: {e}")
        return 0

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
