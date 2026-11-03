import sys
from pathlib import Path

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Also add backend to sys.path in case running directly from backend
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from backend.app.database import SessionLocal
    from backend.app.services.seed_service import seed_bbmp_hierarchy, BBMP_HIERARCHY
except ImportError:
    from app.database import SessionLocal
    from app.services.seed_service import seed_bbmp_hierarchy, BBMP_HIERARCHY

def seed_bbmp():
    db = SessionLocal()
    try:
        seed_bbmp_hierarchy(db)
    finally:
        db.close()

if __name__ == "__main__":
    seed_bbmp()
