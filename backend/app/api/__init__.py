from fastapi import APIRouter
from .auth import router as auth_router
from .regions import router as regions_router
from .reports import router as reports_router
from .poles import router as poles_router
from .settings import router as settings_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(regions_router)
api_router.include_router(reports_router)
api_router.include_router(poles_router)
api_router.include_router(settings_router)

__all__ = ["api_router"]
