# backend/utils/run_admin_ai.py
import sys
import json
from pathlib import Path
import os

# Change the working directory to the project's root
os.chdir(Path(__file__).resolve().parents[1])

# Add the current directory to the system path
sys.path.append(str(Path(__file__).resolve().parent))

# --- Import the NEW AdminAnalyst ---
from ai_core import AdminAnalyst

def load_config(config_path: Path) -> dict:
    if not config_path.exists():
        print(f"❌ FATAL: Config file not found at {config_path.resolve()}")
        raise FileNotFoundError("Config file missing. Please create config/config.json.")
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)

def AIChart():
    """
    Initializes and runs the Admin Analyst.
    """
    config_path = Path("config/config.json")

    try:
        config = load_config(config_path)
    except FileNotFoundError:
        return

    print("\n🚀 Starting AI Admin Analyst...")

    # Create the AdminAnalyst instance
    admin_ai = AdminAnalyst(llm_config=config)

    # --- ADDED THIS LINE AS REQUESTED ---
    # This will print a sample doc to prove which DB it's connected to
    admin_ai.print_log_sample()
    # --- END OF ADDED LINE ---

    admin_ai.start_admin_analyst()

def main():
    """
    Initializes and runs the Admin Analyst.
    """
    config_path = Path("config/config.json")

    try:
        config = load_config(config_path)
    except FileNotFoundError:
        return

    print("\n🚀 Starting AI Admin Analyst...")

    # Create the AdminAnalyst instance
    admin_ai = AdminAnalyst(llm_config=config)

    # --- ADDED THIS LINE AS REQUESTED ---
    # This will print a sample doc to prove which DB it's connected to
    admin_ai.print_log_sample()
    # --- END OF ADDED LINE ---

    # Start the AI's interactive loop
    admin_ai.start_admin_analyst()

if __name__ == "__main__":
    main()