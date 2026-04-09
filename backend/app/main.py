"""FastAPI application — dual-mode (desktop + server).

Desktop mode: serves setup wizard, auto-migrates DB, serves static frontend.
Server mode: standard API server, frontend served separately or via static build.
"""

import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import text

from app.api.router import api_router
from app.config import settings
from app.core.logging import setup_logging, get_logger
from app.core.paths import get_resource_path
from app.setup import is_configured, save_config, derive_db_urls, SetupConfig

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Starting RAG Checker (mode=%s)", settings.APP_MODE)

    if not is_configured():
        logger.warning("Not configured — serving setup page only. Visit /setup")
        yield
        return

    # Auto-migrate database
    try:
        logger.info("Running database migrations...")
        _run_auto_migrate()
    except Exception as e:
        error_msg = str(e).lower()
        if "permission denied" in error_msg and "extension" in error_msg:
            logger.error(
                "Cannot create pgvector extension. Enable it manually:\n"
                "  Neon Dashboard → Settings → Extensions → Enable 'vector'\n"
                "  Or run: CREATE EXTENSION IF NOT EXISTS vector;"
            )
        else:
            logger.error("Migration failed: %s", e)
        # Continue anyway — DB might already be migrated

    # Cleanup interrupted runs from previous crash
    try:
        _cleanup_interrupted_runs()
    except Exception as e:
        logger.error("Cleanup failed: %s", e)

    # Warm-up DB connection (Neon cold start can take 3-5s)
    try:
        logger.info("Warming up database connection...")
        from app.database import get_async_session_factory
        async with get_async_session_factory()() as db:
            await db.execute(text("SELECT 1"))
        logger.info("Database connected")
    except Exception as e:
        logger.error("DB warm-up failed: %s", e)

    logger.info("RAG Checker ready")
    yield

    # Shutdown
    logger.info("Shutting down...")
    try:
        from app.database import get_async_engine
        engine = get_async_engine()
        await engine.dispose()
    except Exception:
        pass


app = FastAPI(
    title="RAG Checker",
    description="Verificare conformitate propuneri tehnice constructii",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS — needed for dev mode (frontend on different port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes first (highest priority)
app.include_router(api_router, prefix="/api")


# --- Setup wizard (desktop mode) ---

@app.get("/setup")
async def setup_page():
    """Serve setup page for first-run configuration."""
    if is_configured():
        return RedirectResponse("/")
    # Serve setup.html from static files
    setup_html = _get_static_path("setup.html")
    if setup_html and os.path.exists(setup_html):
        return FileResponse(setup_html)
    # Inline fallback if static file not found
    return FileResponse(get_resource_path("app/setup_page.html"))


@app.post("/api/setup")
async def save_setup(body: SetupConfig):
    """Save first-run configuration."""
    async_url, sync_url = derive_db_urls(body.database_url)
    config = {
        "GEMINI_API_KEY": body.gemini_api_key,
        "DATABASE_URL": async_url,
        "DATABASE_URL_SYNC": sync_url,
        "LLM_PROVIDER": "gemini",
        "LLM_MODEL": "gemini-2.0-flash",
        "LLM_MODEL_CHEAP": "gemini-2.0-flash",
        "EMBEDDING_PROVIDER": "fastembed",
        "EMBEDDING_DIMENSIONS": "384",
    }
    save_config(config)
    return {
        "status": "ok",
        "message": "Configurare salvată. Închide și redeschide RAGChecker.",
    }


# --- Activity tracking (for auto-shutdown) ---

import time
_last_activity = time.time()


@app.middleware("http")
async def track_activity(request, call_next):
    global _last_activity
    _last_activity = time.time()
    return await call_next(request)


def get_last_activity() -> float:
    return _last_activity


# --- Static file serving (for desktop + server production) ---

def _get_static_path(filename: str = "") -> str | None:
    """Find static files directory. Checks multiple locations."""
    candidates = [
        get_resource_path("static"),                                        # PyInstaller bundle
        os.path.join(os.path.dirname(__file__), "..", "static"),            # backend/static/ (manual copy)
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"),  # frontend/dist/ (Vite build output)
    ]
    for d in candidates:
        d = os.path.abspath(d)
        if os.path.isdir(d) and os.path.isfile(os.path.join(d, "index.html")):
            return os.path.join(d, filename) if filename else d
    return None


# Mount static assets if they exist (production build)
static_dir = _get_static_path()
if static_dir and os.path.isdir(os.path.join(static_dir, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="static-assets")


# SPA catch-all — must be LAST (serves index.html for all frontend routes)
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve static frontend files. Falls back to index.html for SPA routing."""
    if full_path.startswith("api/"):
        # Should not reach here — API routes are mounted first
        from fastapi import HTTPException
        raise HTTPException(404, "API endpoint not found")

    static = _get_static_path()
    if not static:
        return {"message": "Frontend not built. Run: cd frontend && npm run build"}

    # Try exact file match
    file_path = os.path.join(static, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)

    # SPA fallback — serve index.html
    index = os.path.join(static, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)

    return {"message": "Frontend not built. Run: cd frontend && npm run build"}


# --- Helper functions ---

def _run_auto_migrate():
    """Run alembic upgrade head with advisory lock.

    Uses Alembic's connection-sharing to ensure the advisory lock
    actually protects the migration (same connection for lock + migration).
    """
    from alembic.config import Config
    from alembic import command
    from alembic.runtime.environment import EnvironmentContext
    from app.database import get_sync_engine
    from app.core.paths import get_resource_path

    alembic_ini = get_resource_path("alembic.ini")
    alembic_dir = get_resource_path("alembic")

    engine = get_sync_engine()
    cfg = Config(alembic_ini)
    cfg.set_main_option("script_location", alembic_dir)
    cfg.set_main_option("sqlalchemy.url", str(engine.url))

    # Run migration with advisory lock on a shared connection
    with engine.begin() as conn:
        conn.execute(text("SELECT pg_advisory_lock(123456789)"))
        try:
            # Tell Alembic to use THIS connection (not create its own)
            cfg.attributes["connection"] = conn
            command.upgrade(cfg, "head")
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(123456789)"))
    logger.info("Database migrations complete")


def _cleanup_interrupted_runs():
    """Reset runs stuck in 'running' that are clearly abandoned.

    Only marks runs as failed if they've been 'running' for >10 minutes
    (a run that was truly interrupted, not one actively processing).
    'pending' runs are only cleaned if older than 5 minutes.
    This prevents one user's restart from killing another user's active evaluation.
    """
    from app.database import get_sync_session_factory
    Session = get_sync_session_factory()
    with Session() as db:
        result = db.execute(text("""
            UPDATE evaluation_runs
            SET status = 'failed',
                error_message = 'Interrupted — evaluation timed out or application restarted',
                completed_at = now()
            WHERE (
                (status = 'running' AND started_at < now() - interval '10 minutes')
                OR
                (status = 'pending' AND created_at < now() - interval '5 minutes')
            )
        """))
        count = result.rowcount
        db.commit()
        if count:
            logger.info("Cleaned up %d stale evaluation runs (>10 min running or >5 min pending)", count)
