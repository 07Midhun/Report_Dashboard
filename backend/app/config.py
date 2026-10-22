import os
from pathlib import Path
# Root project paths
BACKEND_DIR = Path(__file__).resolve().parent.parent
BASE_DIR = BACKEND_DIR.parent
DEFAULT_STORAGE_ROOT = str(BASE_DIR / "storage")

class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+psycopg2://postgres@127.0.0.1:5432/schnell_dashboard"
    )
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY", 
        "schnell-pole-management-super-secret-jwt-key-32charsmin-2026"
    )
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    STORAGE_ROOT: str = os.getenv("STORAGE_ROOT", DEFAULT_STORAGE_ROOT)
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

settings = Settings()

# Ensure base storage directory exists
Path(settings.STORAGE_ROOT).mkdir(parents=True, exist_ok=True)
