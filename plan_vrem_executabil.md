# Plan: Dual-Mode — Desktop .exe + Server Browser

## Context

Aplicatia RAG Checker ruleaza acum in Docker (5 containere: PostgreSQL, Redis, FastAPI, 2x Celery, Next.js).

Vrem **AMBELE optiuni de deployment din ACELASI cod**:

### Modul A: Desktop (.exe)
- Un `.exe` standalone pe care il dam colegilor
- Dublu-click, merge, zero instalare
- DB pe Neon.tech (cloud gratuit, shared intre colegi)
- AI (Gemini) apelat direct din app

### Modul B: Server (browser)
- Docker Compose pe un server intern (sau cloud VPS)
- Colegii acceseaza din browser: `http://server:3000`
- PostgreSQL local in Docker
- Totul self-contained pe server

### Principiu: UN SINGUR CODEBASE, DOUA MODURI DE DEPLOYMENT

```
ACELASI cod backend + frontend
         │
    ┌────┴─────┐
    │          │
  DESKTOP    SERVER
    │          │
  .exe       Docker Compose
  Neon DB    PostgreSQL local
  threading  threading (sau optional Celery)
  FastAPI    FastAPI + Nginx
  serves     Next.js dev server
  static     OR Vite static
  files
```

**Ce NU se duplica:** Logica de business, modele DB, servicii, API endpoints, componente UI.
**Ce difera:** Config (env vars vs config.json), DB connection (Neon vs local), packaging.

---

## Cum se alege modul

Un singur env var: `APP_MODE`

```bash
# Desktop (.exe) — setat automat de launcher.py:
APP_MODE=desktop

# Server (Docker) — setat in docker-compose.yml:
APP_MODE=server
```

```python
# config.py:
class Settings(BaseSettings):
    APP_MODE: str = "server"  # "desktop" sau "server"

    @property
    def is_desktop(self) -> bool:
        return self.APP_MODE == "desktop"
```

**Comportament per mod:**

| Aspect | Desktop (`APP_MODE=desktop`) | Server (`APP_MODE=server`) |
|--------|------------------------------|----------------------------|
| DB config | din `AppData/config.json` | din `.env` / env vars |
| DB engine | lazy init (R13) | lazy init (works too) |
| SSL | auto-detect `neon.tech` in URL | no SSL pt localhost |
| Background tasks | `threading.Thread` (worker.py) | `threading.Thread` (acelasi) |
| Frontend | Static files servite de FastAPI | Next.js dev server SAU static |
| Setup wizard | `/setup` page la prima pornire | NU (config din .env) |
| Launcher | `launcher.py` (tray icon, browser auto) | `uvicorn` direct |
| Logs | Fisier in AppData | stdout (Docker logs) |
| Auto-migrate | Da (la startup) | Da (la startup) SAU manual `alembic upgrade head` |
| Auto-shutdown | 30 min inactivitate | NU (ruleaza permanent) |

**IMPORTANT:** Celery + Redis sunt ELIMINATE din ambele moduri. `threading.Thread` e suficient
pt ambele. Asta simplifica masiv — un singur code path pt background tasks.

---

## Docker Compose pt Modul Server (UPDATAT — fara Celery/Redis)

```yaml
# docker-compose.yml — SIMPLIFICAT (3 servicii in loc de 6)
services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: ragcheck
      POSTGRES_USER: ragcheck
      POSTGRES_PASSWORD: ragcheck_dev
    ports: ["5432:5432"]
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ragcheck"]
      interval: 3s
      timeout: 3s
      retries: 10

  backend:
    build: ./backend
    restart: unless-stopped
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ports: ["8000:8000"]
    volumes:
      - ./backend:/app
      - ./uploads:/uploads
    environment:
      APP_MODE: server
      DATABASE_URL: postgresql+asyncpg://ragcheck:ragcheck_dev@postgres:5432/ragcheck
      DATABASE_URL_SYNC: postgresql://ragcheck:ragcheck_dev@postgres:5432/ragcheck
      LLM_PROVIDER: gemini
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      EMBEDDING_PROVIDER: local
      EMBEDDING_DIMENSIONS: 384
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build: ./frontend
    restart: unless-stopped
    command: npm run dev
    ports: ["3000:3000"]
    volumes:
      - ./frontend/src:/app/src
    environment:
      VITE_API_URL: http://localhost:8000

volumes:
  postgres_data:
```

**Nota:** Redis si Celery sunt STERSE complet. Backend-ul foloseste threading in ambele moduri.
Docker Compose a scazut de la 6 servicii la 3. Mai simplu, mai putin RAM, mai putine probleme.

---

## Arhitectura Tinta

```
CE PRIMESTE COLEGUL:

RAGChecker.zip (~400MB download, o singura data)
│
└── RAGChecker/
    ├── RAGChecker.exe      ← dublu-click, porneste totul
    ├── _internal/           ← Python runtime + dependinte (nu atinge userul)
    └── icon.ico

PRIMA PORNIRE:
  1. RAGChecker.exe porneste
  2. Deschide browser la http://localhost:8000/setup
  3. Userul introduce Gemini API Key + Neon Database URL
  4. Se salveaza in C:\Users\Coleg\AppData\Roaming\RAGChecker\config.json
  5. Se descarca modelul de embedding (~120MB, o singura data)
  6. Se ruleaza migratia bazei de date (daca e prima data)
  7. Redirect la http://localhost:8000 — aplicatia e gata

URMATOARELE PORNIRI:
  1. Dublu-click RAGChecker.exe
  2. Se deschide browser-ul automat la http://localhost:8000
  3. Gata, merge (2-3 secunde)

CE RULEAZA IN BACKGROUND:
  - Un proces Python (FastAPI) pe localhost:8000
  - Serveste frontend-ul (HTML/CSS/JS static)
  - Serveste API-ul (/api/...)
  - Proceseaza documente in background threads
  - Icon in system tray: "RAG Checker running" + optiune "Exit"

CE NU EXISTA:
  - Docker ← ELIMINAT
  - Redis ← ELIMINAT
  - Celery ← ELIMINAT (inlocuit cu threading)
  - Node.js / Next.js server ← ELIMINAT (frontend e static, servit de FastAPI)
  - PostgreSQL local ← ELIMINAT (Neon cloud)
```

---

## Dependinte Externe (ce trebuie sa aiba colegul)

| Necesita | De ce |
|----------|-------|
| Windows 10/11 | PyInstaller produce .exe pt Windows |
| Internet | Gemini API + Neon PostgreSQL |
| Browser (Chrome/Edge) | UI-ul se deschide in browser |
| **Nimic altceva** | Zero Python, zero Node, zero Docker |

---

## FIX-URI DIN REVIEW (12 probleme identificate, toate adresate)

### FIX R1 (CRITICA): PyInstaller pe WSL2 NU produce Windows .exe

**Problema:** Dezvoltarea e pe WSL2 (Linux). PyInstaller pe Linux → binary Linux, NU .exe.
**Solutie:** Build-ul .exe se face prin GitHub Actions cu `runs-on: windows-latest`:

```yaml
# .github/workflows/build-exe.yml
name: Build Windows EXE
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # Build frontend
      - run: cd frontend && npm ci && npm run build
      - run: Copy-Item -Recurse frontend/dist backend/static

      # Build backend .exe
      - run: cd backend && pip install -r requirements.txt && pip install pyinstaller
      - run: cd backend && pyinstaller ragchecker.spec

      # Upload artifact
      - uses: actions/upload-artifact@v4
        with:
          name: RAGChecker-Windows
          path: backend/dist/RAGChecker/
          compression-level: 9
```

**Alternativ:** Build manual pe Windows PowerShell (nu WSL2):
```powershell
cd C:\Users\tu\rag\backend
python -m pip install -r requirements.txt
python -m pip install pyinstaller
python -m PyInstaller ragchecker.spec
```

### FIX R2 (CRITICA): sys._MEIPASS — path resolution pt PyInstaller

