import unittest
import sys
from pathlib import Path

if __name__ == "__main__":
    # Ensure python-backend is on path
    here = Path(__file__).resolve().parent
    sys.path.insert(0, str(here))

    suite = unittest.defaultTestLoader.discover(
        start_dir=str(here / "utils" / "tests"), pattern="test_*.py"
    )
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
