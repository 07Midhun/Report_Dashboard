import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import uvicorn
from backend.app.main import app

if __name__ == "__main__":
    print("Starting Ward-Wise Pole Management & Connectivity Backend on http://127.0.0.1:8000")
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
