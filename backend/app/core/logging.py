"""Structured logging — file + stdout.

Desktop mode: logs to AppData/RAGChecker/ragchecker.log + stdout (if console exists).
Server mode: logs to stdout only (Docker captures it).
"""

import logging
import sys
import os


def setup_logging() -> None:
    """Configure logging. Call once at startup."""
    from app.core.paths import get_data_dir, is_frozen

    handlers: list[logging.Handler] = []

    # Always log to stdout in development
    if not is_frozen():
        handlers.append(logging.StreamHandler(sys.stdout))

    # In desktop mode (.exe), also log to file
    if is_frozen() or os.environ.get("APP_MODE") == "desktop":
        log_dir = get_data_dir()
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "ragchecker.log")
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        handlers.append(file_handler)

    # If no handlers (frozen with no file access?), add stdout as fallback
    if not handlers:
        handlers.append(logging.StreamHandler(sys.stdout))

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
        force=True,
    )
    # Quiet noisy libraries
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name."""
    return logging.getLogger(name)
