from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import engine, Base
from .api import api_router
from . import models  # Ensures all models are registered

app = FastAPI(
    title="Ward-Wise Pole Management & Connectivity API",
    description="Standalone Full-Stack Dashboard Backend for Excel Report Management and Interactive Leaflet Pole Mapping",
    version="1.0.0"
)

@app.on_event("startup")
def on_startup():
    """Initialize database tables safely after server port binding and auto-seed initial users if needed."""
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables initialized successfully.", flush=True)

        from .database import SessionLocal
        from .models.user import User
        from .services.auth_service import get_password_hash
        from .models.region import Region

        db = SessionLocal()
        try:
            # Auto-seed admin user if missing
            if not db.query(User).filter(User.username == "admin").first():
                db.add(User(
                    username="admin",
                    password_hash=get_password_hash("Admin@12345"),
                    role="admin",
                    is_active=True
                ))
                print("Default admin user created: admin / Admin@12345", flush=True)

            # Auto-seed operator user if missing
            if not db.query(User).filter(User.username == "operator").first():
                db.add(User(
                    username="operator",
                    password_hash=get_password_hash("User@12345"),
                    role="user",
                    is_active=True
                ))
                print("Default operator user created: operator / User@12345", flush=True)

            db.commit()

            # Auto-seed BBMP hierarchy if regions are empty
            if db.query(Region).count() == 0:
                print("Empty database detected. Seeding BBMP hierarchy...", flush=True)
                try:
                    from ..seed_bbmp import seed_bbmp
                    seed_bbmp()
                except Exception as se:
                    print(f"Notice: Hierarchy auto-seed deferred: {se}", flush=True)
        finally:
            db.close()

    except Exception as e:
        print(f"Notice: Deferred DB init: {e}", flush=True)


# CORS configuration
configured_origins = [orig.strip() for orig in settings.FRONTEND_ORIGIN.split(",") if orig.strip()]
origins = list(set(configured_origins + [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)

app.include_router(api_router)

@app.get("/api/health", tags=["System"])
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Ward-Wise Pole Management Backend",
        "storage_root": settings.STORAGE_ROOT,
        "database": "PostgreSQL 18"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
