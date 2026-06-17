import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
BASELINE_FILE = DATA_DIR / "baseline.json"

# Create directories if they do not exist
DATA_DIR.mkdir(parents=True, exist_ok=True)

class Settings:
    def __init__(self):
        self._gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        self.default_model = os.environ.get("DEFAULT_MODEL", "gemini-2.5-flash")
    
    @property
    def gemini_api_key(self) -> str:
        # Check current env or fallback to dynamic set
        return self._gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
    
    @gemini_api_key.setter
    def gemini_api_key(self, value: str):
        self._gemini_api_key = value
        # Also set it in environment for libraries to pick up
        os.environ["GEMINI_API_KEY"] = value

    def load_baseline(self) -> dict:
        if not BASELINE_FILE.exists():
            # In case it gets deleted or is not yet initialized
            return {}
        try:
            with open(BASELINE_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading baseline: {e}")
            return {}

    def save_baseline(self, baseline_data: dict) -> bool:
        try:
            with open(BASELINE_FILE, "w") as f:
                json.dump(baseline_data, f, indent=2)
            return True
        except Exception as e:
            print(f"Error saving baseline: {e}")
            return False

settings = Settings()
