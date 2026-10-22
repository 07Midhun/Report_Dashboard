from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import engine, Base
from .api import api_router
from . import models  # Ensures all models are registered

# Create database tables if needed
try:
    Base.metadata.create_all(bind=engine)
except Exception:
    pass

app = FastAPI(
    title="Ward-Wise Pole Management & Connectivity API",
    description="Standalone Full-Stack Dashboard Backend for Excel Report Management and Interactive Leaflet Pole Mapping",
    version="1.0.0"
)

# CORS configuration
origins = [
    settings.FRONTEND_ORIGIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