**Problema:** In PyInstaller, `__file__` si `os.getcwd()` NU pointeaza la fisierele bundeluite.
**Solutie:** Helper function obligatorie pt ORICE referinta la fisiere:

```python
# backend/app/core/paths.py — NOU
import sys
import os

def get_resource_path(relative_path: str) -> str:
    """Get absolute path to resource — works in dev AND PyInstaller .exe."""
    if getattr(sys, 'frozen', False):
        # Running from PyInstaller bundle
        base = sys._MEIPASS
    else:
        # Running in development
        base = os.path.join(os.path.dirname(__file__), "..", "..")
    return os.path.join(base, relative_path)

def get_data_dir() -> str:
    """Get persistent data directory (AppData on Windows)."""
    if sys.platform == "win32":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
    else:
        base = os.path.expanduser("~")
    path = os.path.join(base, "RAGChecker")
    os.makedirs(path, exist_ok=True)
    return path
```

**Toate referintele la fisiere trebuie sa treaca prin asta:**
- `STATIC_DIR = get_resource_path("static")`
- `ALEMBIC_INI = get_resource_path("alembic.ini")`
- `ALEMBIC_DIR = get_resource_path("alembic")`
- `ICON_PATH = get_resource_path("icon.ico")`

### FIX R3 (CRITICA): Loguri in fisier + crash dialog

**Problema:** `console=False` → stdout invizibil → zero debugging.
**Solutie:** Log-to-file + Windows error dialog:

```python
# core/logging.py — MODIFICAT:
def setup_logging():
    from app.core.paths import get_data_dir
    log_file = os.path.join(get_data_dir(), "ragchecker.log")

    handlers = [
        logging.FileHandler(log_file, encoding="utf-8"),
    ]
    # In development, adauga si stdout
    if not getattr(sys, 'frozen', False):
        handlers.append(logging.StreamHandler(sys.stdout))

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
        handlers=handlers,
    )

# launcher.py — crash dialog:
def main():
    try:
        _start_app()
    except Exception as e:
        log_file = os.path.join(get_data_dir(), "ragchecker.log")
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                f"RAG Checker a întâmpinat o eroare:\n\n{str(e)[:300]}\n\n"
                f"Verifică logurile:\n{log_file}",
                "RAG Checker — Eroare", 0x10
            )
        raise
```

### FIX R4 (IMPORTANTA): Config reload dupa setup → restart app

**Problema:** Settings e singleton la import time. config.json nou nu il actualizeaza.
**Solutie:** Setup wizard salveaza config și afiseaza "Reporneste aplicatia":

```python
@app.post("/api/setup")
async def save_setup(body: SetupConfig):
    save_config(body.model_dump())
    return {
        "status": "ok",
        "message": "Configurare salvată. Închide și redeschide RAGChecker.exe."
    }
```

Frontend setup page afiseaza mesaj: "✅ Configurare salvată! Închide RAGChecker din tray (⬇ dreapta-jos) și deschide din nou."

La urmatoarea pornire, launcher.py citeste config.json fresh → Settings se initializeaza cu valorile noi.

### FIX R5 (IMPORTANTA): Port ocupat → eroare clara, nu port alternativ

**Problema:** Daca portul 8000 e ocupat, backend-ul pe alt port NU e gasit de frontend.
**Solutie:** Port fix. Daca e ocupat, verifica daca e instanta noastra sau eroare:

```python
def _check_port():
    if not is_port_in_use(8000):
        return True  # Port liber, OK

    # Verifica daca e instanta noastra
    try:
        import httpx
        r = httpx.get("http://127.0.0.1:8000/api/health", timeout=2)
        if r.status_code == 200:
            webbrowser.open("http://localhost:8000")
            sys.exit(0)  # Deja ruleaza, doar deschide browser
    except:
        pass

    # Alt program ocupa portul
    _show_error(
        "Portul 8000 este ocupat de altă aplicație.\n\n"
        "Opțiuni:\n"
        "1. Închide aplicația de pe portul 8000\n"
        "2. Sau verifică în Task Manager ce folosește portul"
    )
    sys.exit(1)
```

### FIX R6 (IMPORTANTA): Worker cu limita de concurenta

**Problema:** Fara limita, 20 upload-uri simultane = 20 thread-uri = OOM pe 8GB RAM laptop.
**Solutie:** ThreadPoolExecutor cu max 2 workers:

```python
# worker.py — MODIFICAT:
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ragchecker-task")

def submit_task(name: str, target, args=(), kwargs=None) -> str:
    task_id = str(uuid.uuid4())
    # ... tracking code ...
    _executor.submit(_run_task, task_id, name, target, args, kwargs or {})
    # Max 2 task-uri simultan. Restul asteapta in coada.
    return task_id
```

### FIX R7 (IMPORTANTA): SSL pe sync engine pt Neon

**Problema:** Background threads folosesc sync engine care nu are SSL → connection refused.
**Solutie:** SSL pe AMBELE engines:

```python
# database.py — MODIFICAT:
def _get_async_connect_args():
    if "neon.tech" in settings.DATABASE_URL:
        import ssl
        return {"ssl": ssl.create_default_context()}
    return {}

def _get_sync_connect_args():
    if "neon.tech" in settings.DATABASE_URL_SYNC:
        return {"sslmode": "require"}  # psycopg2 format
    return {}

async_engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args=_get_async_connect_args(),
    ...
)
sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    connect_args=_get_sync_connect_args(),
    ...
)
```

### FIX R8 (IMPORTANTA): alembic.ini path in PyInstaller

**Problema:** `Config("alembic.ini")` cauta in CWD, nu in bundle.
**Solutie:** Path explicit:

```python
# main.py auto-migrate — MODIFICAT:
from app.core.paths import get_resource_path

alembic_ini = get_resource_path("alembic.ini")
alembic_dir = get_resource_path("alembic")

cfg = Config(alembic_ini)
cfg.set_main_option("script_location", alembic_dir)
command.upgrade(cfg, "head")
```

### FIX R9 (MEDIE): Neon pgvector extension — instructiuni in setup

**Solutie:** Setup wizard include pas: "Pe Neon dashboard: Settings → Extensions → Enable `vector`"
Sau: try/except la migratie cu mesaj clar daca CREATE EXTENSION esueaza:

```python
try:
    conn.execute(text('CREATE EXTENSION IF NOT EXISTS "vector"'))
except Exception as e:
    if "permission denied" in str(e).lower():
        logger.error("Nu se poate activa pgvector. Activeaza manual din Neon dashboard.")
        raise ValueError("Activeaza extensia 'vector' din Neon dashboard → Settings → Extensions")
```

### FIX R10 (MEDIE): Embedding cache explicit in AppData

**Solutie:** embedding_service.py — MODIFICAT:

```python
def _get_local_model():
    global _local_model
    if _local_model is None:
        from app.core.paths import get_data_dir
        cache_dir = os.path.join(get_data_dir(), "models")
        os.makedirs(cache_dir, exist_ok=True)
        logger.info("Loading embedding model (first time downloads ~120MB)...")
        _local_model = SentenceTransformer(
            settings.EMBEDDING_MODEL_LOCAL,
            cache_folder=cache_dir,
        )
    return _local_model
```

### FIX R11 (MEDIE): PyInstaller hidden imports + data files complete

**Solutie:** ragchecker.spec — UPDATAT:

```python
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# Collect ALL submodules for problematic packages
hiddenimports = [
    # ... lista existenta ...
    # ADAUGAT:
    'asyncpg.protocol.protocol',
    'google.auth', 'google.auth.transport', 'google.auth.transport.requests',
    'google.api_core', 'google.api_core.exceptions',
    'docx.opc', 'docx.opc.constants', 'docx.opc.package',
    'reportlab.graphics', 'reportlab.graphics.barcode',
    *collect_submodules('tiktoken'),
    *collect_submodules('tiktoken_ext'),
]

# Collect data files (BPE encodings, etc.)
datas += collect_data_files('tiktoken')
datas += collect_data_files('tiktoken_ext')
# sentence_transformers nu e in datas — modelul se descarca runtime
```

