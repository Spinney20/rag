"""Application settings — dual-mode (desktop + server).

Desktop mode: reads from AppData/RAGChecker/config.json (written by setup wizard).
Server mode: reads from environment variables / .env file.
"""

import json
import os
import sys

from pydantic_settings import BaseSettings


def _load_desktop_config() -> dict:
    """Load config from AppData/RAGChecker/config.json (desktop mode)."""
    if sys.platform == "win32":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
        config_file = os.path.join(base, "RAGChecker", "config.json")
    else:
        config_file = os.path.join(os.path.expanduser("~"), ".ragchecker", "config.json")

    if os.path.exists(config_file):
        try:
            with open(config_file) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


# Load desktop config (empty dict if not desktop or not configured)
_desktop_cfg = _load_desktop_config()


class Settings(BaseSettings):
    # App mode
    APP_MODE: str = "server"  # "desktop" or "server"

    # Database — desktop reads from config.json, server from env
    DATABASE_URL: str = _desktop_cfg.get("DATABASE_URL", "not_configured")
    DATABASE_URL_SYNC: str = _desktop_cfg.get("DATABASE_URL_SYNC", "not_configured")

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    # Evaluation
    EVAL_CONCURRENCY: int = 5

    # LLM
    LLM_PROVIDER: str = _desktop_cfg.get("LLM_PROVIDER", "gemini")
    LLM_MODEL: str = _desktop_cfg.get("LLM_MODEL", "gemini-2.0-flash")
    LLM_MODEL_CHEAP: str = _desktop_cfg.get("LLM_MODEL_CHEAP", "gemini-2.0-flash")
    GEMINI_API_KEY: str = _desktop_cfg.get("GEMINI_API_KEY", "")
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    # Embeddings
    EMBEDDING_PROVIDER: str = _desktop_cfg.get("EMBEDDING_PROVIDER", "fastembed")
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_MODEL_LOCAL: str = "paraphrase-multilingual-MiniLM-L12-v2"
    EMBEDDING_MODEL_FASTEMBED: str = "intfloat/multilingual-e5-small"
    EMBEDDING_DIMENSIONS: int = int(_desktop_cfg.get("EMBEDDING_DIMENSIONS", "384"))

    # File storage
    UPLOAD_DIR: str = ""  # Set dynamically below

    @property
    def is_desktop(self) -> bool:
        return self.APP_MODE == "desktop"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Set upload dir based on mode
        if not self.UPLOAD_DIR or self.UPLOAD_DIR == "":
            if self.is_desktop:
                from app.core.paths import get_data_dir
                self.UPLOAD_DIR = os.path.join(get_data_dir(), "uploads")
            else:
                self.UPLOAD_DIR = "/uploads"
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
