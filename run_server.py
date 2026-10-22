import os
import sys
import traceback
from pathlib import Path

# Force unbuffered output so logs stream immediately on cloud platforms like Render
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import uvicorn

if __name__ == "__main__":
    port_env = os.environ.get("PORT", "8000")
    try:
        port = int(port_env)
    except ValueError:
        port = 8000

    host = "0.0.0.0"
    print(f"--> [run_server] Launching Ward-Wise Backend on http://{host}:{port}...", flush=True)

    try:
        from backend.app.main import app
        print("--> [run_server] FastAPI app imported cleanly. Starting Uvicorn...", flush=True)
        uvicorn.run(app, host=host, port=port)
    except Exception as e:
        print("--> [run_server] Startup error:", flush=True)
        traceback.print_exc()
        sys.exit(1)