### FIX R12 (MICA): Auto-shutdown dupa 30 min inactivitate

**Solutie:** Middleware + watcher thread in launcher:

```python
# main.py — middleware:
_last_activity = time.time()

@app.middleware("http")
async def track_activity(request, call_next):
    global _last_activity
    _last_activity = time.time()
    return await call_next(request)

# launcher.py — auto-shutdown thread:
def _auto_shutdown_watcher():
    while True:
        time.sleep(60)
        from app.main import _last_activity
        if time.time() - _last_activity > 1800:  # 30 min
            logger.info("Auto-shutdown: no activity for 30 minutes")
            os._exit(0)

threading.Thread(target=_auto_shutdown_watcher, daemon=True).start()
```

---

### --- REVIEW #2: Probleme noi descoperite ---

### FIX R13 (CRITICA): App crapa la prima pornire — lazy engine init

**Problema:** `database.py` creeaza `async_engine` la import time cu `settings.DATABASE_URL`.
La prima pornire, config.json nu exista → DATABASE_URL e gol/default → `create_async_engine("")` → crash.
Setup page nu apuca sa fie servita.

**Solutie:** Engine-uri LAZY (create on first use, nu la import):

```python
# database.py — TOTAL RESCRIS pt desktop:
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_async_engine = None
_sync_engine = None
_AsyncSessionLocal = None
_SyncSessionLocal = None


def get_async_engine():
    """Lazy async engine — created on first call, not at import."""
    global _async_engine
    if _async_engine is None:
        from sqlalchemy.ext.asyncio import create_async_engine
        url = settings.DATABASE_URL
        if not url or "your_neon_url" in url or "ragcheck_dev" in url:
            raise RuntimeError("Database not configured. Complete setup at /setup first.")

        connect_args = {}
        if "neon.tech" in url:
            import ssl
            connect_args["ssl"] = ssl.create_default_context()

        _async_engine = create_async_engine(
            url, pool_size=5, max_overflow=2,
            pool_timeout=30, pool_recycle=300,
            connect_args=connect_args,
        )
        logger.info("Async DB engine created: %s", url.split("@")[-1])  # Log host only, not password
    return _async_engine


def get_sync_engine():
    """Lazy sync engine — for background threads."""
    global _sync_engine
    if _sync_engine is None:
        from sqlalchemy import create_engine
        url = settings.DATABASE_URL_SYNC
        if not url or "your_neon_url" in url:
            raise RuntimeError("Database not configured.")

        connect_args = {}
        if "neon.tech" in url:
            connect_args["sslmode"] = "require"

        _sync_engine = create_engine(
            url, pool_size=3, pool_timeout=30, pool_recycle=300,
            connect_args=connect_args,
        )
    return _sync_engine


def get_async_session_factory():
    global _AsyncSessionLocal
    if _AsyncSessionLocal is None:
        from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
        _AsyncSessionLocal = async_sessionmaker(
            get_async_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _AsyncSessionLocal


def get_sync_session_factory():
    global _SyncSessionLocal
    if _SyncSessionLocal is None:
        from sqlalchemy.orm import sessionmaker
        _SyncSessionLocal = sessionmaker(get_sync_engine())
    return _SyncSessionLocal
```

**Fisiere afectate:**
- `database.py` — rescris complet (lazy init)
- `dependencies.py` — `AsyncSessionLocal()` → `get_async_session_factory()()`
- `main.py` — lifespan: skip DB daca `not is_configured()`
- `api/health.py` — handle RuntimeError daca DB nu e configurat
- `tasks/process_document.py` — `SyncSessionLocal()` → `get_sync_session_factory()()`
- `tasks/extract_requirements.py` — la fel
- `tasks/run_evaluation.py` — la fel
- `services/extraction_service.py` — la fel
- `services/retrieval_service.py` — la fel

**Lifespan update:**
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()

    if not is_configured():
        logger.warning("Not configured — serving setup page only. Visit /setup")
        yield
        return

    # Normal startup: migrate + warm-up
    logger.info("Running database migrations...")
    _run_auto_migrate()
    logger.info("Warming up DB connection...")
    async with get_async_session_factory()() as db:
        await db.execute(text("SELECT 1"))
    logger.info("RAG Checker ready")
    yield
    # Shutdown
    engine = get_async_engine()
    await engine.dispose()
```

### FIX R14 (IMPORTANTA): Un singur DB URL in setup — auto-derivare async/sync

**Problema:** Userul trebuie sa introduca 2 URL-uri diferite (async + sync) pt aceeasi baza de date.
Nu stie ce e asyncpg vs psycopg2.

**Solutie:** Setup wizard accepta UN SINGUR URL (copy-paste din Neon). App-ul deriveaza ambele:

```python
# setup.py:
def derive_db_urls(neon_url: str) -> tuple[str, str]:
    """Din URL Neon, genereaza async (asyncpg) + sync (psycopg2) variants.

    Input:  postgresql://user:pass@ep-name.region.aws.neon.tech/db?sslmode=require
    Async:  postgresql+asyncpg://user:pass@ep-name.region.aws.neon.tech/db
    Sync:   postgresql://user:pass@ep-name.region.aws.neon.tech/db?sslmode=require
    """
    sync_url = neon_url.strip()

    # Async: add +asyncpg driver, remove sslmode param (handled in code)
    async_url = sync_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    # Remove query params (asyncpg uses SSL context, not query string)
    if "?" in async_url:
        async_url = async_url.split("?")[0]

    return async_url, sync_url


# In save_config():
async_url, sync_url = derive_db_urls(body.database_url)
config = {
    "GEMINI_API_KEY": body.gemini_api_key,
    "DATABASE_URL": async_url,
    "DATABASE_URL_SYNC": sync_url,
}
save_config(config)
```

**Setup page — UN SINGUR CAMP:**
```
Database URL (Neon):
[postgresql://user:pass@ep-name.region.aws.neon.tech/db?sslmode=require]
ℹ Copiaza din Neon dashboard → Connection Details → Connection String
```

### FIX R15 (IMPORTANTA): fastembed in loc de sentence-transformers — .exe 200MB mai mic

**Problema:** sentence-transformers trage PyTorch (~300MB). .exe devine 600-700MB.
**Solutie:** Foloseste `fastembed` (bazat pe onnxruntime, ~50MB):

```python
# embedding_service.py — MODIFICAT:
_local_model = None

def _get_local_model():
    global _local_model
    if _local_model is None:
        from app.core.paths import get_data_dir
        cache_dir = os.path.join(get_data_dir(), "models")
        os.makedirs(cache_dir, exist_ok=True)

        logger.info("Loading embedding model (first time downloads ~80MB)...")
        from fastembed import TextEmbedding
        _local_model = TextEmbedding(
            model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            cache_dir=cache_dir,
        )
        logger.info("Embedding model ready")
    return _local_model

def _embed_local(texts: list[str]) -> list[list[float]]:
    model = _get_local_model()
    # fastembed returns generator, convert to list
    embeddings = list(model.embed(texts))
    return [emb.tolist() for emb in embeddings]
```

**requirements.txt:**
```
# INAINTE:
sentence-transformers>=3.0   # trage PyTorch ~300MB

# DUPA:
fastembed>=0.3               # bazat pe onnxruntime ~50MB
```

**Impact pe .exe:**

| | Cu sentence-transformers | Cu fastembed |
|---|---|---|
| PyTorch | ~300MB | ❌ (eliminat) |
| onnxruntime | ❌ | ~50MB |
| Embedding lib | ~50MB | ~10MB |
| **Diferenta** | | **-290MB** |
| **Total .exe** | ~600-700MB | **~350-400MB** |
| **Total .zip** | ~350-400MB | **~180-200MB** |

Calitatea embedding-urilor: **identica** (acelasi model, doar runtime-ul difera).

**NOTA:** fastembed descarca modelul ONNX la prima rulare (~80MB), nu modelul PyTorch (~120MB). Ceva mai mic.

### FIX R16 (MEDIE): Neon free tier — info corecta

**Gresit in plan:** "database se sterge dupa 1 saptamana de inactivitate TOTALA"

**Corect (2025):**
- Compute se SUSPENDA dupa 5 minute inactivitate (se opreste CPU-ul, nu se sterg datele)
- Prima query dupa suspend: cold start 3-5 secunde (compute reporneste)
- Datele NU se sterg pe free tier
- Limita: 512MB storage, 1 proiect, 0.25 vCPU
- Estimare capacitate: ~60 proiecte de constructii cu embeddings

**Singurul risc real:** Neon poate schimba termenii free tier in viitor. Pt productie: Neon Pro ($19/luna) sau Supabase.

### FIX R17 (MEDIE): Tailwind v4 + fonts in Vite — efort suplimentar

**Problema:** Migratia Next.js → Vite necesita si:
1. `@tailwindcss/vite` plugin in loc de `@tailwindcss/postcss`
2. Fonts: `next/font/google` → `@fontsource/geist` (npm package) sau Google Fonts CDN

**Setup Vite complet:**
```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: { "@": path.resolve(__dirname, "src") },
    },
});
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="ro">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RAG Checker</title>
    <!-- Fonts: Geist via fontsource (bundled, no CDN) -->
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

