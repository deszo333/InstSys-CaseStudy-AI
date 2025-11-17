# backend/utils/ai_core/admin_analyst.py

"""
Contains the AdminAnalyst class, which orchestrates the
AI reporting and log analysis feature.
"""

import json
import re
from pymongo import MongoClient
from typing import Optional, List, Dict
import pprint # For pretty printing
import os # <-- NEW IMPORT for creating directories/paths
try:
    import matplotlib.pyplot as plt # <-- NEW IMPORT for plotting
except ImportError:
    print("WARNING: matplotlib not found. To generate charts, please run: pip install matplotlib")
    plt = None

# Import the new components
from .admin_insights import AdminInsights
from .admin_prompts import ADMIN_PLANNER_PROMPT, ADMIN_SYNTHESIS_SYSTEM, ADMIN_SYNTHESIS_USER_TEMPLATE

# Import shared components
from .llm_service import LLMService

class AdminAnalyst:
    """
    Orchestrates the admin-facing AI. It uses an LLM to select
    an AdminInsights tool, executes it against the query_log,
    and synthesizes a report and chart data.
    """
    def __init__(self, llm_config: dict):
        """
        Initializes the Admin Analyst.
        
        Args:
            llm_config: The main config object, same as used by AIAnalyst.
        """
        # --- THIS IS THE CONNECTION LOGIC ---
        # It ONLY uses the 'mongodb' object in the config.
        mongo_cfg = llm_config.get("mongodb", {})
        mongo_connection_string = mongo_cfg.get("connection_string", "mongodb://localhost:27017/")
        mongo_db_name = mongo_cfg.get("database_name", "school_system")
        
        try:
            self.mongo_client = MongoClient(mongo_connection_string)
            self.mongo_db = self.mongo_client[mongo_db_name]
            # Connect to the query_log collection
            self.log_collection = self.mongo_db["query_log"]
            print(f"[OK] AdminAnalyst connected to MongoDB: '{mongo_connection_string}'")
        except Exception as e:
            print(f"[ERROR] AdminAnalyst failed to connect to MongoDB: {e}")
            raise
        # --- END OF CONNECTION LOGIC ---

        # Use the 'online' config for the admin, as it's a high-accuracy task
        config = llm_config.get('online', llm_config.get('offline', {}))
        config['api_mode'] = config.get('api_mode', 'online')
        self.debug_mode = config.get('debug_mode', False)

        self.planner_llm = LLMService(config)
        self.synth_llm = LLMService(config)
        
        # Instantiate the "tools" module
        self.insights = AdminInsights(self.log_collection)
        
        self.available_tools = {
            "get_most_frequent_field": self.insights.get_most_frequent_field,
            "get_system_health_stats": self.insights.get_system_health_stats,
            "get_tool_usage_report": self.insights.get_tool_usage_report,
        }
        
    def debug(self, *args):
        if self.debug_mode:
            print("[AdminAnalyst]", *args)

    def print_log_sample(self):
        """
        Fetches and prints one document from the connected query_log
        to verify the connection and schema.
        """
        print("\n" + "-"*70)
        print(f"🔎 Checking for data in '{self.mongo_db.name}/query_log'...")
        try:
            sample_doc = self.log_collection.find_one()
            if sample_doc:
                print("✅ Connection successful. Found 1 sample document:")
                pprint.pprint(sample_doc)
            else:
                print("⚠️ WARNING: Connection successful, but the 'query_log' collection is EMPTY.")
                print("   This is why your reports are empty.")
                print("   Please check your config.json to ensure this is the correct database.")
        except Exception as e:
            print(f"❌ ERROR: Could not fetch sample document from query_log: {e}")
        print("-" * 70 + "\n")

    def _repair_json(self, text: str) -> Optional[dict]:
        """
        Extracts a valid JSON object from a string.
        (Borrowed from AIAnalyst)
        """
        if not text: return None
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if not m: return None
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return None

    # --- NEW METHOD TO GENERATE THE CHART ---
    def _generate_chart_image(self, chart_data: list, query: Optional[str] , filename: str):
        """
        Generates and saves a horizontal bar chart from the chart_data.
        """
        # 1. Check if plotting is possible
        if plt is None:
            self.debug("Matplotlib not imported. Skipping chart generation.")
            return

        # 2. Validate the data
        if (not chart_data or 
            not isinstance(chart_data, list) or 
            not isinstance(chart_data[0], dict)):
            self.debug("No valid chart_data to plot.")
            return

        if "value" not in chart_data[0] or "count" not in chart_data[0]:
            self.debug("chart_data is missing 'value' or 'count' keys.")
            return
            
        try:
            # 3. Extract data for plotting
            # Take only top 15 for a clean chart
            top_data = chart_data[:15]
            labels = [d.get('value', 'N/A') for d in top_data]
            values = [d.get('count', 0) for d in top_data]

            # Reverse lists so the highest value is at the top
            labels.reverse()
            values.reverse()

            # 4. Create the plot
            fig, ax = plt.subplots(figsize=(10, max(6, len(labels) * 0.5))) # Dynamic height
            ax.barh(labels, values, color='#007bff')
            
            # Add value labels to the end of each bar
            for i, v in enumerate(values):
                ax.text(v + (max(values) * 0.01), i, str(v), va='center', color='grey')

            ax.set_xlabel("Query Count")
            # ax.set_title(f'Analysis for: "{query}"', loc='left', fontsize=14)
            ax.spines['top'].set_visible(False)
            ax.spines['right'].set_visible(False)
            plt.tight_layout()
            
            # 5. Save the file
            # Create a 'charts' directory if it doesn't exist
            output_dir = "charts"
            os.makedirs(output_dir, exist_ok=True)
            full_path = os.path.join(output_dir, filename)

            plt.savefig(full_path)
            plt.close(fig) # Close the figure to free up memory
            
            print(f"✅ Chart saved to '{full_path}'")

        except Exception as e:
            print(f"\n❌ ERROR: Failed to generate chart image: {e}")
            if "ImportError" in str(e):
                print("   Hint: Did you run 'pip install matplotlib'?")


    def execute_plan(self, query: str) -> dict:
        """
        Full end-to-end execution for an admin query.
        Returns a dict with 'report' and 'chart_data'.
        """
        self.debug(f"New admin query: '{query}'")
        
        try:
            # 1. PLANNER STEP
            self.debug("Calling Planner...")
            plan_raw = self.planner_llm.execute(
                system_prompt=ADMIN_PLANNER_PROMPT,
                user_prompt=query,
                json_mode=True,
                phase="planner"
            )
            
            plan_json = self._repair_json(plan_raw)
            if not plan_json or "tool_name" not in plan_json:
                raise ValueError(f"AdminPlanner failed to return valid JSON. Got: {plan_raw}")

            tool_name = plan_json.get("tool_name")
            params = plan_json.get("parameters", {})
            
            if tool_name not in self.available_tools:
                raise ValueError(f"AdminPlanner selected an unknown tool: '{tool_name}'")

            # 2. EXECUTION STEP
            self.debug(f"Executing tool: {tool_name} with params: {params}")
            tool_function = self.available_tools[tool_name]
            
            import inspect
            sig = inspect.signature(tool_function)
            final_params = {}
            for param in sig.parameters.values():
                if param.name in params:
                    final_params[param.name] = params[param.name]
                elif param.default is not inspect.Parameter.empty:
                    final_params[param.name] = param.default
            
            results = tool_function(**final_params)
            
            context_for_llm = json.dumps(results, indent=2)

            # 3. SYNTHESIZER STEP
            self.debug(f"Calling Synthesizer with {len(context_for_llm)} bytes of context.")
            synth_user_prompt = ADMIN_SYNTHESIS_USER_TEMPLATE.format(context=context_for_llm, query=query)
            
            final_report_raw = self.synth_llm.execute(
                system_prompt=ADMIN_SYNTHESIS_SYSTEM,
                user_prompt=synth_user_prompt,
                json_mode=True, # We explicitly ask for JSON
                phase="synth"
            )
            
            final_json_output = self._repair_json(final_report_raw)
            
            if not final_json_output or "report" not in final_json_output:
                self.debug(f"Synthesizer failed to return valid JSON. Got: {final_report_raw}")
                return {
                    "report": "AI Synthesizer failed. Returning raw data.",
                    "chart_data": results.get("data", []),
                    "raw_context": results
                }
            
            self.debug("Plan executed successfully.")
            return final_json_output

        except Exception as e:
            self.debug(f"Error in execute_plan: {e}")
            import traceback
            traceback.print_exc() # Print full error trace
            return {
                "report": f"An internal error occurred: {str(e)}",
                "chart_data": []
            }

    def start_admin_analyst(self):
        """Starts an interactive loop for the Admin Analyst."""
        print("\n" + "="*70)
        print("📊 AI ADMIN ANALYST (Log Analysis Tool)")
        print("   Type 'exit' to quit.")
        print("   Example: 'What are the top 5 most queried programs?'")
        print("="*70)
        
        while True:
            q = input("\nAdmin: ").strip()
            if not q: continue
            if q.lower() == "exit":
                print("Exiting Admin Analyst.")
                break
                
            response = self.execute_plan(q)
            
            print("\n--- AI Report ---")
            print(response.get("report"))
            print("-----------------")
            
            chart_data = response.get("chart_data", [])
            print(f"\n--- Chart Data ({len(chart_data)} items) ---")
            pprint.pprint(chart_data)
            print("-------------------------------")

            chart_filename = "admin_report_chart.png"

            self._generate_chart_image(chart_data, q, chart_filename)
