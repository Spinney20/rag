from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

# Async engine (for FastAPI endpoints and async Celery tasks)
async_engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=5,
    pool_timeout=30,
    pool_recycle=1800,  # Recycle connections after 30 min
    echo=False,
)
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Sync engine (for Alembic migrations and sync Celery tasks)
sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    pool_size=5,
    echo=False,
)
SyncSessionLocal = sessionmaker(sync_engine)
