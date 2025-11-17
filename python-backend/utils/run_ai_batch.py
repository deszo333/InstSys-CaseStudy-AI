
`# backend/utils/run_ai_batch.py
import sys
import json
from pathlib import Path
import os
import argparse  # Used for command-line arguments
import uuid      # Used to create a unique session ID

# --- Import all the setup functions from run_ai ---
# We reuse the existing, stable setup logic.
from run_ai import (
    CustomPlaceholderError,
    load_config,
    list_all_collections,
    get_mongo_params  # Make sure get_mongo_params is imported if run_ai.py has it
)

# Change the working directory to the project's root
# This ensures that relative paths like "config/config.json" work correctly.
try:
    os.chdir(Path(__file__).resolve().parents[1])
except Exception:
    print("Warning: Could not change directory. Assuming already in project root.")

# Add the current directory to the system path to allow importing AI.py
sys.path.append(str(Path(__file__).resolve().parent))

try:
    from ai_core.analyst import AIAnalyst
except ImportError:
    print("❌ FATAL: Could not import AIAnalyst. Make sure you are in the correct directory.")
    sys.exit(1)


def load_queries_json(file_path: Path) -> list[str]:
    """
    Loads a JSON file containing a list of query strings.
    """
    if not file_path.exists():
        print(f"❌ FATAL: Input query file not found at {file_path}")
        raise FileNotFoundError(f"Input file missing: {file_path}")
    
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        if not isinstance(data, list):
            raise ValueError("Input JSON must be a simple list of query strings.")
        
        # Filter out any non-string or empty items
        queries = [str(q) for q in data if isinstance(q, str) and q.strip()]
        return queries

def main():
    """
    Initializes the AI Analyst and runs it in batch mode from a JSON file.
    """
    # 1) Setup command-line argument parser
    parser = argparse.ArgumentParser(description="Run AI Analyst in batch mode from a JSON query file.")
    parser.add_argument("input_file", type=str, help="Path to the JSON file containing a list of queries.")
    args = parser.parse_args()

    # 2) Load configuration (reusing existing function)
    config_path = Path("config/config.json")
    try:
        config = load_config(config_path)
    except CustomPlaceholderError:
        return

    # 3) Load the list of queries from the specified JSON file
    try:
        input_path = Path(args.input_file).resolve()
        queries_to_run = load_queries_json(input_path)
    except Exception as e:
        print(f"❌ Error loading query file: {e}")
        return

    # 4) Initialize the AI Analyst (reusing existing logic)
    execution_mode = config.get("execution_mode", "split")
    collections = list_all_collections(config)
    print("\n🗂️  MongoDB collections to be used:", collections)
    print("\n🚀 Starting AI Analyst for BATCH RUN...")
    
    ai = AIAnalyst(collections=collections, llm_config=config, execution_mode=execution_mode)

    # 5) Create a single, unique session for this entire batch run
    session_id = f"batch_run_{uuid.uuid4()}"
    print(f"🔧 Running {len(queries_to_run)} queries in session: {session_id}")
    
    batch_results = []

    # 6) Run the queries one by one
    for i, query in enumerate(queries_to_run):
        print("\n" + "="*70)
        print(f"▶️  Query {i+1}/{len(queries_to_run)}")
        print(f"   You: {query}")
        print("="*70)
        
        try:
            # Use the web_start_ai_analyst method for non-interactive processing
            # This correctly uses the session and context management
            response_data = ai.web_start_ai_analyst(query, session_id)
            
            ai_response = response_data.get("ai_response", "Error: No 'ai_response' key in return data.")
            
            print(f"\nAnalyst: {ai_response}")
            batch_results.append({"query": query, "response": ai_response})

        except Exception as e:
            print(f"\nAnalyst (ERROR): Query failed catastrophically.")
            print(f"   Error: {e}")
            batch_results.append({"query": query, "response": f"ERROR: {e}"})

    # 7) Save the final results to a new JSON file
    output_filename = f"batch_results_{session_id}.json"
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(batch_results, f, indent=2)

    print("\n" + "="*70)
    print("✅ Batch run complete.")
    print(f"📜 All results saved to: {output_filename}")
    print("="*70)

if __name__ == "__main__":
    main()