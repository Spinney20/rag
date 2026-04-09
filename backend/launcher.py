"""RAG Checker Desktop Launcher.

Entry point for the .exe. Handles:
- Port check (prevent double-start)
- System tray icon
- Auto-open browser
- Auto-shutdown after inactivity
- Crash error dialog
"""

import os
import sys
import socket
import webbrowser
import threading
import time

PORT = 8000
SHUTDOWN_TIMEOUT = 1800  # 30 min inactivity → auto-shutdown


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def show_error(message: str):
    """Show error dialog on Windows, print on other OS."""
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, message, "RAG Checker — Eroare", 0x10)
        except Exception:
            print(f"ERROR: {message}")
    else:
        print(f"ERROR: {message}")


def main():
    # Set desktop mode
    os.environ["APP_MODE"] = "desktop"

    # Check if already running
    if is_port_in_use(PORT):
        try:
            import httpx
            r = httpx.get(f"http://127.0.0.1:{PORT}/api/health", timeout=2)
            if r.status_code in (200, 503):
                webbrowser.open(f"http://localhost:{PORT}")
                print("RAG Checker already running — opened browser.")
                sys.exit(0)
        except Exception:
            pass
        show_error(
            f"Portul {PORT} este ocupat de altă aplicație.\n\n"
            "Închide aplicația de pe acest port și încearcă din nou."
        )
        sys.exit(1)

    # Start system tray (background thread)
    tray_thread = threading.Thread(target=_start_tray, daemon=True)
    tray_thread.start()

    # Open browser after delay
    def _open_browser():
        time.sleep(2)
        webbrowser.open(f"http://localhost:{PORT}")
    threading.Thread(target=_open_browser, daemon=True).start()

    # Auto-shutdown watcher
    threading.Thread(target=_auto_shutdown_watcher, daemon=True).start()

    # Start server
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=PORT,
        log_level="info",
    )


def _start_tray():
    """System tray icon with menu."""
    try:
        import pystray
        from PIL import Image

        icon_path = os.path.join(os.path.dirname(__file__), "icon.ico")
        if os.path.exists(icon_path):
            image = Image.open(icon_path)
        else:
            image = Image.new("RGB", (64, 64), color=(6, 182, 212))

        def on_open(icon, item):
            webbrowser.open(f"http://localhost:{PORT}")

        def on_exit(icon, item):
            icon.stop()
            os._exit(0)

        icon = pystray.Icon(
            "RAGChecker", image, "RAG Checker",
            menu=pystray.Menu(
                pystray.MenuItem("Deschide", on_open, default=True),
                pystray.MenuItem("Închide", on_exit),
            ),
        )
        icon.run()
    except ImportError:
        pass  # pystray not available — no tray icon, app still works


def _auto_shutdown_watcher():
    """Shutdown if no HTTP activity for SHUTDOWN_TIMEOUT seconds."""
    while True:
        time.sleep(60)
        try:
            from app.main import get_last_activity
            if time.time() - get_last_activity() > SHUTDOWN_TIMEOUT:
                print("Auto-shutdown: no activity for 30 minutes")
                os._exit(0)
        except Exception:
            pass


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        from app.core.paths import get_data_dir
        log_file = os.path.join(get_data_dir(), "ragchecker.log")
        show_error(
            f"RAG Checker a întâmpinat o eroare:\n\n{str(e)[:300]}\n\n"
            f"Verifică logurile:\n{log_file}"
        )
        raise