```bash
# Dependinte Vite:
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router-dom @fontsource/geist @fontsource/geist-mono
npm install -D @tailwindcss/vite tailwindcss
npm install lucide-react clsx
```

**Efort total migrare: 2 zile** (nu 1.5 — extra 0.5 pt fonts + Tailwind v4 debugging)

### FIX R18 (MEDIE): run_evaluation.py + extract_requirements.py — schimbari explicite

**Toate 3 task-urile trebuie modificate identic:**

```python
# PATTERN pt TOATE task-urile (process_document, extract_requirements, run_evaluation):

# INAINTE (Celery):
from app.database import SyncSessionLocal
from app.tasks.celery_app import celery_app

@celery_app.task(bind=True, max_retries=3, ...)
def some_task(self, arg):
    with SyncSessionLocal() as db:
        ...
        raise self.retry(exc=e)

# DUPA (threading):
from app.database import get_sync_session_factory

def some_task_sync(arg):
    """Runs in background thread via worker.submit_task()."""
    Session = get_sync_session_factory()
    with Session() as db:
        for attempt in range(3):
            try:
                _do_work(db, arg)
                return
            except (ConnectionError, IOError) as e:
                if attempt < 2:
                    import time
                    time.sleep(5 * (attempt + 1))
                    continue
                db.rollback()
                raise
            except (ValueError, TypeError):
                # Permanent failure — no retry
                db.rollback()
                raise
```

**Fisiere modificate:**
- `tasks/process_document.py`: `process_document_task` → `process_document_sync`
- `tasks/extract_requirements.py`: `extract_requirements_task` → `extract_requirements_sync`
- `tasks/run_evaluation.py`: `run_evaluation_task` → `run_evaluation_sync`
- Fiecare: sterge `@celery_app.task`, sterge `self.retry()`, adauga manual retry loop

**API endpoints care le apeleaza:**
- `api/documents.py`: `process_document_task.delay(id)` → `submit_task("process", process_document_sync, args=(id,))`
- `api/requirements.py`: `extract_requirements_task.delay(id)` → `submit_task("extract", extract_requirements_sync, args=(id,))`
- `api/evaluations.py`: `run_evaluation_task.delay(pid, rid, config)` → `submit_task("evaluate", run_evaluation_sync, args=(pid, rid, config))`

---

### --- REVIEW #3: Probleme de integrare dual-mode ---

### FIX R19 (IMPORTANTA): fastembed — model sigur suportat + 3 embedding providers

**Problema:** `paraphrase-multilingual-MiniLM-L12-v2` s-ar putea sa NU fie in lista fastembed.
**Solutie:** 3 embedding providers cu model-uri garantat suportate:

```python
# config.py:
EMBEDDING_PROVIDER: str = "fastembed"  # "fastembed" | "sentence-transformers" | "openai"

# Modele per provider:
EMBEDDING_MODEL_FASTEMBED: str = "intfloat/multilingual-e5-small"  # SIGUR in fastembed
EMBEDDING_MODEL_LOCAL: str = "paraphrase-multilingual-MiniLM-L12-v2"  # pt sentence-transformers
EMBEDDING_MODEL: str = "text-embedding-3-small"  # pt OpenAI
```

```python
# embedding_service.py — adauga provider "fastembed":
def embed_batch(texts: list[str]) -> list[list[float]]:
    if settings.EMBEDDING_PROVIDER == "fastembed":
        return _embed_fastembed(texts)
    elif settings.EMBEDDING_PROVIDER == "local":  # sentence-transformers
        return _embed_local(texts)
    elif settings.EMBEDDING_PROVIDER == "openai":
        return _embed_openai(texts)

def _embed_fastembed(texts):
    model = _get_fastembed_model()
    embeddings = list(model.embed(texts))
    return [emb.tolist() for emb in embeddings]
```

**Default per mod:**
- Desktop: `EMBEDDING_PROVIDER=fastembed` (mic, ONNX, ~50MB)
- Server: `EMBEDDING_PROVIDER=local` (sentence-transformers, orice model, PyTorch)
- Productie: `EMBEDDING_PROVIDER=openai` (API, zero local)

**ATENTIE dimensiuni:** `multilingual-e5-small` produce 384 dim (ca si MiniLM). Compatibil cu pgvector column.
Daca schimbi modelul, trebuie re-embed tot + migratie DB.

### FIX R20 (IMPORTANTA): Docker server productie — multi-stage build, nu npm run dev

**Problema:** `docker-compose.yml` ruleaza `npm run dev` (dev server) in loc de build productie.
**Solutie:** Backend Dockerfile face multi-stage build cu frontend inclus:

```dockerfile
# backend/Dockerfile — UPDATAT (multi-stage):

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python backend + static frontend
FROM python:3.12-slim
WORKDIR /app
# Copy built frontend
COPY --from=frontend-build /frontend/dist /app/static
# Copy backend
COPY backend/ .
RUN pip install --no-cache-dir -r requirements.txt
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**docker-compose.yml — SIMPLIFICAT pt productie:**
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    # ... (neschimbat)

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    restart: unless-stopped
    ports: ["8000:8000"]
    environment:
      APP_MODE: server
      SERVE_STATIC: "true"
      # ... restul env vars
    depends_on:
      postgres: { condition: service_healthy }

  # Frontend dev server — DOAR cu: docker compose --profile dev up
  frontend-dev:
    profiles: ["dev"]
    build: ./frontend
    command: npm run dev
    ports: ["3000:3000"]
    volumes:
      - ./frontend/src:/app/src
    environment:
      VITE_API_URL: http://localhost:8000

volumes:
  postgres_data:
```

**Folosire:**
```bash
# Productie (frontend built in backend image):
docker compose up -d

# Development (frontend cu hot-reload pe :3000):
docker compose --profile dev up -d
```

### FIX R21 (MEDIE): Redenumeste frontend/ → frontend/

**Problema:** "frontend" implica doar desktop. E de fapt unicul frontend pt AMBELE moduri.
**Solutie:** Redenumeste `frontend/` → `frontend/`. Sterge vechiul `frontend/` (Next.js).

Toate referintele in plan, docker-compose, Dockerfile, scripts se actualizeaza de la
`frontend/` la `frontend/`.

### FIX R22 (MEDIE): VITE_API_URL — same-origin default, cross-origin doar in dev

**Solutie:** Doua .env files in Vite:

