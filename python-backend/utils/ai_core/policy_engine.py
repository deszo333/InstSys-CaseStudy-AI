# backend/utils/ai_core/policy_engine.py

import re
import copy
import spacy # <-- Import spacy
from typing import List, Dict, Any

class PolicyEngine:
    """
    [HYBRID VERSION] Uses a combination of regex for simple, domain-specific
    entities and a SpaCy NLP model for robust person name recognition.
    """
    def __init__(self, known_programs: List[str]):
        self.known_programs = {p.lower() for p in known_programs}
        
        # Load the small English SpaCy model.
        # This happens once when the AIAnalyst starts.
        try:
            self.nlp = spacy.load("en_core_web_sm")
            print("✅ SpaCy NLP model ('en_core_web_sm') loaded successfully for PolicyEngine.")
        except OSError:
            print("❌ SpaCy model not found. Please run: python -m spacy download en_core_web_sm")
            self.nlp = None

    # In policy_engine.py

    def delexicalize(self, query: str, plan: Dict[str, Any]) -> Dict[str, Any]:
        user_pattern = query
        plan_template = copy.deepcopy(plan)
        params = plan_template.get("parameters", {})

        # --- Phase 1: Use Regex for simple, predictable entities ---
        # 1. Replace known programs
        for prog in self.known_programs:
            prog_pattern = re.compile(r'\b' + re.escape(prog) + r'\b', re.IGNORECASE)
            if prog_pattern.search(user_pattern):
                user_pattern = prog_pattern.sub('{PROGRAM}', user_pattern)
            for key, value in params.items():
                if isinstance(value, str) and prog_pattern.search(value):
                    params[key] = '{PROGRAM}'

        # --- START OF NEWLY ADDED BLOCK ---
        # 2. Replace year levels (e.g., "2", "3rd year")
        year_pattern = re.compile(r'\b\d(?:st|nd|rd|th)?\s*year\b|\b\d\b', re.IGNORECASE)
        if year_pattern.search(user_pattern):
            user_pattern = year_pattern.sub('{YEAR}', user_pattern)
        for key, value in params.items():
            # Check for the specific parameter name and that it has a value
            if key == "year_level" and value:
                params[key] = '{YEAR}'
        # --- END OF NEWLY ADDED BLOCK ---

        # --- Phase 2: Use SpaCy for robust Person Name Recognition ---
        if self.nlp:
            doc = self.nlp(user_pattern)
            for ent in doc.ents:
                if ent.label_ == "PERSON":
                    user_pattern = user_pattern.replace(ent.text, '{PERSON_NAME}')

        for key, value in params.items():
            if "name" in key and isinstance(value, str) and value:
                params[key] = '{PERSON_NAME}'
        
        return {
            "user_pattern": user_pattern,
            "plan_template": plan_template
        }

    