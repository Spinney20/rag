from collections.abc import AsyncGenerator

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yields a DB session. Endpoints must call `await session.commit()` explicitly.
    Rollback is automatic on exception."""
    try:
        factory = get_async_session_factory()
    except RuntimeError:
        raise HTTPException(503, "Database not configured. Visit /setup to complete setup.")

    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
