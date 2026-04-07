from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yields a DB session. Endpoints must call `await session.commit()` explicitly.
    Rollback is automatic on exception."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
