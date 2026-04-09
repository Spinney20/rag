"""First-run setup — config wizard for desktop mode.

Serves a setup page if config.json doesn't exist yet.
Saves GEMINI_API_KEY and DATABASE_URL to AppData/RAGChecker/config.json.
"""

import json
import os

from pydantic import BaseModel

from app.core.paths import get_data_dir
from app.core.logging import get_logger

logger = get_logger(__name__)


def get_config_path() -> str:
    return os.path.join(get_data_dir(), "config.json")


def is_configured() -> bool:
    """Check if the app has been configured (desktop mode)."""
    from app.config import settings
    if not settings.is_desktop:
        return True  # Server mode always "configured" via env vars

    config_path = get_config_path()
    if not os.path.exists(config_path):
        return False

    try:
        with open(config_path) as f:
            config = json.load(f)
        return bool(config.get("GEMINI_API_KEY")) and bool(config.get("DATABASE_URL"))
    except (json.JSONDecodeError, IOError):
        return False


def save_config(config: dict) -> None:
    """Save config to AppData/RAGChecker/config.json."""
    config_path = get_config_path()
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
    logger.info("Config saved to %s", config_path)


def derive_db_urls(neon_url: str) -> tuple[str, str]:
    """From a Neon URL, derive async (asyncpg) and sync (psycopg2) variants.

    Input:  postgresql://user:pass@ep-name.region.aws.neon.tech/db?sslmode=require
    Async:  postgresql+asyncpg://user:pass@ep-name.region.aws.neon.tech/db
    Sync:   postgresql://user:pass@ep-name.region.aws.neon.tech/db?sslmode=require
    """
    neon_url = neon_url.strip()
    sync_url = neon_url

    async_url = neon_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "?" in async_url:
        async_url = async_url.split("?")[0]

    return async_url, sync_url


class SetupConfig(BaseModel):
    gemini_api_key: str
    database_url: str  # Single Neon URL — we derive async/sync
