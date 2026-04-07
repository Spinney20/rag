from fastapi import APIRouter

from app.api.health import router as health_router
from app.api.projects import router as projects_router
from app.api.documents import router as documents_router
from app.api.requirements import router as requirements_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(projects_router)
api_router.include_router(documents_router)
api_router.include_router(requirements_router)
