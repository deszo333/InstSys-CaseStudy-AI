import sys
from pathlib import Path

sys.path.append(Path(__file__).resolve().parent / 'utils' / 'LLM_model.py')

from LLM_model import AIAnalyst
print(f"Import Successfully")