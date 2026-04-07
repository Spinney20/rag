from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings
from app.core.logging import setup_logging, get_logger
from app.database import async_engine

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Starting RAG Checker API")
    # Startup: create shared Redis pool
    app.state.redis = aioredis.from_url(settings.REDIS_URL)
    logger.info("RAG Checker API ready")
    yield
    # Shutdown: cleanup
    logger.info("Shutting down RAG Checker API")
    await app.state.redis.aclose()
    await async_engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title="RAG Checker",
    description="Verificare conformitate propuneri tehnice constructii",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