```bash
# frontend/.env.production (pt npm run build):
VITE_API_URL=
# Empty = same origin. Desktop + server prod: FastAPI serveste totul pe :8000.

# frontend/.env.development (pt npm run dev):
VITE_API_URL=http://localhost:8000
# Cross-origin. Vite dev server pe :3000/:5173, API pe :8000.
```

```typescript
// frontend/src/lib/api.ts:
const API_BASE = import.meta.env.VITE_API_URL || "";
// "" = same origin → fetch("/api/...") → zero CORS
// "http://localhost:8000" = dev → fetch("http://localhost:8000/api/...") → needs CORS
```

```python
# backend main.py — CORS doar pt dev:
if not settings.is_desktop:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",   # Vite default
            "http://localhost:5173",   # Vite alt port
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
# In desktop + server prod, frontend e same-origin → CORS nu e necesar
```

### FIX R23 (MEDIE): Auto-cleanup runs "running" la startup (recovery dupa crash)

**Problema:** Daca app-ul crapa mid-evaluare, run-ul ramane "running" in DB. La repornire,
concurrent run prevention (partial unique index) blocheaza noi evaluari pe acel proiect.

**Solutie:** La startup, reseteaza runs abandonati:

```python
# In lifespan, dupa auto-migrate:
logger.info("Cleaning up interrupted evaluation runs...")
with get_sync_session_factory()() as db:
    result = db.execute(text("""
        UPDATE evaluation_runs 
        SET status = 'failed', 
            error_message = 'Interrupted by application restart',
            completed_at = now()
        WHERE status IN ('pending', 'running')
        RETURNING id
    """))
    cleaned = result.rowcount
    db.commit()
    if cleaned:
        logger.info("Cleaned up %d interrupted runs", cleaned)
```

**NOTA pt colegi:** "Daca evaluarea s-a intrerupt (ai inchis app-ul), redeschide si re-lanseaza.
Evaluarea va continua de unde a ramas (cerinte deja evaluate sunt pastrate)."

---

## Pasi de Implementare (9 zile estimate — confirmat dupa 3 review-uri)

### PASUL 1: Elimina Redis + Celery → Background Threads (1 zi)

#### Ce se schimba:

Celery tasks devin functii simple rulate in `threading.Thread`. Nu mai exista task queue,
message broker, sau worker processes. Totul ruleaza in procesul principal FastAPI.

#### Fisiere NOI:

**`backend/app/worker.py`** — inlocuieste Celery complet:

```python
"""Simple thread-based background task runner.
Replaces Celery + Redis entirely for desktop app.

Each task runs in its own daemon thread with its own DB session.
Progress is tracked via DB status fields (same as before).
"""

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from app.core.logging import get_logger

logger = get_logger(__name__)


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TaskInfo:
    id: str
    name: str
    status: TaskStatus = TaskStatus.PENDING
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None
    thread: threading.Thread | None = field(default=None, repr=False)


# In-memory task registry (survives only while app is running — OK for desktop)
_tasks: dict[str, TaskInfo] = {}
_lock = threading.Lock()


def submit_task(name: str, target, args=(), kwargs=None) -> str:
    """Submit a background task. Returns task ID."""
    task_id = str(uuid.uuid4())

    def _run():
        with _lock:
            _tasks[task_id].status = TaskStatus.RUNNING
            _tasks[task_id].started_at = datetime.utcnow()
        try:
            target(*args, **(kwargs or {}))
            with _lock:
                _tasks[task_id].status = TaskStatus.COMPLETED
                _tasks[task_id].completed_at = datetime.utcnow()
        except Exception as e:
            logger.error("Task %s (%s) failed: %s", task_id, name, e)
            with _lock:
                _tasks[task_id].status = TaskStatus.FAILED
                _tasks[task_id].error = str(e)[:500]
                _tasks[task_id].completed_at = datetime.utcnow()

    thread = threading.Thread(target=_run, name=f"task-{name}-{task_id[:8]}", daemon=True)

    with _lock:
        _tasks[task_id] = TaskInfo(id=task_id, name=name, thread=thread)

    thread.start()
    logger.info("Task submitted: %s (%s)", task_id, name)
    return task_id


def get_task_info(task_id: str) -> TaskInfo | None:
    with _lock:
        return _tasks.get(task_id)
```

#### Fisiere MODIFICATE:

**`backend/app/tasks/process_document.py`** — sterge Celery decorator, foloseste worker:

```python
# INAINTE (Celery):
@celery_app.task(bind=True, name="...", max_retries=3, ...)
def process_document_task(self, document_id: str):
    ...
    raise self.retry(exc=e)

# DUPA (threading):
from app.database import SyncSessionLocal

def process_document_sync(document_id: str):
    """Runs in a background thread. Creates its own DB session."""
    with SyncSessionLocal() as db:
        # ... exact aceeasi logica ...
        # Diferenta: nu mai exista self.retry()
        # In schimb: try/except cu max 3 retry-uri manuale
        for attempt in range(3):
            try:
                _do_processing(db, document_id)
                return
            except (IOError, ConnectionError) as e:
                if attempt < 2:
                    time.sleep(5 * (attempt + 1))  # backoff
                    continue
                raise
```

**`backend/app/tasks/extract_requirements.py`** — identic, sterge Celery, adauga retry manual.

**`backend/app/tasks/run_evaluation.py`** — identic. Deja e sync (nu mai are asyncio.gather).

**`backend/app/api/documents.py`** — schimba dispatch:
```python
# INAINTE:
from app.tasks.process_document import process_document_task
process_document_task.delay(str(doc.id))

# DUPA:
from app.worker import submit_task
from app.tasks.process_document import process_document_sync
task_id = submit_task("process_document", process_document_sync, args=(str(doc.id),))
```

**`backend/app/api/requirements.py`** — la fel pt extract.
**`backend/app/api/evaluations.py`** — la fel pt run_evaluation.

**`backend/app/tasks/celery_app.py`** — **STERS** complet.

**`backend/app/config.py`** — sterge:
```python
# STERGE aceste campuri:
REDIS_URL: str = ...
CELERY_BROKER_URL: str = ...
CELERY_RESULT_BACKEND: str = ...
```

**`backend/app/main.py`** — sterge Redis din lifespan:
```python
# STERGE:
app.state.redis = aioredis.from_url(settings.REDIS_URL)
await app.state.redis.aclose()
```

**`backend/app/api/health.py`** — sterge Redis check:
```python
# INAINTE: check DB + Redis
# DUPA: check doar DB
```

**`docker-compose.yml`** — sterge redis + celery workers (pastram pt development optional).

#### Riscuri:
- Thread safety: fiecare thread isi creeaza propria sesiune DB (`with SyncSessionLocal()`) — safe.
- Daca app-ul se inchide in mijlocul unui task, task-ul se pierde. Acceptabil pt desktop.
- Nu exista retry across restarts (Celery avea acks_late). Acceptabil pt desktop.

---

### PASUL 2: PostgreSQL → Neon Cloud (0.5 zile)

#### Setup Neon (manual, o singura data):
1. https://neon.tech → Sign up cu GitHub
2. Create Project → "ragchecker"
3. Create Database → "ragcheck"
4. Enable pgvector extension: `CREATE EXTENSION vector;`
5. Copiaza connection string

#### Fisiere MODIFICATE:

**`backend/app/database.py`** — SSL support pt Neon:

```python
import ssl

def _get_connect_args():
    """Neon requires SSL. Local PostgreSQL does not."""
    if "neon.tech" in settings.DATABASE_URL:
        return {"ssl": ssl.create_default_context()}
    return {}

async_engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=5,           # Mai mic pt remote
    max_overflow=2,
    pool_timeout=30,
    pool_recycle=300,       # Recycle mai des (Neon idle disconnect)
    connect_args=_get_connect_args(),
)
```

