"""Path resolution for both development and PyInstaller .exe.

In development: paths relative to project root.
In PyInstaller: paths relative to sys._MEIPASS (temp extraction dir).
Persistent data: always in AppData (Windows) or ~/.ragchecker (Linux/Mac).
"""

import os
import sys


def get_resource_path(relative_path: str) -> str:
    """Get absolute path to a bundled resource (static files, alembic, etc.).

    Works in both development and PyInstaller .exe.
    """
    if getattr(sys, "frozen", False):
        # Running from PyInstaller bundle
        base = sys._MEIPASS
    else:
        # Running in development — project root is 2 levels up from core/
        base = os.path.join(os.path.dirname(__file__), "..", "..")
    return os.path.join(base, relative_path)


def get_data_dir() -> str:
    """Get persistent data directory for config, uploads, logs, models.

    Windows: C:\\Users\\User\\AppData\\Roaming\\RAGChecker\\
    Linux/Mac: ~/.ragchecker/
    """
    if sys.platform == "win32":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
        path = os.path.join(base, "RAGChecker")
    else:
        path = os.path.join(os.path.expanduser("~"), ".ragchecker")
    os.makedirs(path, exist_ok=True)
    return path


def is_frozen() -> bool:
    """True if running from PyInstaller .exe."""
    return getattr(sys, "frozen", False)
