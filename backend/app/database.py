"""Database engines and session factories — LAZY INIT (thread-safe).

Engines are created on first use, not at import time.
This allows the app to start and serve the setup page
even when DATABASE_URL is not yet configured (first run).
Thread-safe via threading.Lock for concurrent worker threads.
"""

import ssl
import threading

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_lock = threading.RLock()
_async_engine = None
_sync_engine = None
_AsyncSessionLocal = None
_SyncSessionLocal = None


def _get_async_connect_args() -> dict:
    """SSL args for asyncpg (Neon requires SSL)."""
    if settings.DATABASE_URL and "neon.tech" in settings.DATABASE_URL:
        return {"ssl": ssl.create_default_context()}
    return {}


def _get_sync_connect_args() -> dict:
    """SSL args for psycopg2 (Neon requires SSL)."""
    if settings.DATABASE_URL_SYNC and "neon.tech" in settings.DATABASE_URL_SYNC:
        return {"sslmode": "require"}
    return {}


def get_async_engine():
    """Lazy async engine — created on first call. Thread-safe."""
    global _async_engine
    if _async_engine is not None:
        return _async_engine
    with _lock:
        if _async_engine is not None:
            return _async_engine  # Double-check after acquiring lock
        from sqlalchemy.ext.asyncio import create_async_engine

        url = settings.DATABASE_URL
        if not url or url == "not_configured":
            raise RuntimeError("Database not configured. Complete setup at /setup first.")

        _async_engine = create_async_engine(
            url,
            pool_size=5,
            max_overflow=2,
            pool_timeout=30,
            pool_recycle=300,
            connect_args=_get_async_connect_args(),
            echo=False,
        )
        host = url.split("@")[-1].split("/")[0] if "@" in url else "local"
        logger.info("Async DB engine created: %s", host)
    return _async_engine


def get_sync_engine():
    """Lazy sync engine — for background threads. Thread-safe."""
    global _sync_engine
    if _sync_engine is not None:
        return _sync_engine
    with _lock:
        if _sync_engine is not None:
            return _sync_engine
        from sqlalchemy import create_engine

        url = settings.DATABASE_URL_SYNC
        if not url or url == "not_configured":
            raise RuntimeError("Database not configured.")

        _sync_engine = create_engine(
            url,
            pool_size=3,
            pool_timeout=30,
            pool_recycle=300,
            connect_args=_get_sync_connect_args(),
            echo=False,
        )
    return _sync_engine


def get_async_session_factory():
    """Lazy async session factory. Thread-safe."""
    global _AsyncSessionLocal
    if _AsyncSessionLocal is not None:
        return _AsyncSessionLocal
    with _lock:
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
        _AsyncSessionLocal = async_sessionmaker(
            get_async_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _AsyncSessionLocal


def get_sync_session_factory():
    """Lazy sync session factory. Thread-safe."""
    global _SyncSessionLocal
    if _SyncSessionLocal is not None:
        return _SyncSessionLocal
    with _lock:
        from sqlalchemy.orm import sessionmaker
        _SyncSessionLocal = sessionmaker(get_sync_engine())
    return _SyncSessionLocal