**`backend/app/main.py`** — warm-up + auto-migrate la startup:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    
    # Auto-migrate database (with advisory lock for concurrent startup)
    logger.info("Running database migrations...")
    from alembic.config import Config
    from alembic import command
    from sqlalchemy import text

    with sync_engine.connect() as conn:
        # Advisory lock prevents concurrent migrations from multiple app instances
        conn.execute(text("SELECT pg_advisory_lock(123456789)"))
        try:
            cfg = Config("alembic.ini")
            command.upgrade(cfg, "head")
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(123456789)"))
        conn.commit()
    
    # Warm-up connection (Neon cold start can take 3-5s)
    logger.info("Warming up database connection...")
    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT 1"))
    
    logger.info("RAG Checker ready")
    yield
    await async_engine.dispose()
```

#### Riscuri:
- Neon free tier: cold start 3-5s dupa 5 min inactivitate. Warm-up la startup rezolva prima cerere.
- 512MB storage limit. Un proiect cu 400 pagini CS + embeddings ≈ 10-20MB. Suficient pt ~25 proiecte.
- Neon free tier: database se sterge dupa 1 saptamana de inactivitate TOTALA (nu doar idle).
  ATENTIE: daca nimeni nu foloseste app-ul 7 zile, datele se pierd. Neon Pro ($19/luna) nu are aceasta limita.

---

### PASUL 3: Frontend Next.js → Vite SPA (1.5 zile)

#### De ce:
Next.js App Router cu rute dinamice (`/projects/[id]`) NU suporta `output: 'export'` (static HTML).
Vite + React Router produce un `dist/` folder cu `index.html` + JS/CSS.
FastAPI serveste totul. Zero Node.js necesar.

#### Ce se schimba:

**Routing:**
```tsx
// INAINTE (Next.js file-based):
// src/app/projects/[id]/page.tsx
import { useParams } from "next/navigation";
import Link from "next/link";

// DUPA (React Router):
// src/pages/ProjectPage.tsx
import { useParams, Link } from "react-router-dom";
// Restul componentei e IDENTIC
```

**Layout:**
```tsx
// INAINTE (Next.js layout.tsx):
export default function RootLayout({ children }) {
    return <html><body><Sidebar />{children}</body></html>;
}

// DUPA (Vite App.tsx):
import { BrowserRouter, Routes, Route } from "react-router-dom";

