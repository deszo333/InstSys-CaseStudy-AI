# File: backend/utils/ai_core/training.py

"""
This module contains the TrainingSystem class, responsible for logging
and analyzing AI performance data over time using a MongoDB collection.
"""

from datetime import datetime
from typing import Optional, List
from collections import Counter
from pymongo.database import Database
from pymongo.errors import CollectionInvalid

class TrainingSystem:
    """
    [UPGRADED] Manages the collection and analysis of query data to improve AI performance.
    It logs detailed turn data to a capped MongoDB collection for real-time analysis.
    """
    def __init__(self, mongo_db: Database, collection_name: str = "query_log", max_size_bytes: int = 100 * 1024 * 1024):
        """
        Initializes the training system with a connection to MongoDB.

        Args:
            mongo_db: An active pymongo.database.Database instance.
            collection_name: The name of the collection to use for logging (defaults to "query_log").
            max_size_bytes: The maximum size of the capped collection in bytes (defaults to 100MB).
        """
        self.db = mongo_db
        self.log_collection_name = collection_name
        
        try:
            # A capped collection is perfect for logs: fixed-size, high-throughput, and maintains insertion order.
            self.log_collection = self.db.create_collection(
                self.log_collection_name, 
                capped=True, 
                size=max_size_bytes
            )
            print(f"✅ Created new capped MongoDB collection for logging: '{self.log_collection_name}'")
        except CollectionInvalid:
            # This error means the collection already exists, which is the expected state after the first run.
            self.log_collection = self.db.get_collection(self.log_collection_name)
            print(f"📚 Using existing MongoDB collection for logging: '{self.log_collection_name}'")

    # NOTE: _load_training_data() and _save_training_data() are now obsolete and have been removed.
    
    def record_query_result(self, query: str, plan: dict, results_count: int,
                            execution_time: float, error_msg: str = None,
                            execution_mode: str = "unknown", outcome: str = "FAIL_UNKNOWN",
                            analyst_mode: str = "unknown", final_answer: str = "",
                            corruption_details: Optional[List[str]] = None):
        """
        [UPGRADED] Records the outcome of a single query as a document directly into MongoDB.
        """
        record = {
            "query": query,
            "plan": plan,
            "outcome": outcome,
            "analyst_mode": analyst_mode,
            "execution_mode": execution_mode,
            "results_count": results_count,
            "execution_time": round(execution_time, 4),
            "timestamp": datetime.now(),  # Using native BSON datetime is better for querying
            "final_answer": final_answer,
            "error_message": error_msg,
            "corruption_details": corruption_details
        }
        # Insert the document directly into the MongoDB collection.
        self.log_collection.insert_one(record)

    def get_training_insights(self) -> str:
        """
        [UPGRADED] Generates a summary by running an efficient aggregation query on the MongoDB log collection.
        """
        total_queries = self.log_collection.count_documents({})
        if total_queries == 0:
            return "No training data recorded yet in the database."

        # Use an aggregation pipeline to count outcomes directly in the database, which is highly efficient.
        pipeline = [
            { "$group": { "_id": "$outcome", "count": { "$sum": 1 } } },
            { "$sort": { "count": -1 } }
        ]
        results = list(self.log_collection.aggregate(pipeline))
        
        outcome_counts = {item['_id']: item['count'] for item in results}
        
        direct_success_count = outcome_counts.get("SUCCESS_DIRECT", 0)
        direct_success_rate = (direct_success_count / total_queries) * 100 if total_queries > 0 else 0
        
        insights = [
            f"Training Summary (from {total_queries} logged queries in MongoDB):",
            f"  - Direct Success Rate (Primary tools worked): {direct_success_rate:.1f}%",
            "",
            "Detailed Outcome Breakdown:"
        ]
        
        outcome_descriptions = {
            "SUCCESS_DIRECT": "Primary tool succeeded.",
            "SUCCESS_FALLBACK": "Primary tool failed, but fallback search found results.",
            "FAIL_EMPTY": "Tool and fallback ran correctly but found no data.",
            "FAIL_PLANNER": "AI Planner failed to choose a tool.",
            "FAIL_EXECUTION": "An unexpected error occurred during tool execution.",
            "FAIL_UNKNOWN": "An unknown failure occurred.",
            "SUCCESS_CONVERSATIONAL": "A conversational query was handled directly."
        }

        for outcome, count in outcome_counts.items():
            percentage = (count / total_queries) * 100
            description = outcome_descriptions.get(outcome, "No description.")
            insights.append(f"   - {outcome}: {count} queries ({percentage:.1f}%) - {description}")
            
        return "\n".join(insights)