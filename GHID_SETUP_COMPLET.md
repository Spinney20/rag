# GHID COMPLET: Setup RAG Checker pe Laptop Personal

## Cuprins
1. [Pregătire laptop](#1-pregătire-laptop)
2. [Setup Neon (baza de date cloud)](#2-setup-neon-baza-de-date-cloud)
3. [Setup Gemini API Key (gratuit)](#3-setup-gemini-api-key-gratuit)
4. [Clonare proiect + primul test](#4-clonare-proiect--primul-test)
5. [Modul Server (Docker) — testare rapidă](#5-modul-server-docker--testare-rapidă)
6. [Modul Desktop (.exe) — PyInstaller build](#6-modul-desktop-exe--pyinstaller-build)
7. [Testare completă cu documente reale](#7-testare-completă-cu-documente-reale)
8. [Distribuire la colegi](#8-distribuire-la-colegi)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Pregătire laptop

### Ce trebuie instalat:

| Software | Link download | De ce |
|----------|--------------|-------|
| **Git** | https://git-scm.com/download/win | Clonare repo |
| **Python 3.12** | https://python.org/downloads/ | Backend + PyInstaller build |
| **Node.js 20** | https://nodejs.org/ (LTS) | Frontend build |
| **Docker Desktop** | https://docker.com/products/docker-desktop | Modul server (opțional) |

### La instalare Python:
- ✅ Bifează **"Add Python to PATH"** (FOARTE IMPORTANT)
- ✅ Bifează "Install for all users"

### Verificare (deschide PowerShell):
```powershell
python --version    # trebuie: Python 3.12.x
node --version      # trebuie: v20.x.x
npm --version       # trebuie: 10.x.x
git --version       # trebuie: git version 2.x.x
```

Dacă oricare comandă nu merge, închide și redeschide PowerShell (PATH-ul se actualizează la restart terminal).

---

## 2. Setup Neon (baza de date cloud)

### Pas cu pas:

**2.1.** Du-te la https://neon.tech

**2.2.** Click **"Sign Up"** → alege **"Continue with GitHub"** (sau email)

**2.3.** După login, ajungi pe Dashboard. Click **"New Project"**:
- Project name: `ragchecker`
- Region: **EU (Frankfurt)** (cel mai aproape de România)
- PostgreSQL version: **16** (default)
- Click **"Create Project"**

**2.4.** Pe pagina proiectului, vezi **"Connection Details"**. Selectează:
- **Connection string** (nu pooled connection)
- Arată cam așa:
```
postgresql://ragcheck_owner:AbC123xYz@ep-cool-name-123456.eu-central-1.aws.neon.tech/ragcheck?sslmode=require
```
- **COPIAZĂ ACEST STRING** — îl vei pune în setup wizard sau `.env`

**2.5.** Activează pgvector:
- În Neon Dashboard, click pe proiect → **"SQL Editor"** (în sidebar stânga)
- Scrie și rulează:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```
- Trebuie să vezi: "CREATE EXTENSION" × 2

**2.6.** Gata! Baza de date e live. Nu trebuie nimic altceva.

### Ce ai acum:
```
URL Neon: postgresql://ragcheck_owner:AbC123xYz@ep-cool-name-123456.eu-central-1.aws.neon.tech/ragcheck?sslmode=require
```
Ține-l la îndemână — îl pui la pasul 4 sau 5.

### Limitări free tier:
- 512 MB storage (~60 proiecte de construcții)
- Compute se suspendă după 5 min inactivitate (cold start 3-5s la repornire)
- Datele NU se șterg (doar compute-ul se oprește temporar)

---

## 3. Setup Gemini API Key (gratuit)

### Pas cu pas:

**3.1.** Du-te la https://aistudio.google.com/apikey

**3.2.** Logare cu contul Google (orice cont Gmail)

**3.3.** Click **"Create API Key"**

**3.4.** Selectează un proiect Google Cloud (sau lasă "Create new project")

**3.5.** Click **"Create API Key in Existing Project"**

**3.6.** Se generează o cheie care arată cam așa:
```
AIzaSyD_abcdefghijklmnopqrstuvwxyz12345
```

**3.7.** **COPIAZ-O** și ține-o la îndemână.

### Ce ai acum:
```
Gemini API Key: AIzaSyD_cheia_ta_aici
```

### Limitări free tier:
- 15 requests/minut
- 1,500,000 tokeni/zi
- Suficient pentru ~100-150 evaluări pe zi
- Zero cost, zero card bancar

---

## 4. Clonare proiect + primul test

### 4.1. Clonare (PowerShell):
```powershell
# Du-te unde vrei să pui proiectul
cd C:\Users\TU\Documents

# Clonează (înlocuiește URL-ul cu al tău de pe GitHub)
git clone https://github.com/USERNAME/rag.git
cd rag
```

### 4.2. Configurare Git local:
```powershell
git config --local user.name "Numele Tau"
git config --local user.email "email@tau.com"
```

### 4.3. Instalare dependințe backend:
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1

# Dacă primești eroare "execution policy":
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
.\venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

**ATENȚIE:** Instalarea durează 3-5 minute (descarcă PyTorch/fastembed/etc.)

### 4.4. Instalare dependințe frontend:
```powershell
cd ..\frontend
npm install
```

### 4.5. Build frontend:
```powershell
npm run build
```

Trebuie să vezi:
```
✓ built in XXXms
dist/index.html
dist/assets/index-XXX.js
dist/assets/index-XXX.css
```

### 4.6. Configurare `.env`:
```powershell
cd ..
# Copiază exemplul
copy .env.example .env

# Editează .env (cu Notepad sau VS Code)
notepad .env
```

**Pune valorile tale:**
```bash
APP_MODE=server
DATABASE_URL=postgresql+asyncpg://ragcheck_owner:PAROLA_TA@ep-cool-name.eu-central-1.aws.neon.tech/ragcheck
DATABASE_URL_SYNC=postgresql://ragcheck_owner:PAROLA_TA@ep-cool-name.eu-central-1.aws.neon.tech/ragcheck?sslmode=require
GEMINI_API_KEY=AIzaSyD_cheia_ta_aici
EMBEDDING_PROVIDER=fastembed
EMBEDDING_DIMENSIONS=384
UPLOAD_DIR=./uploads
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

**IMPORTANT:** `DATABASE_URL` (async) nu are `?sslmode=require` la sfârșit.
`DATABASE_URL_SYNC` ARE `?sslmode=require`.

### 4.7. Primul test — pornește backend-ul:
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Trebuie să vezi:
```
INFO     Running database migrations...
INFO     Database migrations complete
INFO     Warming up database connection...
INFO     Database connected
INFO     RAG Checker ready
INFO     Uvicorn running on http://127.0.0.1:8000
```

### 4.8. Test health:
Deschide alt terminal PowerShell:
```powershell
curl http://localhost:8000/api/health
```
Trebuie să vezi: `{"status":"ok","database":"ok","mode":"server"}`

### 4.9. Deschide în browser:
```
http://localhost:8000
```
Trebuie să vezi interfața RAG Checker (dark theme, sidebar, dashboard).

**Dacă vezi "Frontend not built":** Asigură-te că ai făcut `npm run build` la pasul 4.5.

### 4.10. Test cu frontend dev (hot reload):
```powershell
# Alt terminal
cd frontend
npm run dev
```
Deschide `http://localhost:3000` — aceeași interfață dar cu hot reload (se actualizează instant când editezi codul).

---

## 5. Modul Server (Docker) — testare rapidă

**Acest pas e OPȚIONAL.** Dacă vrei doar .exe pentru colegi, sari la pasul 6.

### 5.1. Asigură-te că Docker Desktop e pornit.

### 5.2. Configurare:
Editează `.env` (sau creează `.env` la root):
```bash
GEMINI_API_KEY=AIzaSyD_cheia_ta_aici
```

### 5.3. Pornire:
```powershell
cd C:\Users\TU\Documents\rag
docker compose up -d --build
```

Prima dată durează 5-10 minute (descarcă imagini Docker, instalează dependințe).

### 5.4. Verificare:
```powershell
docker compose logs -f backend
```
Așteaptă până vezi `RAG Checker ready`.

### 5.5. Deschide:
```
http://localhost:8000
```

### 5.6. Oprire:
```powershell
docker compose down
```

---

## 6. Modul Desktop (.exe) — PyInstaller build

### CE OBȚII: Un folder `RAGChecker/` cu `RAGChecker.exe` pe care îl dai colegilor.

### 6.1. Creează fișierul PyInstaller spec:

Creează fișierul `backend/ragchecker.spec`:
```python
# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect data files for problematic packages
datas = [
    ('static/', 'static/'),           # Frontend built files
    ('alembic/', 'alembic/'),          # DB migrations
    ('alembic.ini', '.'),              # Alembic config
    ('app/setup_page.html', 'app/'),   # Setup wizard fallback
]

# Add tiktoken data files
try:
    datas += collect_data_files('tiktoken')
    datas += collect_data_files('tiktoken_ext')
except Exception:
    pass

hiddenimports = [
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

    # asyncpg
    'asyncpg.protocol.protocol',

    # tiktoken
    'tiktoken_ext.openai_public', 'tiktoken_ext',

    # Google AI
    'google.generativeai',
    'google.auth', 'google.auth.transport', 'google.auth.transport.requests',
    'google.api_core', 'google.api_core.exceptions',

    # fastembed
    'fastembed',

    # python-docx
    'docx', 'docx.opc', 'docx.opc.constants', 'docx.opc.package',

    # reportlab
    'reportlab', 'reportlab.graphics', 'reportlab.lib.colors',

    # System tray
    'pystray', 'PIL',

    # Alembic
    'alembic', 'alembic.config', 'alembic.command',

    # App modules
    'app', 'app.main', 'app.config', 'app.database',
    'app.models', 'app.api', 'app.services', 'app.tasks',
    'app.core', 'app.worker', 'app.setup',
]

# Add all submodules for problematic packages
try:
    hiddenimports += collect_submodules('tiktoken')
    hiddenimports += collect_submodules('tiktoken_ext')
    hiddenimports += collect_submodules('fastembed')
except Exception:
    pass

a = Analysis(
    ['launcher.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib', 'scipy', 'pandas', 'jupyter',
        'IPython', 'notebook', 'pytest', 'torch',
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
    upx=True,
    console=False,  # NU arată consolă neagră
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

### 6.2. Pregătire build:

```powershell
# 1. Activează venv
cd C:\Users\TU\Documents\rag\backend
.\venv\Scripts\Activate.ps1

# 2. Instalează PyInstaller
pip install pyinstaller

# 3. Build frontend (dacă nu l-ai făcut deja)
cd ..\frontend
npm run build

# 4. Copiază frontend build în backend/static/
xcopy /E /I /Y dist ..\backend\static

# 5. Înapoi în backend
cd ..\backend
```

### 6.3. Build .exe:

```powershell
pyinstaller ragchecker.spec
```

**Durează 3-10 minute.** Vei vedea multe mesaje de procesare.

La final:
```
Building COLLECT COLLECT-00.toc completed successfully.
```

### 6.4. Output:

```
backend/dist/RAGChecker/
├── RAGChecker.exe          ← ASTA dai colegilor
├── _internal/              ← Python runtime + dependințe
│   ├── python312.dll
│   ├── ... (~500 fișiere)
├── static/                 ← Frontend (HTML/CSS/JS)
├── alembic/                ← Migrări DB
├── alembic.ini
└── app/
    └── setup_page.html     ← Setup wizard fallback
```

### 6.5. Test .exe:

```powershell
cd dist\RAGChecker
.\RAGChecker.exe
```

**Ce trebuie să se întâmple:**
1. Se deschide Chrome/Edge automat la `http://localhost:8000/setup`
2. Vezi pagina de setup (fundal negru, formular cu 2 câmpuri)
3. Introdu Gemini API Key + Neon URL
4. Click "Salvează"
5. Mesaj: "Configurare salvată. Închide și redeschide."
6. Apasă pe `RAGChecker` în system tray (dreapta-jos lângă ceas) → "Închide"
7. Dublu-click pe `RAGChecker.exe` din nou
8. Se deschide browser-ul cu aplicația funcțională
9. Apare icon în system tray: ⚡ RAG Checker

### 6.6. Dacă Windows Defender blochează:

Vei vedea probabil: **"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting"**

Soluție:
1. Click **"More info"**
2. Click **"Run anyway"**

Pentru colegi: trimite-le instrucțiunea de mai sus. Sau adaugă excepție în Windows Defender:
- Settings → Windows Security → Virus & threat protection → Manage settings
- Exclusions → Add exclusion → Folder → selectează folderul RAGChecker

### 6.7. Zip pentru distribuire:

```powershell
cd C:\Users\TU\Documents\rag\backend\dist
# Click dreapta pe folderul RAGChecker → Send to → Compressed (zipped) folder
# SAU:
Compress-Archive -Path RAGChecker -DestinationPath RAGChecker.zip
```

Rezultat: `RAGChecker.zip` (~200-400 MB)

---

## 7. Testare completă cu documente reale

### 7.1. Pregătește documente de test:

Ai nevoie de:
- **Caiet de Sarcini** (.docx) — convertit din PDF cu Adobe Acrobat
- **Propunere Tehnică** (.docx) — document Word original

Dacă nu ai documente reale, creează un CS simplu de test (10-20 pagini) cu:
- Heading-uri reale (Heading 1: "Capitolul 1", Heading 2: "1.1 Materiale")
- Cerințe tehnice ("Betonul va fi de clasă C25/30 conform SR EN 206")
- Un tabel cu specificații materiale

### 7.2. Flow de test complet:

1. **Creează proiect** → "Test DJ714" → Submit
2. **Upload CS** (.docx) → drag & drop în zona "Caiet de Sarcini"
3. **Upload PT** (.docx) → drag & drop în zona "Propunere Tehnică"
4. **Așteaptă procesare** → documentele trec prin: parsing → chunking → embedding
5. **Click "Extrage Cerințe"** → AI extrage cerințe atomice din CS (1-5 minute)
6. **Revizuiește cerințele** → verifică că au sens, șterge pe cele greșite
7. **Click "Validează și Continuă"**
8. **Pe pagina Evaluare** → click "Estimează și Lansează"
9. **Confirmă** → AI evaluează fiecare cerință (5-20 minute, depinde de număr)
10. **Rezultate** → tab-uri: Probleme / De verificat / Conform
11. **Raport** → click "Export PDF" → descarcă PDF-ul generat

### 7.3. Ce să verifici:

- [ ] Documentele se procesează fără eroare (status "Ready")
- [ ] Cerințele extrase au sens (nu sunt gibberish)
- [ ] Categoriile sunt corecte (tehnic, materiale, etc.)
- [ ] Evaluarea produce verdicts (CONFORM/NECONFORM/PARTIAL)
- [ ] Citatele din PT sunt text REAL (nu fabricat)
- [ ] PDF-ul se generează și arată bine
- [ ] Dacă închizi și redeschizi app-ul, datele sunt păstrate (Neon)

---

## 8. Distribuire la colegi

### Ce trimiti colegului:

**Varianta A: .exe (desktop)**
```
1. Trimite RAGChecker.zip pe Teams/email/SharePoint
2. Instrucțiuni pentru coleg:
   a) Download RAGChecker.zip
   b) Unzip (click dreapta → Extract All)
   c) Dublu-click RAGChecker.exe
   d) Dacă Windows blochează: "More info" → "Run anyway"
   e) Completează setup: Gemini Key + Neon URL
   f) Gata!
```

**Varianta B: browser (server)**
```
1. Pornește Docker pe un PC/server din firmă
2. docker compose up -d --build
3. Dă-le colegilor URL-ul: http://192.168.1.X:8000
4. Zero instalare pe PC-urile lor
```

### Gemini API Key — una pentru toți sau separate?

**Opțiunea 1:** O singură cheie partajată (simplest)
- Toți colegii folosesc aceeași cheie
- Risc: dacă un coleg face 1000 de requests, ceilalți sunt blocați (rate limit)
- OK pentru echipă mică (3-5 persoane)

**Opțiunea 2:** Fiecare coleg cu cheia lui
- Fiecare își face cont Google + cheie API
- Mai sigur, fără interferență
- Recomandat dacă >5 colegi

### Neon Database — una pentru toți

- **O singură bază de date** partajată de toți colegii
- Toți văd aceleași proiecte
- Fiecare coleg pune ACELAȘI Neon URL în setup

---

## 9. Troubleshooting

### "Frontend not built"
```powershell
cd frontend
npm run build
xcopy /E /I /Y dist ..\backend\static
```

### "Database not configured"
- Verifică `.env` — `DATABASE_URL` trebuie să fie corect
- Sau: deschide `http://localhost:8000/setup` și completează formularul

### "Connection refused" la Neon
- Verifică URL-ul Neon (copy-paste din dashboard)
- Verifică că ai internet
- Neon cold start: prima conexiune după 5 min inactivitate durează 3-5 secunde

### PyInstaller: "ModuleNotFoundError: No module named X"
- Adaugă modulul lipsă în `hiddenimports` din `ragchecker.spec`
- Re-build: `pyinstaller ragchecker.spec`

### PyInstaller: .exe de 1GB+
- Verifică că `torch` e în `excludes` (nu ar trebui să fie inclus cu fastembed)
- Dacă sentence-transformers e instalat, trage PyTorch. Dezinstalează-l dacă folosești doar fastembed:
  ```powershell
  pip uninstall sentence-transformers torch
  pip install fastembed
  ```

### Windows Defender blochează .exe-ul
- "More info" → "Run anyway"
- Sau: adaugă excepție în Windows Security → Exclusions

### "Port 8000 is already in use"
- Alt program folosește portul. Verifică cu:
  ```powershell
  netstat -ano | findstr :8000
  ```
- Oprește procesul sau folosește alt port (dar trebuie schimbat și în cod)

### Embedding model download lent
- Prima rulare descarcă ~80MB (fastembed model)
- Pe internet lent, poate dura 2-3 minute
- Modelul se salvează în AppData/RAGChecker/models/ — o singură dată

### Neon: "permission denied for extension vector"
- Du-te pe Neon Dashboard → SQL Editor → rulează:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
- Sau: Settings → Extensions → Enable "vector"

### Log-uri (desktop mode)
Dacă ceva nu merge și nu vezi eroarea:
```
Windows: C:\Users\TU\AppData\Roaming\RAGChecker\ragchecker.log
Linux:   ~/.ragchecker/ragchecker.log
```

---

## Sumar rapid

```
1. python + node + git instalate           ✓ 5 min
2. Neon.tech signup + create DB            ✓ 2 min
3. aistudio.google.com → API key           ✓ 1 min
4. git clone + npm install + pip install   ✓ 10 min
5. npm run build (frontend)                ✓ 1 min
6. uvicorn → test localhost:8000           ✓ 1 min
7. pyinstaller → RAGChecker.exe            ✓ 10 min
8. Test cu .docx real                      ✓ 15 min
9. Zip + trimis la colegi                  ✓ 5 min
─────────────────────────────────────────
TOTAL:                                     ~50 minute
```
