import os
import sys
import time
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
    print(f"--> [run_server] Launching Ward-Wise Backend on {host}:{port}...", flush=True)

    try:
        t0 = time.time()
        print("--> [run_server] Step 1: Loading config...", flush=True)
        from backend.app.config import settings
        print(f"--> [run_server] Step 1 OK ({round(time.time() - t0, 3)}s)", flush=True)

        t0 = time.time()
        print("--> [run_server] Step 2: Initializing database engine...", flush=True)
        from backend.app.database import engine, Base
        print(f"--> [run_server] Step 2 OK ({round(time.time() - t0, 3)}s)", flush=True)

        t0 = time.time()
        print("--> [run_server] Step 3: Loading models...", flush=True)
        from backend.app import models
        print(f"--> [run_server] Step 3 OK ({round(time.time() - t0, 3)}s)", flush=True)

        t0 = time.time()
        print("--> [run_server] Step 4: Loading API routes...", flush=True)
        from backend.app.api import api_router
        print(f"--> [run_server] Step 4 OK ({round(time.time() - t0, 3)}s)", flush=True)

        t0 = time.time()
        print("--> [run_server] Step 5: Loading FastAPI app...", flush=True)
        from backend.app.main import app
        print(f"--> [run_server] Step 5 OK ({round(time.time() - t0, 3)}s)", flush=True)

        print(f"--> [run_server] Starting Uvicorn on {host}:{port} with auto-reload...", flush=True)
        uvicorn.run("backend.app.main:app", host=host, port=port, reload=True, log_level="info")

    except BaseException as e:
        print(f"--> [run_server] CRITICAL ERROR on startup: {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()
        sys.exit(1)
