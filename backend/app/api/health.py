from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request, db: AsyncSession = Depends(get_db)):
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"

    redis_status = "ok"
    try:
        await request.app.state.redis.ping()
    except Exception:
        redis_status = "error"

    overall = "ok" if db_status == "ok" and redis_status == "ok" else "unhealthy"
    status_code = 200 if overall == "ok" else 503

    return JSONResponse(
        status_code=status_code,
        content=HealthResponse(
            status=overall, database=db_status, redis=redis_status
        ).model_dump(),
    )