function App() {
    return (
        <BrowserRouter>
            <div className="flex">
                <Sidebar />
                <main className="flex-1 ml-[260px]">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/projects/new" element={<NewProject />} />
                        <Route path="/projects/:id" element={<ProjectPage />} />
                        <Route path="/projects/:id/requirements" element={<RequirementsPage />} />
                        <Route path="/projects/:id/evaluation" element={<EvaluationPage />} />
                        <Route path="/projects/:id/report" element={<ReportPage />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}
```

**Fonts:**
```tsx
// INAINTE (Next.js):
import { Geist, Geist_Mono } from "next/font/google";

// DUPA (Vite):
// In index.html:
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
// Sau: npm install @fontsource/geist + import "@fontsource/geist";
```

#### Fisiere NOI:
- `frontend/` — nou folder (Vite project)
- `frontend/vite.config.ts`
- `frontend/index.html`
- `frontend/src/App.tsx` — routing
- `frontend/src/main.tsx` — entry point

#### Fisiere MUTATE (fara schimbari de logica):
- Toate componentele din `frontend/src/components/` → `frontend/src/components/`
- Toate paginile din `frontend/src/app/**/page.tsx` → `frontend/src/pages/*.tsx`
- `frontend/src/lib/` → `frontend/src/lib/`
- `frontend/src/app/globals.css` → `frontend/src/globals.css`

#### Fisiere MODIFICATE (schimbari minore):
- Fiecare pagina: `import { useParams } from "next/navigation"` → `from "react-router-dom"`
- Fiecare pagina: `import Link from "next/link"` → `from "react-router-dom"`
- Fiecare pagina: `const params = useParams(); const id = params.id as string;`
  → `const { id } = useParams<{ id: string }>();`

#### Build:
```bash
cd frontend
npm run build
# Produce: dist/index.html + dist/assets/*.js + dist/assets/*.css
```

#### Riscuri:
- Migration mecanica dar tediosa (fiecare fisier de pagina trebuie atins)
- Tailwind config trebuie re-creat pt Vite (minimal, copy-paste)
- CSS variables din globals.css merg identic

---

### PASUL 4: FastAPI serveste frontend static (0.5 zile)

#### Fisiere MODIFICATE:

**`backend/app/main.py`** — adauga static file serving:

```python
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Determina calea catre frontend static
# In development: frontend/dist/
# In PyInstaller .exe: _internal/static/
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
if not os.path.exists(STATIC_DIR):
    STATIC_DIR = os.path.join(os.path.dirname(sys.executable), "static")

# API routes first
app.include_router(api_router, prefix="/api")

# Serveste static assets (JS, CSS, images)
if os.path.exists(os.path.join(STATIC_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

# SPA catch-all: orice ruta necunoscuta → index.html (React Router gestioneaza client-side)
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    file_path = os.path.join(STATIC_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))
```

#### IMPORTANT: ordinea mounturilor conteaza!
1. `/api/*` — API endpoints (PRIMUL)
2. `/assets/*` — static files (JS/CSS)
3. `/{path}` — SPA catch-all → index.html (ULTIMUL)

---

### PASUL 5: Config → AppData + First-Run Setup (0.5 zile)

#### Fisiere NOI:

**`backend/app/setup.py`** — first-run config wizard:

```python
"""First-run setup — serves a config page if no config exists."""

CONFIG_DIR = os.path.join(
    os.environ.get("APPDATA", os.path.expanduser("~")),
    "RAGChecker"
)
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")

def load_config() -> dict:
    """Load config from AppData. Returns empty dict if first run."""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE) as f:
            return json.load(f)
    return {}

def save_config(config: dict):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)

def is_configured() -> bool:
    config = load_config()
    return bool(config.get("GEMINI_API_KEY")) and bool(config.get("DATABASE_URL"))
```

**API endpoint pt setup:**
```python
@app.get("/setup")
async def setup_page():
    """Serve setup page if not configured."""
    if is_configured():
        return RedirectResponse("/")
    return FileResponse(os.path.join(STATIC_DIR, "setup.html"))

@app.post("/api/setup")
async def save_setup(body: SetupConfig):
    save_config(body.model_dump())
    # Reload settings
    ...
    return {"status": "ok", "message": "Configuration saved"}
```

**Frontend:** `setup.html` — pagina simpla HTML (fara React) cu:
```
┌─────────────────────────────────────────┐
│         RAG Checker — Setup             │
│                                         │
│  Gemini API Key:                        │
│  [_________________________________]    │
│  ℹ Obtine gratuit: aistudio.google.com  │
│                                         │
│  Database URL (Neon):                   │
│  [_________________________________]    │
│  ℹ Obtine gratuit: neon.tech            │
│                                         │
│  [         Salveaza si Porneste       ] │
└─────────────────────────────────────────┘
```

#### Fisiere MODIFICATE:

**`backend/app/config.py`** — citeste config din AppData:
```python
import json, os

def _load_desktop_config():
    config_file = os.path.join(
        os.environ.get("APPDATA", os.path.expanduser("~")),
        "RAGChecker", "config.json"
    )
    if os.path.exists(config_file):
        with open(config_file) as f:
            return json.load(f)
    return {}

_desktop_config = _load_desktop_config()

class Settings(BaseSettings):
    DATABASE_URL: str = _desktop_config.get("DATABASE_URL", "postgresql+asyncpg://...")
    GEMINI_API_KEY: str = _desktop_config.get("GEMINI_API_KEY", "")
    # ... restul
    
    model_config = {"env_file": ".env", "extra": "ignore"}
    # .env override desktop config (pt development)
```

**Upload directory:**
```python
UPLOAD_DIR: str = os.path.join(
    os.environ.get("APPDATA", os.path.expanduser("~")),
    "RAGChecker", "uploads"
)
```

---

### PASUL 6: Launcher + System Tray (0.5 zile)

#### Fisiere NOI:

**`backend/launcher.py`** — entry point pt .exe:

```python
"""RAG Checker Desktop Launcher.

- Checks if already running (port 8000)
- Shows system tray icon
- Starts FastAPI server
- Opens browser automatically
"""

import sys
import os
import socket
import webbrowser
import threading
import time

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

def main():
    PORT = 8000

    # Already running? Just open browser
    if is_port_in_use(PORT):
        webbrowser.open(f"http://localhost:{PORT}")
        print("RAG Checker is already running.")
        sys.exit(0)

    # Start system tray icon (in background thread)
    tray_thread = threading.Thread(target=_start_tray, daemon=True)
    tray_thread.start()

    # Open browser after small delay (let server start)
    def _open_browser():
        time.sleep(2)
        webbrowser.open(f"http://localhost:{PORT}")
    threading.Thread(target=_open_browser, daemon=True).start()

    # Start FastAPI server (blocks main thread)
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",  # Doar localhost — nu expune in retea
        port=PORT,
        log_level="info",
    )

def _start_tray():
    """System tray icon with menu."""
    try:
        import pystray
        from PIL import Image
        
        # Load or create icon
        icon_path = os.path.join(os.path.dirname(__file__), "icon.ico")
        if os.path.exists(icon_path):
            image = Image.open(icon_path)
        else:
            # Fallback: create a simple colored square
            image = Image.new("RGB", (64, 64), color=(6, 182, 212))

        def on_open(icon, item):
            webbrowser.open("http://localhost:8000")

        def on_exit(icon, item):
            icon.stop()
            os._exit(0)

        icon = pystray.Icon(
            "RAGChecker",
            image,
            "RAG Checker",
            menu=pystray.Menu(
                pystray.MenuItem("Deschide", on_open, default=True),
                pystray.MenuItem("Inchide", on_exit),
            ),
        )
        icon.run()
    except ImportError:
        # pystray not available — no tray icon, app still works
        pass

if __name__ == "__main__":
    main()
```

**Dependinte noi (requirements.txt):**
```
pystray>=0.19
Pillow>=10.0  # deja dependinta de la alte pachete probabil
```

---

### PASUL 7: PyInstaller Packaging (2 zile)

#### Prerequisite:
- TREBUIE facut PE WINDOWS (PyInstaller produce .exe doar pe Windows)
- Python 3.12 instalat pe masina de build
- Toate dependintele instalate: `pip install -r requirements.txt`

#### Fisiere NOI:

**`backend/ragchecker.spec`** — PyInstaller spec:

```python
# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None

# Collect data files
datas = [
    ('static/', 'static/'),           # Frontend built files
    ('alembic/', 'alembic/'),          # DB migrations
    ('alembic.ini', '.'),              # Alembic config
]

# Add icon if exists
if os.path.exists('icon.ico'):
    datas.append(('icon.ico', '.'))

a = Analysis(
    ['launcher.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=[
        # FastAPI + Uvicorn
        'uvicorn', 'uvicorn.logging', 'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto', 'uvicorn.protocols.http.h11_impl',
        'uvicorn.lifespan.on', 'uvicorn.lifespan.off',
        
        # SQLAlchemy
        'sqlalchemy.dialects.postgresql',
        'sqlalchemy.dialects.postgresql.asyncpg',
        'sqlalchemy.dialects.postgresql.psycopg2',
        
        # pgvector
        'pgvector.sqlalchemy',
        
        # tiktoken (Rust extension — problematic)
        'tiktoken_ext.openai_public', 'tiktoken_ext',
        
        # Sentence transformers
        'sentence_transformers',
        
        # Google AI
        'google.generativeai',
        
        # System tray
        'pystray', 'PIL',
        
        # Alembic
        'alembic', 'alembic.config', 'alembic.command',
        
        # App modules
        'app', 'app.main', 'app.config', 'app.database',
        'app.models', 'app.api', 'app.services', 'app.tasks',
        'app.core',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary large packages
        'matplotlib', 'scipy', 'pandas', 'jupyter',
        'IPython', 'notebook', 'pytest',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='RAGChecker',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,       # Comprima binaries
    console=False,   # NU arata consola (fereastra neagra)
    icon='icon.ico' if os.path.exists('icon.ico') else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    name='RAGChecker',
)
```

#### Build steps:

```bash
# 1. Build frontend
cd frontend
npm run build
# Copiaza dist/ → backend/static/
cp -r dist/ ../backend/static/

# 2. Build .exe
cd ../backend
pip install pyinstaller
pyinstaller ragchecker.spec

# 3. Output in: dist/RAGChecker/
#    - RAGChecker.exe
#    - _internal/ (Python + dependinte)
#    - static/ (frontend)
#    - alembic/ (migrations)

# 4. Zip pt distributie
cd dist
powershell Compress-Archive -Path RAGChecker -DestinationPath RAGChecker.zip
# Rezultat: RAGChecker.zip (~400MB)
```

#### Probleme Cunoscute + Solutii:

**P1: Windows Defender blocheaza .exe-ul**
- Cauza: PyInstaller .exe sunt frecvent flagged ca malware (false positive)
- Solutie temporara: Colegii adauga exceptie in Windows Defender
- Solutie permanenta: Code signing certificate (~$100-300/an)
- Instructiuni pt colegi: "Click 'More info' → 'Run anyway'"

**P2: tiktoken crash la runtime**
- Cauza: Rust extension nu e gasit de PyInstaller
- Solutie: `hiddenimports=['tiktoken_ext.openai_public', 'tiktoken_ext']`
- Fallback: codul deja are fallback la `len(text)//4` daca tiktoken lipseste

**P3: sentence-transformers descarca model la prima rulare**
- Cauza: modelul (~120MB) nu e in .exe
- Solutie: La prima rulare, afiseaza "Se descarca modelul AI... (120MB, o singura data)"
- Cache in: `C:\Users\Coleg\AppData\Roaming\RAGChecker\models\`

**P4: .exe de 600-800MB necomprimat**
- Cauza: PyTorch (~300MB) + Python runtime (~100MB) + restul
- Solutie: UPX compression in .spec reduce cu ~30%. Zip la distributie.
- Alternativa: inlocuieste sentence-transformers cu onnxruntime (reduce la ~300MB total)

**P5: Port 8000 ocupat de alta aplicatie**
- Cauza: alt serviciu pe PC-ul colegului foloseste portul
- Solutie: launcher.py incearca porturile 8000, 8001, 8002 pana gaseste unul liber

**P6: Dublu-click porneste doua instante**
- Cauza: utilizatorul e nerabdator
- Solutie: `is_port_in_use()` check — a doua instanta doar deschide browser-ul

---

## Structura Fisiere Finala (DUAL-MODE)

```
rag/
├── backend/                          # EXISTENT (modificat)
│   ├── app/
│   │   ├── main.py                   # MODIFICAT: +auto-migrate, +static serving, -Redis
│   │   ├── config.py                 # MODIFICAT: +AppData config, -Redis/Celery settings
│   │   ├── database.py               # MODIFICAT: +SSL support pt Neon
│   │   ├── worker.py                 # NOU: thread-based task runner
│   │   ├── setup.py                  # NOU: first-run config
│   │   ├── api/
│   │   │   ├── health.py             # MODIFICAT: -Redis check
│   │   │   ├── documents.py          # MODIFICAT: worker.submit_task() in loc de .delay()
│   │   │   ├── requirements.py       # MODIFICAT: la fel
│   │   │   └── evaluations.py        # MODIFICAT: la fel
│   │   ├── tasks/
│   │   │   ├── celery_app.py         # STERS
│   │   │   ├── process_document.py   # MODIFICAT: -Celery decorator, +retry manual
│   │   │   ├── extract_requirements.py # MODIFICAT: la fel
│   │   │   └── run_evaluation.py     # MODIFICAT: la fel
│   │   └── ...                       # Restul neschimbat
│   ├── launcher.py                   # NOU: entry point + tray icon
│   ├── ragchecker.spec               # NOU: PyInstaller config
│   ├── static/                       # NOU: frontend built (copiat din frontend/dist/)
│   └── requirements.txt              # MODIFICAT: +pystray, +Pillow, -celery, -redis
│
├── frontend/                 # NOU (inlocuieste frontend/)
│   ├── package.json                  # Vite + React Router
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                  # Entry point
│   │   ├── App.tsx                   # Router declarations
│   │   ├── globals.css               # COPIAT din frontend/
│   │   ├── pages/                    # Redenumit din app/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── NewProject.tsx
│   │   │   ├── ProjectPage.tsx
│   │   │   ├── RequirementsPage.tsx
│   │   │   ├── EvaluationPage.tsx
│   │   │   └── ReportPage.tsx
│   │   ├── components/               # COPIAT din frontend/ (neschimbat)
│   │   └── lib/                      # COPIAT din frontend/ (neschimbat)
│   └── dist/                         # Build output → copiat in backend/static/
│
├── frontend/                         # RESCRIS: Next.js → Vite SPA (acelasi folder, continut nou)
├── docker-compose.yml                # UPDATAT: 3 servicii (postgres + backend + frontend)
├── .env.example                      # Pt modul server
├── PLAN.md                           # Planul original (backend Docker)
├── plan_vrem_executabil.md           # Planul desktop .exe (acest fisier)
│
├── .github/
│   └── workflows/
│       └── build-exe.yml             # NOU: GitHub Actions pt build Windows .exe
│
└── scripts/
    └── build-desktop.sh              # NOU: Build frontend + copy to backend/static/
```

---

## Cum se deployeaza fiecare mod

### Modul A: Desktop .exe (pt colegi)

```
1. Download RAGChecker.zip (~200MB)
2. Unzip
3. Dublu-click RAGChecker.exe
4. Setup wizard (API key + Neon URL)
5. Gata
```

### Modul B: Server Docker (pt firma)

```bash
1. git clone https://github.com/USER/rag.git
2. cp .env.example .env && nano .env  # pune GEMINI_API_KEY
3. docker compose up -d --build
4. docker compose exec backend alembic upgrade head
5. Deschide http://server-ip:3000
```

### Modul C: Development local

```bash
1. git clone ...
2. cp .env.example .env
3. docker compose up postgres -d     # doar DB
4. cd backend && pip install -r requirements.txt
5. APP_MODE=server uvicorn app.main:app --reload
6. cd frontend && npm run dev  # alt terminal
```

---

## Checklist Final — Ce Primeste Colegul (Desktop .exe)

```
✅ RAGChecker.zip (download o singura data, ~200MB cu fastembed)
✅ Unzip oriunde (Desktop, Documents, etc.)
✅ Dublu-click RAGChecker.exe
✅ Prima data: setup wizard (API key + DB URL, 1 minut)
✅ Prima data: descarca model AI (~80MB, automat)
✅ Aplicatia se deschide in browser
✅ Iconica in system tray (dreapta-jos langa ceas)
✅ "Inchide" din tray → se opreste totul

Nu trebuie:
❌ Python
❌ Node.js
❌ Docker
❌ PostgreSQL
❌ Cunostinte tehnice
❌ Linie de comanda
```

## Checklist — Server Docker (Modul B)

```
✅ Un server (fizic, VPS, sau PC vechi) cu Docker instalat
✅ git clone + docker compose up -d --build
✅ Configureaza .env (GEMINI_API_KEY + optional EMBEDDING_DIMENSIONS)
✅ Colegii acceseaza http://server-ip:3000 din browser
✅ Zero instalare pe PC-urile colegilor

Avantaje vs Desktop:
  ✅ Fara .exe, fara download 200MB pe fiecare PC
  ✅ Update centralizat (git pull && docker compose up -d)
  ✅ PostgreSQL local (zero latenta, zero Neon dependency)
  ✅ Functioneaza si fara internet (dupa ce modelul e descarcat)

Dezavantaje:
  ❌ Trebuie un server/PC care ruleaza permanent
  ❌ Cineva trebuie sa stie Docker (tu)
```

## Cand alegi Desktop vs Server

| Criteriu | Desktop .exe | Server Docker |
|----------|-------------|---------------|
| Numar colegi | 1-5 | 5-50 |
| IT knowledge | Zero (colegii) | Unu (tu) care stie Docker |
| Internet necesar | Da (Neon + Gemini) | Doar pt Gemini API |
| Update-uri | Download .exe nou | `git pull && docker compose up -d` |
| Shared data | Da (Neon cloud) | Da (PostgreSQL local) |
| Cost | $0 (Neon free) | $0 (server propriu) sau ~€5/luna VPS |
| Performanta DB | +30ms latenta (cloud) | ~1ms (local) |
| Offline capable | Partial (parsing da, AI nu) | Partial (la fel) |
| Cel mai bun pt | Firma mica, colegi non-tehnici | Firma cu server intern, IT intern |

---

## Timeline (REVIZUITA dupa review #1 + #2)

| Zi | Task | Fix-uri incluse | Output |
|----|------|-----------------|--------|
| 1 | Lazy DB init + elimina Celery/Redis → threading pool | **R13** (lazy engine), R6, R7, R18 | Backend ruleaza fara Docker, safe la prima pornire |
| 2 | Neon SSL + auto-migrate + warm-up + URL derivation | R7, R8, R9, **R14** (un URL), **R16** (info corecta) | DB in cloud, un singur camp in setup |
| 3 | **fastembed** in loc de sentence-transformers | **R15** (fastembed), R10 | Embedding functional, -290MB din .exe |
| 4-5 | Frontend Next.js → Vite SPA + Tailwind v4 + fonts | **R17** (Tailwind+fonts) | `dist/` folder static |
| 5 | FastAPI serveste static + SPA catch-all + paths.py | R2 (sys._MEIPASS) | Un singur proces |
| 6 | Setup wizard + AppData config + launcher + tray | R3 (log+crash), R4, R5, R12 | UX complet |
| 7-8 | PyInstaller packaging + hidden imports + testing local | R1, R11 | RAGChecker.exe functional |
| 9 | GitHub Actions CI/CD + testing pe Windows real | R1 (build pe Windows) | Build automat, .zip distribuit |

**Total: 9 zile de lucru.**

### Estimare .exe finala (REVIZUITA cu fastembed):

| Componenta | Cu sentence-transformers | Cu fastembed (RECOMANDAT) |
|-----------|-------------------------|--------------------------|
| Python runtime | 30MB | 30MB |
| onnxruntime | — | 50MB |
| PyTorch | 300MB | ❌ ELIMINAT |
| sentence-transformers | 50MB | ❌ ELIMINAT |
| fastembed | — | 10MB |
| Restul dependinte | 100MB | 100MB |
| Frontend static | 5MB | 5MB |
| PyInstaller overhead | 50MB | 50MB |
| **Total .exe** | **~600-700MB** | **~300-350MB** |
| **Total .zip** | **~350-400MB** | **~180-200MB** |
| Model download (prima data) | 120MB | 80MB |

### Checklist inainte de distributie la colegi:
- [ ] Build pe Windows (GitHub Actions sau nativ) — NU pe WSL2
- [ ] Test pe un PC Windows "virgin" (fara Python instalat)
- [ ] Test cu Neon DB real (nu localhost)
- [ ] Test first-run setup wizard (config.json nu exista)
- [ ] Test cu fisier .docx real de 100+ pagini
- [ ] Test inchidere + repornire (config persistat)
- [ ] Test port ocupat (alt serviciu pe 8000)
- [ ] Test dublu-click (a doua instanta)
- [ ] Verifica Windows Defender nu blocheaza .exe-ul
- [ ] Verifica log file se creeaza in AppData
- [ ] Verifica embedding model se descarca la prima rulare
