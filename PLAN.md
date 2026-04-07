# Plan de Implementare: Sistem RAG Anti-Halucinare pentru Verificare Propuneri Tehnice Constructii

## Context

O firma de constructii participa la licitatii publice. La fiecare licitatie, beneficiarul da:
- **Caiet de Sarcini (CS)** — document cu sute de pagini, contine TOATE cerintele tehnice
- **Fisa de Date (FDA)** — cerinte administrative/procedurale

Firma scrie o **Propunere Tehnica (PT)** care trebuie sa respecte TOATE cerintele din CS + FDA.

**Problema:** Verificarea manuala a conformitatii PT vs CS e extrem de laborioasa si predispusa la erori.

**Solutia:** Un sistem SaaS care:
1. Ingereaza CS (.docx) + FDA (.docx) + PT (.docx) — toate ca Word
2. Extrage cerinte atomice din CS/FDA
3. Verifica automat daca PT satisface fiecare cerinta
4. Genereaza raport cu neconcordante

**Provocarea critica:** Documentele CS au sute de pagini. AI-ul trebuie sa NU halucineze — fiecare afirmatie trebuie ancorata in textul real al documentelor.

**DECIZIE ARHITECTURALA: DOAR FISIERE .DOCX**
Toate documentele (CS, FDA, PT) se uploadeaza EXCLUSIV ca fisiere Word (.docx).
Daca sursa e PDF, echipa il converteste in Word inainte (Adobe Acrobat, etc.).
Avantaje: zero cost OCR, structura reala din Word (headings, tabele), userul verifica vizual calitatea conversiei.
Asta elimina complet: Mistral OCR, Surya, PDF splitting, OCR postprocessing, document_pages table.

---

## 0. GLOSAR DE TERMENI

| Termen | Abreviere | Rol in Sistem |
|--------|-----------|---------------|
| Caiet de Sarcini | CS | SURSA DE ADEVAR. Contine cerintele tehnice. Upload ca .docx. |
| Fisa de Date | FDA | Sursa secundara. Cerinte administrative/procedurale. Upload ca .docx. |
| Propunere Tehnica | PT | DOCUMENTUL TESTAT. Upload ca .docx. Trebuie sa fie conform cu CS+FDA. |
| CONFORM | - | Verdict: PT respecta cerinta |
| NECONFORM | - | Verdict: PT nu respecta sau omite cerinta |
| PARTIAL | - | Verdict: PT acopera partial cerinta |
| INSUFFICIENT_DATA | - | Verdict: Nu s-a gasit suficienta informatie in PT |
| SR EN / STAS / NP | - | Standarde romanesti/europene referentiate in CS |

---

## 1. TECH STACK

### 1.1 Stack PRODUCTIE

| Componenta | Tehnologie | Justificare |
|------------|-----------|-------------|
| Backend API | **FastAPI** (Python 3.12) | Async nativ, Pydantic validation, ideal pt AI workloads |
| Baza de date | **PostgreSQL 16 + pgvector** | O singura BD pt tot: relational + vectori + full-text search |
| Task Queue | **Celery + Redis** | Redis ca broker e suficient pt scala MVP. Celery pt long-running tasks |
| Document Parsing | **python-docx** | Parsare Word: headings reale, tabele structurate, formatting |
| Embeddings | **OpenAI text-embedding-3-small** (1536 dim) | Cost-eficient, calitate buna |
| LLM Evaluare | **Claude Sonnet** sau **GPT-4o** | Pt extragere cerinte + evaluare conformitate |
| LLM Rewrite/Rerank | **Claude Haiku** sau **GPT-4o-mini** | Pt query rewriting + batch reranking (ieftin, rapid) |
| Frontend | **Next.js 14 + Tailwind CSS** | App Router, Server Components, rapid de construit |
| File Storage | **Local filesystem** (MVP) / **MinIO** (later) | Fisierele uploadate |
| Containerizare | **Docker Compose** | Tot stack-ul local intr-o comanda |

**NOTA: ~~OCR~~ ELIMINAT.** Toate documentele sunt .docx (convertite de echipa din PDF cu Adobe Acrobat inainte de upload). Zero cost OCR. Structura reala din Word styles.

### 1.2 Stack TESTARE (100% GRATUIT — $0)

| Componenta | Testare GRATUITA | Calitate vs Prod | Nota |
|------------|-----------------|-------------------|------|
| Document Parsing | **python-docx** (identic cu prod) | 100% | Acelasi parser, zero diferenta |
| Embeddings | **sentence-transformers** local | ~85% | `paraphrase-multilingual-MiniLM-L12-v2`, 384 dim, CPU |
| LLM Principal | **Google Gemini 2.0 Flash** | ~65-70% | FREE: 15 RPM, 1.5M tok/zi, key de pe aistudio.google.com |
| LLM Secundar | **Gemini 2.0 Flash** (acelasi) | ~65% | Folosim acelasi model pt rewrite/rerank (gratuit) |

**Nota:** Parsarea documentelor (python-docx) e IDENTICA in testare si productie — nu depinde de AI.
Singura diferenta: modelul LLM (Gemini vs Sonnet). Switch la productie = 2 variabile in `.env`.

### 1.3 Abstractizare Multi-Provider (OBLIGATORIE)

Toate componentele AI sunt abstractizate in spate unui interface — switch-ul intre testare si productie
e O SINGURA VARIABILA DE MEDIU, fara schimbare de cod.

**`core/llm.py`** — LLM client unificat:
```python
class LLMClient:
    """Client LLM abstract. Provider se schimba din .env."""
    
    def __init__(self):
        self.provider = settings.LLM_PROVIDER  # "gemini" | "anthropic" | "openai"
        self.model = settings.LLM_MODEL
        self.model_cheap = settings.LLM_MODEL_CHEAP  # pt rewrite/rerank
    
    async def call_structured(self, prompt: str, response_model: type[BaseModel]) -> BaseModel:
        if self.provider == "gemini":
            return await self._gemini_structured(prompt, response_model)
        elif self.provider == "anthropic":
            return await self._anthropic_structured(prompt, response_model)
        elif self.provider == "openai":
            return await self._openai_structured(prompt, response_model)
    
    async def _gemini_structured(self, prompt, response_model):
        import google.generativeai as genai
        model = genai.GenerativeModel(self.model)
        response = await model.generate_content_async(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=response_model.model_json_schema(),
            ),
        )
        return response_model.model_validate_json(response.text)
    
    async def _anthropic_structured(self, prompt, response_model):
        # FIX 43: tool_choice pt schema enforcement
        ...
    
    async def _openai_structured(self, prompt, response_model):
        # FIX 43: json_schema response_format
        ...
```

**`services/embedding_service.py`** — embedding multi-provider:
```python
class EmbeddingService:
    """Embedding abstract. Provider din .env."""
    
    def __init__(self):
        self.provider = settings.EMBEDDING_PROVIDER  # "local" | "openai"
        if self.provider == "local":
            from sentence_transformers import SentenceTransformer
            self.local_model = SentenceTransformer(settings.EMBEDDING_MODEL_LOCAL)
            self.dimensions = self.local_model.get_sentence_embedding_dimension()
        else:
            self.dimensions = settings.EMBEDDING_DIMENSIONS
    
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if self.provider == "local":
            # Ruleaza pe CPU, sincron dar rapid pt batch-uri mici
            return self.local_model.encode(texts).tolist()
        elif self.provider == "openai":
            response = await openai_client.embeddings.create(
                model=settings.EMBEDDING_MODEL, input=texts
            )
            return [e.embedding for e in response.data]
```

**`services/word_parser_service.py`** — parsare Word (.docx):
```python
class WordParserService:
    """Parseaza .docx in Markdown structurat. Singura sursa de input (DOCX-only)."""
    
    def parse(self, docx_path: str) -> ParseResult:
        from docx import Document
        doc = Document(docx_path)
        
        markdown_parts = []
        for element in doc.element.body:
            if element.tag.endswith('tbl'):
                # TABEL: conversie la Markdown table
                table = self._find_table_by_element(doc, element)
                markdown_parts.append(self._table_to_markdown(table))
            elif element.tag.endswith('p'):
                para = self._find_paragraph_by_element(doc, element)
                markdown_parts.append(self._paragraph_to_markdown(para))
        
        return ParseResult(
            markdown="\n\n".join(markdown_parts),
            word_count=sum(len(p.split()) for p in markdown_parts),
            heading_count=sum(1 for p in doc.paragraphs if p.style.name.startswith('Heading')),
        )
    
    def _paragraph_to_markdown(self, para) -> str:
        # Converteste Word heading styles in Markdown headings
        style = para.style.name
        if style == 'Heading 1': return f"# {para.text}"
        if style == 'Heading 2': return f"## {para.text}"
        if style == 'Heading 3': return f"### {para.text}"
        if style == 'Heading 4': return f"#### {para.text}"
        # Bold la nivel de paragraf
        if para.runs and all(r.bold for r in para.runs if r.text.strip()):
            return f"**{para.text}**"
        return para.text
    
    def _table_to_markdown(self, table) -> str:
        rows = []
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            rows.append("| " + " | ".join(cells) + " |")
        if len(rows) >= 2:
            # Adauga separator dupa header
            cols = len(table.rows[0].cells)
            rows.insert(1, "| " + " | ".join(["---"] * cols) + " |")
        return "\n".join(rows)
```

**Avantajul DOCX-only:** `python-docx` ne da heading styles REALE (Heading 1/2/3), tabele REALE
(rows/columns), bold/italic — fara nicio detectie regex sau OCR. Structura documentului e GARANTATA.

### 1.4 Configurare .env — Switch Testare ↔ Productie

```bash
# ============================================================
# PROFIL TESTARE (GRATUIT — $0)
# ============================================================
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.0-flash
LLM_MODEL_CHEAP=gemini-2.0-flash          # Acelasi model (gratuit)
GEMINI_API_KEY=your_free_key_from_aistudio_google_com

EMBEDDING_PROVIDER=local
EMBEDDING_MODEL_LOCAL=paraphrase-multilingual-MiniLM-L12-v2
EMBEDDING_DIMENSIONS=384                    # 384 pt local model

# ============================================================
# PROFIL PRODUCTIE (platit — ~$13/evaluare)
# ============================================================
# LLM_PROVIDER=anthropic
# LLM_MODEL=claude-sonnet-4-20250514
# LLM_MODEL_CHEAP=claude-haiku-4-5-20251001
# ANTHROPIC_API_KEY=sk-...
#
# EMBEDDING_PROVIDER=openai
# EMBEDDING_MODEL=text-embedding-3-small
# EMBEDDING_DIMENSIONS=1536
# OPENAI_API_KEY=sk-...
#
# OCR_PROVIDER=mistral
# MISTRAL_API_KEY=...
```

**Switch intre profile:** decomentezi un bloc, comentezi celalalt. Zero schimbare de cod.

### 1.5 Dependinte suplimentare pt testare (requirements.txt)

```
# AI Testing (gratuit, local)
sentence-transformers>=3.0     # Embeddings locale (CPU)
google-generativeai>=0.8       # Gemini Free API
surya-ocr>=0.6                 # OCR local pt scanate (optional, ~500MB model)
```

Notele:
- `sentence-transformers` descarca modelul (~120MB) la prima rulare
- `surya-ocr` descarca modele de detectie+recunoastere (~500MB) la prima rulare
- Ambele ruleaza pe CPU — nu necesita GPU
- `google-generativeai` e lightweight (~5MB)

---

## 2. ARHITECTURA ANTI-HALUCINARE — CELE 6 STRATURI DE PROTECTIE

Halucinarea poate aparea la ORICE nivel al pipeline-ului. Fiecare strat are protectii specifice:

### STRATUL 1: Fidelitatea Inputului (DOCX-only)
**Decizie:** Toate documentele se uploadeaza ca .docx. Echipa converteste PDF→Word cu Adobe Acrobat.
**Protectii:**
- Userul verifica VIZUAL calitatea conversiei Word INAINTE de upload (cel mai bun QA posibil)
- python-docx extrage heading-uri REALE (nu regex pe OCR) si tabele STRUCTURATE (nu OCR'd)
- Zero erori OCR (nu exista OCR in pipeline)
- FIX 34 (doc type detection) verifica daca CS/PT sunt in slot-urile corecte
- Normalizare diacritice romanesti (FIX 23) ramane activa pe textul extras

### STRATUL 2: Chunking cu Pastrarea Contextului (SECTIUNEA CRITICA — detaliat la Sectiunea 5)
**Problema:** Chunking naiv distruge contextul. O cerinta "Betonul trebuie sa fie C25/30 conform SR EN 206" taiata la mijloc = informatie pierduta.
**Protectii:**
- **DOCX-only BONUS:** Heading-urile sunt REALE (Word styles), nu detectate cu regex fragil
- "Breadcrumb" context pe fiecare chunk: `"Cap.3: Specificatii > 3.2: Structura > 3.2.1: Fundatii"`
- Overlap intre chunk-uri consecutive (ultimele 2 propozitii din chunk N = primele 2 din chunk N+1)
- Nu taiem NICIODATA la mijloc de propozitie sau cerinta
- Tabelele sunt obiecte Word REALE → se pastreaza atomice cu structura intacta
- DUBLA STOCARE: chunk cu context (pt retrieval) + chunk raw (pt citare exacta)

### STRATUL 3: Retrieval de Inalta Precizie (detaliat la Sectiunea 6)
**Problema:** Daca retrievalul aduce chunk-uri gresite, LLM-ul face evaluari pe informatii irelevante.
**Protectii:**
- **Hybrid Search**: vector similarity (intelege sensul) + BM25 keyword search (gaseste exact "C25/30", "SR EN 206")
- **Multi-Query**: pt fiecare cerinta, generam 3 interogari din unghiuri diferite
- **Cross-Encoder Reranking**: dupa retrieval initial, reranking cu model mai precis
- **Retrieval generos**: aducem top 20, reranking la top 8, folosim top 5 pt evaluare
- **Verification Pass**: daca verdict = NECONFORM, facem INCA o cautare cu query-uri diferite (sa nu ratam info)

### STRATUL 4: Evaluare cu Citare Obligatorie (detaliat la Sectiunea 7)
**Problema:** LLM-ul poate fabrica informatii sau generaliza excesiv.
**Protectii:**
- **Structured Output** (JSON schema strict): verdict + citate exacte + rationament pas cu pas
- **Citare obligatorie**: LLM-ul TREBUIE sa citeze text exact din PT pt fiecare afirmatie
- **INSUFFICIENT_DATA** ca verdict valid (nu forteaza binary CONFORM/NECONFORM)
- **Prompt ultra-restrictiv**: "Foloseste DOAR informatia din chunk-urile date. Daca nu gasesti, spune ca nu gasesti."

### STRATUL 5: Verificare Programatica a Citatelor (detaliat la Sectiunea 8)
**Problema:** Chiar cu prompt bun, LLM-ul poate cita gresit sau parafrazat in loc de citat exact.
**Protectii:**
- Dupa ce LLM-ul returneaza evaluarea, verificam PROGRAMATIC ca fiecare "citat exact" exista in chunk-urile sursa
- Fuzzy matching cu threshold 85% (pt erori minore de OCR)
- Daca un citat nu se verifica → evaluarea e flagged pt review uman
- Scorul de verificare e vizibil in UI

### STRATUL 6: Confidence-Based Routing + Human-in-the-Loop
**Problema:** AI-ul nu e perfect. Unele evaluari vor fi incerte.
**Protectii:**
- LLM-ul da un scor de confidenta (0.0-1.0) pt fiecare evaluare
- Confidence < 0.6 → retry automat cu mai mult context (mai multe chunk-uri)
- Dupa retry, confidence tot < 0.6 → flag pt review uman
- INSUFFICIENT_DATA → intotdeauna flag pt review uman
- Citate neverificate → flag pt review uman
- UI-ul arata clar ce e validat automat vs ce necesita review

---

## 2B. FIX-URI DIN REVIEW SCENARII REALE (52 fix-uri totale)

### --- ROUND 1: Scenarii reale documente constructii ---

### FIX 1: Reranking BATCH (nu per-chunk)
**Problema:** 20 apeluri LLM per cerinta pt reranking = 4000+ apeluri per evaluare
**Fix:** Trimitem TOATE 20 chunk-urile intr-un SINGUR prompt si cerem scoruri pt toate.
Alternative: model cross-encoder local (BAAI/bge-reranker-v2-m3), gratuit si rapid.

### FIX 2: Clasificarea tipului de verificare la extragere
**Problema:** Cerinta "conform SR EN 206" nu inseamna ca PT trebuie sa contina textul standardului, ci doar sa-l referentieze. Planul ar da INSUFFICIENT_DATA gresit.
**Fix:** La extragere, fiecare cerinta primeste un camp `verification_type`:
- `match_value` — PT trebuie sa contina o valoare specifica (ex: "C25/30")
- `match_reference` — PT trebuie sa mentioneze acelasi standard/normativ
- `match_description` — PT trebuie sa descrie o abordare/metodologie
- `unverifiable` — cerinta prea vaga pt verificare automata ("conform normativelor in vigoare")

### FIX 3: Deduplicare cerinte dupa extragere (SECTION-AWARE)
**Problema:** Overlap intre chunk-uri + extragere per-chunk → aceeasi cerinta extrasa de 2-3 ori
**Fix:** Dupa extragere, pas de deduplicare:
1. Calculeaza embedding pt fiecare requirement_text
2. Cerinte cu cosine similarity > 0.92 **SI** din aceeasi sectiune = duplicat
3. IMPORTANT: "Beton C25/30 pt fundatii" si "Beton C25/30 pt stalpi" NU sunt duplicate
   (similarity >0.92 dar hierarchy_path diferit → se pastreaza ambele)
4. Grupeaza duplicatele, pastreaza cea cu confidence maxim, sterge restul

### FIX 4: Normalizare terminologie STAS ↔ SR EN
**Problema:** CS vechi: "OB37" (STAS), PT nou: "BST500S" (SR EN). Sunt ACELASI material.
**Fix:** Dictionar de echivalente:
```python
EQUIVALENCES = {
    "OB37": ["BST500S", "S500"], "PC52": ["BST500S"],
    "B200": ["C16/20"], "B250": ["C16/20"], "B300": ["C20/25"],
    "B350": ["C25/30"], "B400": ["C30/37"], "B500": ["C35/45"],
    "OL37": ["S235JR", "S235"], "OL44": ["S275JR", "S275"], "OL52": ["S355JR", "S355"],
}
```
La retrieval, query-ul se expandeaza automat cu echivalentele.

### FIX 5: Word parsing imbunatatit
**Problema:** python-docx rateaza text boxes, merged cells, formatting complex
**Fix:** Pipeline dual:
1. Prima incercare: python-docx (rapid, pastreaza structura)
2. Daca python-docx produce output suspect (<100 cuvinte pt un doc >5 pagini):
   fallback la Word → PDF (via LibreOffice headless) → Mistral OCR

### FIX 6: Cross-referinte intre sectiuni CS
**Problema:** CS: "Se aplica prevederile de la pct. 3.2.1" — chunk-ul cu referinta e inutil fara continutul 3.2.1
**Fix:** La extragere, cand LLM detecteaza referinta la alta sectiune:
1. Extrage section_id-ul referit
2. Cauta chunk-urile cu acel section_id
3. Include textul referit ca context suplimentar

### FIX 7: Diversitate in retrieval
**Problema:** Top 5 chunk-uri pot fi toate din aceeasi sectiune PT
**Fix:** Dupa reranking: max 2 chunk-uri din aceeasi sectiune (section_id).

### --- ROUND 2: Architect review — probleme de productie ---
**NOTA DOCX-ONLY:** Fix-urile 8, 9, 42, 44, 47 au fost ELIMINATE prin decizia DOCX-only.
Descrierile raman ca documentatie a procesului decizional.

### ~~FIX 8~~: ~~OCR post-processing pt documente scanate~~ → ELIMINAT (DOCX-only, zero OCR)
**Problema:** Pe un CS scanat, OCR produce "3 1" in loc de "3.1", "ut1lizat" in loc de "utilizat",
"C25/3O" in loc de "C25/30". Intreaga detectie de structura si keyword search se prabuseste.
**Fix:** Service nou: `ocr_postprocessor.py` — se aplica DUPA OCR, INAINTE de chunking.

```python
# Pas 1: Fix confuzie cifre ↔ litere in context
OCR_CHAR_FIXES = [
    (r'(?<=\d)O(?=\d)', '0'),      # "2O6" → "206"
    (r'(?<=\d)o(?=\d)', '0'),      # "2o6" → "206"
    (r'(?<=[a-zA-Z])1(?=[a-zA-Z])', 'l'),  # "ut1lizat" → "utilizat"
    (r'(?<=\s)1n(?=\s)', 'in'),    # " 1n " → " in "
    (r'(?<=\d)\s(?=/\d)', ''),     # "25 /30" → "25/30"
    (r'(?<=\d)\s(?=\.\d)', ''),    # "3 .1" → "3.1"
]

# Pas 2: Fix section numbers la inceput de linie
SECTION_NUMBER_FIX = r'^(\d+)\s+(\d+)(?=\s+[A-Z])'  # "3 1 Materiale" → "3.1 Materiale"
# Inlocuire: r'\1.\2'

# Pas 3: Normalizare spatii si caractere speciale
- Multiple spatii → un spatiu
- Tab-uri → spatiu
- Dash-uri diferite (–, —, ‐, ‑) → "-"
- Ghilimele fancy ("", '') → ghilimele simple
```

**Fallback structure detection:** Daca regex nu gaseste niciun heading pe primele 50 linii
dupa OCR + post-processing → trimite primele 100 linii la LLM (un singur call) si cere:
"Identifica pattern-ul de numerotare din acest document. Returneaza lista heading-urilor cu nivelul lor."

### ~~FIX 9~~: ~~Page tracking in chunking~~ → ELIMINAT (DOCX-only, paragraph index in loc de pages)
**Problema:** Chunk-urile au `start_page`/`end_page` dar algoritmul nu trackuieste paginile.
**Fix:** Algoritmul de chunking primeste un page_map construit INAINTE de a sterge PAGE_BREAK-urile.

```python
# PASUL 1: Construieste page mapping din markdown-ul OCR
def build_page_map(raw_markdown: str) -> list[tuple[int, int]]:
    """Returneaza [(char_offset, page_number), ...] ordonat."""
    PAGE_BREAK = "\n\n---PAGE_BREAK---\n\n"
    page_map = [(0, 1)]
    offset = 0
    page = 1
    while True:
        idx = raw_markdown.find(PAGE_BREAK, offset)
        if idx == -1:
            break
        page += 1
        # Offset-ul in textul CURAT (fara markeri) = idx - (page-2)*len(PAGE_BREAK)
        clean_offset = idx - (page - 2) * len(PAGE_BREAK)
        page_map.append((clean_offset, page))
        offset = idx + len(PAGE_BREAK)
    return page_map

# PASUL 2: Sterge PAGE_BREAK din markdown DUPA ce ai page_map
clean_markdown = raw_markdown.replace("\n\n---PAGE_BREAK---\n\n", "\n\n")

# PASUL 3: Functie helper pt a afla pagina unui offset
def get_page_for_offset(char_offset: int, page_map) -> int:
    for i in range(len(page_map) - 1, -1, -1):
        if char_offset >= page_map[i][0]:
            return page_map[i][1]
    return 1
```

Chunking-ul acum trackuieste offset-ul curent in textul clean si calculeaza paginile corect.

### FIX 10: Error handling + retry in Celery tasks (CRITICA)
**Problema:** API down/timeout/rate limit → task crapa → document stuck pe "in_progress" pt totdeauna
**Fix:** Fiecare Celery task implementeaza:

```python
@celery_app.task(
    bind=True,
    autoretry_for=(APIError, Timeout, ConnectionError, HTTPError),
    retry_backoff=True,           # exponential: 1s, 2s, 4s, 8s...
    retry_backoff_max=300,        # max 5 min intre retries
    max_retries=3,
    acks_late=True,               # acknowledge DUPA executie cu succes
    reject_on_worker_lost=True,   # re-queue daca worker-ul moare
    soft_time_limit=1800,         # 30 min soft limit
    time_limit=2000,              # 33 min hard limit
)
def process_document(self, document_id):
    try:
        ...
    except SoftTimeLimitExceeded:
        doc.processing_status = "error"
        doc.processing_error = "Timeout: procesarea a depasit 30 minute"
        db.save(doc)
    except Exception as e:
        doc.processing_status = "error"
        doc.processing_error = str(e)[:500]
        db.save(doc)
        raise  # re-raise pt retry logic
```

In `run_evaluation`, evaluarea per-cerinta are try/except INDIVIDUAL:
```python
pentru cerinta in cerinte:
    try:
        result = await evaluate_one(cerinta)
        save_evaluation(result)
    except Exception as e:
        save_evaluation_error(cerinta, str(e))
        run.error_count += 1
        continue  # NU opri toata evaluarea pt o cerinta esuata
```

### FIX 11: LLM structured output cu Pydantic (CRITICA)
**Problema:** LLM-ul poate returna JSON invalid, campuri lipsa, typos in keys, structura diferita
**Fix:** Definim Pydantic models pt FIECARE output LLM:

```python
from pydantic import BaseModel, Field
from typing import Literal

class QuoteEvidence(BaseModel):
    quote: str = Field(description="Text EXACT copiat din fragment PT")
    fragment_number: int
    relevance: str

class EvaluationResult(BaseModel):
    verdict: Literal["CONFORM", "NECONFORM", "PARTIAL", "INSUFFICIENT_DATA"]
    confidence_score: float = Field(ge=0.0, le=1.0)
    exact_quotes_from_pt: list[QuoteEvidence]
    step_by_step_reasoning: str
    covered_aspects: list[str]
    missing_aspects: list[str]
    technical_comparison: str = ""

class ExtractedReq(BaseModel):
    requirement_text: str
    original_text: str
    category: Literal["tehnic","administrativ","calitate","termene","personal","echipamente","materiale"]
    priority: Literal["obligatoriu","recomandat","optional","informativ"]
    verification_type: Literal["match_value","match_reference","match_description","unverifiable"]
    referenced_standards: list[str] = []
    cross_references: list[str] = []
    is_compound: bool = False
    confidence: float = Field(ge=0.0, le=1.0)

class ExtractionResponse(BaseModel):
    requirements: list[ExtractedReq]
```

Parsare defensiva:
```python
async def call_llm_structured(prompt, response_model: type[BaseModel], max_retries=2):
    for attempt in range(max_retries + 1):
        raw = await llm_client.call(prompt, response_format="json")
        try:
            return response_model.model_validate_json(raw)
        except ValidationError as e:
            if attempt < max_retries:
                # Retry cu mesaj explicit de corectie
                prompt += f"\n\nJSON-ul anterior a fost invalid: {e}. Corecteaza."
            else:
                raise
```

### FIX 12: Evaluare paralela — 5 concurrent (IMPORTANTA)
**Problema:** 200 cerinte × 20s secvential = 1.1 ore. 500 cerinte = 3 ore.
**Fix:** `asyncio.gather` cu semaphore in Celery task:

```python
EVAL_CONCURRENCY = 5  # din config, default 5

async def run_evaluation_async(project_id, run_id):
    semaphore = asyncio.Semaphore(EVAL_CONCURRENCY)
    
    async def eval_one(cerinta):
        async with semaphore:
            try:
                chunks = await retrieval_service.search(cerinta, pt_doc_ids)
                result = await evaluation_service.evaluate(cerinta, chunks)
                await save_result(result, run_id)
                await update_run_counters(run_id, result.verdict)
            except Exception as e:
                await save_error(cerinta, run_id, str(e))
    
    await asyncio.gather(*[eval_one(c) for c in cerinte])
```

Impact: 200 cerinte × 20s / 5 parallel = **~14 min** in loc de 1.1 ore.
Cu 10 parallel: **~7 min**. Rate limits Claude/OpenAI permit 10+ concurrent fara probleme.

### FIX 13: Concurrent run prevention (IMPORTANTA)
**Problema:** Dublu-click pe "Ruleaza Evaluare" → 2 runs paralele → cost dublu, confuzie
**Fix:** In endpoint-ul POST:
```python
@router.post("/api/projects/{id}/evaluations/run")
async def trigger_evaluation(id: UUID, db: Session):
    existing = db.query(EvaluationRun).filter(
        EvaluationRun.project_id == id,
        EvaluationRun.status.in_(["pending", "running"])
    ).first()
    if existing:
        raise HTTPException(409, f"Evaluare deja in curs (run_id={existing.id})")
    ...
```
Frontend: buton disabled cand exista run activ + polling status.

### FIX 14: Quote verification cu rapidfuzz (IMPORTANTA)
**Problema:** SequenceMatcher sliding window e O(n^3). 5000 comparatii pe texte 4000 chars = minute.
**Fix:** Inlocuim cu `rapidfuzz` (implementat C++, 100x mai rapid):

```python
from rapidfuzz import fuzz

def verify_quote(quote: str, chunk_text: str) -> tuple[bool, float]:
    """Verifica daca citatul exista in chunk. Returneaza (verificat, similarity)."""
    score = fuzz.partial_ratio(
        normalize(quote),
        normalize(chunk_text)
    ) / 100.0  # partial_ratio returneaza 0-100
    return (score >= 0.80, score)  # threshold 80%, nu 85% (toleranta OCR)
```

Alternativ pt productie: direct pg_trgm in PostgreSQL (deja indexat):
```sql
SELECT id, similarity(content_raw, %(quote)s) as sim
FROM document_chunks WHERE id = ANY(%(chunk_ids)s)
ORDER BY sim DESC LIMIT 1;
```

Threshold scazut la 0.80 (de la 0.85) pt a tolera erori OCR mai mari pe documente scanate.
Adaugam `rapidfuzz` in requirements.txt.

### FIX 15: Cost estimation pre-evaluare (IMPORTANTA)
**Problema:** Userul nu stie ca evaluarea va costa $15-50 in apeluri API
**Fix:** Endpoint nou: `POST /api/projects/{id}/evaluations/estimate`:

```python
@router.post("/api/projects/{id}/evaluations/estimate")
async def estimate_evaluation(id: UUID, db: Session):
    reqs = db.query(ExtractedRequirement).filter_by(
        project_id=id, priority__in=["obligatoriu", "recomandat"]
    ).count()
    
    # Estimari pe baza medie per cerinta
    est_llm_calls = reqs * 2.3   # 1 eval + 0.3 verification + 1 rewrite/rerank
    est_input_tokens = reqs * 5000
    est_output_tokens = reqs * 1000
    est_cost = (est_input_tokens * 3 / 1_000_000) + (est_output_tokens * 15 / 1_000_000)
    est_minutes = reqs * 20 / EVAL_CONCURRENCY / 60
    
    return {
        "total_requirements": reqs,
        "estimated_llm_calls": int(est_llm_calls),
        "estimated_cost_usd": round(est_cost, 2),
        "estimated_duration_minutes": round(est_minutes, 1),
    }
```

Frontend: arata estimarea si cere confirmare inainte de a lansa evaluarea.

### FIX 16: Multiple fisiere PT (IMPORTANTA)
**Problema:** PT poate fi split in: Memoriu tehnic + Grafic executie + Organizare santier + Fise materiale
**Fix:**
1. Upload UI: drop zone PT permite **multiple fisiere** (nu doar unul)
2. `hybrid_search` primeste `document_ids: list[UUID]` nu `document_id: UUID`
3. SQL: `WHERE document_id = ANY(%(doc_ids)s)`
4. Retrieval cauta in TOATE chunk-urile PT simultan

### FIX 17: Checkpoint obligatoriu la cerinte (MODERATA)
**Problema:** Extragerea cerintelor e nedeterminista. 2 rulari pot da 180 vs 220 cerinte. Userul trebuie sa valideze.
**Fix:** Project status flow strict:
```
created → processing → documents_ready → requirements_extracted → requirements_validated → evaluated → completed
```
Noul status `requirements_validated` se seteaza MANUAL de user dupa ce a revizuit cerintele.
Endpoint-ul `POST /evaluations/run` verifica:
```python
if project.status != "requirements_validated":
    raise HTTPException(400, "Trebuie sa validezi cerintele inainte de evaluare")
```
Frontend: buton "Valideaza cerintele si continua" vizibil DOAR pe pagina /requirements.

### FIX 18: Document replacement (MODERATA)
**Problema:** Userul uploadeaza CS-ul gresit, vrea sa-l inlocuiasca. Ce se intampla cu chunk-urile, cerintele, evaluarile?
**Fix:** Nu permitem replace in-place. Flow:
1. Userul sterge documentul (endpoint DELETE care face CASCADE delete pe chunks, requirements, evaluations)
2. Uploadeaza documentul corect
3. UI arata warning: "Stergerea va elimina si X cerinte extrase si Y evaluari asociate"
4. Project status revine la `processing` automat

### FIX 19: Monitoring/analytics endpoint (MODERATA)
**Problema:** Daca 80% e INSUFFICIENT_DATA, retrieval-ul e stricat. Nimeni nu vede asta fara monitoring.
**Fix:** Endpoint: `GET /api/projects/{id}/analytics` + FIX 27,28 integrat:
```json
{
    "verdict_distribution": {"CONFORM": 120, "NECONFORM": 35, "PARTIAL": 25, "INSUFFICIENT_DATA": 20},
    "avg_confidence": 0.78,
    "quote_verification_rate": 0.92,
    "needs_review_count": 28,
    "ocr_suspect_count": 3,
    "copy_paste_rate": 0.72,
    "total_cost_usd": 18.40,
    "processing_time_minutes": 14.2,
    "health_warnings": [
        "INSUFFICIENT_DATA > 15% — retrieval-ul poate fi ineficient",
        "quote_verification_rate < 85% — calitate OCR posibil scazuta",
        "3 evaluari au posibile erori OCR in valori numerice — verificati pe documente originale",
        "72% din evaluari CONFORM contin text aproape identic cu CS — posibil copy-paste din CS"
    ]
}
```
Warnings generate dinamic de `analytics_service.py` (FIX 27 detectie OCR, FIX 28 detectie copy-paste).
Frontend: banner warnings pe pagina evaluare + raport.

### FIX 20: FTS 'simple' — documentare decizie (MINORA)
**Decizie:** Pastram `to_tsvector('simple', ...)` intentionat. Motivatie:
- Keyword search e pt valori EXACTE ("C25/30", "SR EN 206") — stemming e irelevant
- Vector search se ocupa de variatii lingvistice ("fundatie" ≈ "fundatia")
- PostgreSQL `'romanian'` text config e imperfect si necesita dictionare extra
- `'simple'` e predictibil si suficient pt use case-ul nostru

### FIX 21: Embedding dimension configurabil (MINORA)
**Fix:** In `config.py`:
```python
EMBEDDING_DIMENSIONS: int = 1536  # text-embedding-3-small default
```
In migratie: `embedding vector({settings.EMBEDDING_DIMENSIONS})`
Comment in .env.example:
```
# ATENTIE: Schimbarea dimensiunii DUPA ce exista date necesita
# re-embedding complet (stergere chunks + re-procesare documente)
EMBEDDING_DIMENSIONS=1536
```

### FIX 22: Enum validation verdicts (MINORA)
**Fix:** Deja rezolvat prin FIX 11 (Pydantic models cu Literal types).
`verdict: Literal["CONFORM", "NECONFORM", "PARTIAL", "INSUFFICIENT_DATA"]`
Orice valoare diferita (lowercase, engleza, etc.) → ValidationError → retry.

### --- ROUND 3: Probleme subtile de domeniu ---

### FIX 23: Normalizare diacritice romanesti (ş≠ș, ţ≠ț) (SUBTILA CRITICA)
**Problema:** Unicode are DOUA variante de ș si ț: cedilla (U+015F/0163) si comma-below (U+0219/021B).
Arata identic vizual dar sunt bytes diferiti. Documentele romanesti le amesteca aleator.
Keyword search, quote verification si deduplicare ESUEAZA silentios pe ~10-20% din texte.
**Fix:** Functie de normalizare aplicata PRETUTINDENI:

```python
def normalize_ro_chars(text: str) -> str:
    """Normalizeaza variantele Unicode ale diacriticelor romanesti."""
    text = text.replace('\u015F', '\u0219')  # ş cedilla → ș comma-below
    text = text.replace('\u015E', '\u0218')  # Ş → Ș
    text = text.replace('\u0163', '\u021B')  # ţ cedilla → ț comma-below
    text = text.replace('\u0162', '\u021A')  # Ţ → Ț
    return text
```

Se aplica in (DOCX-only):
- `text_normalizer.py` (apelat din process_document dupa word parsing)
- `embedding_service.py` (inainte de embed)
- `retrieval_service.py` (pe query-ul de cautare)
- `quote_verification_service.py` (pe ambele texte inainte de comparare)

Pentru quote verification, pas SUPLIMENTAR de strip complet diacritice:
```python
import unicodedata
def strip_diacritics(text: str) -> str:
    nfkd = unicodedata.normalize('NFKD', text)
    return ''.join(c for c in nfkd if not unicodedata.combining(c)).lower()
```

### FIX 24: Handling "echivalent aprobat" in evaluare (SUBTILA IMPORTANTA)
**Problema:** In constructii, PT poate propune material Y in loc de X cerut in CS, declarandu-l "echivalent".
Sistemul zice NECONFORM pt ca Y≠X. Dar legal e acceptabil daca Y e echivalent sau SUPERIOR.
Exemple reale:
- CS: "tevi PEHD SDR17", PT: "tevi PEHD SDR11" (SDR11 = perete mai gros = SUPERIOR)
- CS: "vopsea tip X", PT: "vopsea tip Y sau echivalent"
**Fix:** Regula noua in EVALUATION_PROMPT (adaugata ca REGULA 7):
```
REGULA 7: ALTERNATIVE SI ECHIVALENTE
Daca PT propune o alternativa diferita de cerinta CS:
- Si valoarea propusa e CLAR SUPERIOARA celei cerute (clasa mai mare, grosime mai mare,
  rezistenta mai mare) → verdict CONFORM + nota "PT depaseste cerinta: [detalii]"
- Si PT declara explicit "echivalent" sau "sau echivalent" → verdict PARTIAL + nota
  "PT propune alternativa declarata echivalenta. Necesita verificare umana a echivalentei."
- Si PT propune altceva FARA justificare → verdict NECONFORM
NU da automat NECONFORM doar pentru ca valoarea/produsul specific e DIFERIT de cel din CS.
```

### FIX 25: Prompt de extragere SEPARAT pt Fisa de Date (SUBTILA IMPORTANTA)
**Problema:** FDA contine cerinte de calificare (experienta, ISO, garantii financiare) care se verifica
din DUAE, NU din PT. Sistemul cauta in PT → nu gaseste → 30+ INSUFFICIENT_DATA false →
userul crede ca sistemul e stricat.
**Fix:** Detectie automata: daca `doc_type == 'fisa_de_date'`, se foloseste un prompt DIFERIT:

```python
FDA_EXTRACTION_PROMPT = EXTRACTION_PROMPT + """

NOTA SPECIALA — FISA DE DATE:
Acest document este o Fisa de Date a Achizitiei, NU un Caiet de Sarcini.
Multe cerinte se refera la CALIFICAREA ofertantului, nu la propunerea tehnica:
- Experienta similara, contracte anterioare → category="administrativ", verification_type="unverifiable"
- Certificari (ISO, OHSAS) → category="administrativ", verification_type="unverifiable"  
- Garantii financiare, asigurari → category="administrativ", verification_type="unverifiable"
- Personal cu diplome/atestari specifice → category="personal", verification_type="unverifiable"
Pentru aceste cerinte, adauga in requirement_text prefixul: "[CALIFICARE] "
Doar cerintele care se refera DIRECT la continutul propunerii tehnice primesc verification_type diferit.
"""
```

Aceste cerinte cu "unverifiable" sunt EXCLUSE automat din evaluare (vezi FIX 8/filtrul default).

### FIX 26: Extragere obligatorie per-valoare-numerica (SUBTILA IMPORTANTA)
**Problema:** Un paragraf cu 5 valori ("BA16, bitum 50/70, grosime 4cm, temperatura +10°C")
e extras ca 1-2 cerinte vagi. Evaluarea zice PARTIAL fara sa specifice CE valoare lipseste.
**Fix:** Regula suplimentara EXPLICITA in EXTRACTION_PROMPT:

```
REGULA CRITICA — CERINTE CU VALORI MULTIPLE:
Daca un paragraf contine MULTIPLE valori numerice, specificatii SAU standarde,
fiecare valoare/standard = O CERINTA SEPARATA. INTOTDEAUNA.
Exemplu: "BA16 conform SR EN 13108-1, bitum 50/70 conform SR EN 12591, 
grosime minima 4cm, la temperatura +10°C" → 5 cerinte:
1. "Tip imbracaminte asfaltica: BA16" (match_value)
2. "Standard imbracaminte: SR EN 13108-1" (match_reference)
3. "Tip bitum: 50/70" (match_value)  
4. "Standard bitum: SR EN 12591" (match_reference)
5. "Grosime minima imbracaminte: 4cm" (match_value)
6. "Temperatura minima aplicare asfalt: +10°C" (match_value)
NU grupa mai multe valori intr-o singura cerinta. Fiecare numar/standard = cerinta separata.
```

### FIX 27: Detectie erori OCR in valori numerice (SUBTILA CEA MAI PERICULOASA)
**Problema:** OCR transforma "C25/30" in "C25/3O" sau "C20/25" in "C25/25". Evaluarea produce
verdict GRESIT cu HIGH CONFIDENCE — citate exacte, rationament corect, totul pare perfect.
Acesta e cel mai periculos failure mode: verdict gresit care arata valid.
**Fix — 3 niveluri de protectie:**

**Nivel 1:** In EVALUATION_PROMPT, regula noua:
```
REGULA 8: SUSPICIUNE ERORI OCR
Textele provin din documente scanate si pot contine erori OCR in cifre/litere
(0↔O, 1↔l↔I, 5↔S, 8↔B). Daca o valoare numerica din PT e APROAPE identica 
cu cea din CS dar difera cu exact 1 caracter:
- Noteaza EXPLICIT: "POSIBILA EROARE OCR: PT contine [X], CS cere [Y]. 
  Diferenta de un singur caracter sugereaza eroare de scanare."
- In acest caz, verdict = PARTIAL (NU NECONFORM)
- confidence_score = max 0.5 (forteaza human review)
- In missing_aspects: "Verificare manuala necesara — posibila eroare OCR"
```

**Nivel 2:** Post-processing programatic dupa evaluare:
```python
def detect_ocr_value_mismatch(cs_value: str, pt_value: str) -> bool:
    """Detecteaza daca diferenta intre 2 valori e probabil eroare OCR."""
    if len(cs_value) != len(pt_value):
        return False
    diffs = [(i, a, b) for i, (a, b) in enumerate(zip(cs_value, pt_value)) if a != b]
    if len(diffs) != 1:
        return False
    # Exact 1 caracter diferit — probabil OCR
    _, char_cs, char_pt = diffs[0]
    ocr_confusions = {('0','O'),('O','0'),('1','l'),('l','1'),('1','I'),('I','1'),
                       ('5','S'),('S','5'),('8','B'),('B','8'),('0','o'),('o','0')}
    return (char_cs, char_pt) in ocr_confusions or (char_pt, char_cs) in ocr_confusions

# Aplicat pe FIECARE evaluare NECONFORM:
daca eval.verdict == "NECONFORM":
    cs_values = extrage_numere(requirement.original_text)  # ["C25/30", "4cm"]
    pt_values = extrage_numere(eval.proposal_quotes)       # ["C25/3O"]
    pentru cs_v, pt_v in pairs(cs_values, pt_values):
        daca detect_ocr_value_mismatch(cs_v, pt_v):
            eval.needs_human_review = true
            eval.reasoning += "\n⚠ ATENTIE: Posibila eroare OCR detectata programatic."
```

**Nivel 3:** In analytics (FIX 19), metrici specifice:
```python
ocr_suspect_count = count(evals where needs_human_review AND "eroare OCR" in reasoning)
if ocr_suspect_count > 5:
    warnings.append(f"{ocr_suspect_count} evaluari au posibile erori OCR in valori numerice. "
                    "Recomandam verificarea pe documentele originale.")
```

### FIX 28: Detectie PT copy-paste din CS (SUBTILA MODERATA)
**Problema:** Firma copiaza sectiuni din CS in PT (practica comuna). Rezultat: 95% CONFORM
cu high confidence. Nu e tehnic gresit, dar nu demonstreaza capacitate reala.
**Fix:** In analytics, detectie automata:

```python
# Calculeaza similaritatea medie a citatelor din PT cu textul original CS
def detect_copy_paste(project_id):
    evals = get_evaluations(project_id)
    if not evals:
        return None
    
    high_sim_count = 0
    total_with_quotes = 0
    for ev in evals:
        if ev.proposal_quotes:
            total_with_quotes += 1
            # Compara citatele PT cu textul original al cerintei CS
            for quote in ev.proposal_quotes:
                req = get_requirement(ev.requirement_id)
                sim = fuzz.ratio(quote.quote, req.original_text) / 100.0
                if sim > 0.90:
                    high_sim_count += 1
                    break  # contor per evaluare, nu per citat
    
    copy_rate = high_sim_count / max(total_with_quotes, 1)
    if copy_rate > 0.60:
        return (f"Atentie: {copy_rate:.0%} din evaluarile CONFORM contin text aproape identic "
                "cu Caietul de Sarcini. Propunerea tehnica pare sa preia text direct din CS. "
                "Verificati ca propunerea demonstreaza capacitate reala de executie.")
    return None
```

Se afiseaza in analytics + ca banner warning pe pagina de evaluare.

### FIX 29: Table quality scoring — detectie tabele OCR garbled (SUBTILA MODERATA)
**Problema:** Tabele scanate produc Markdown garbled (coloane misaligned, celule sparte).
LLM-ul extrage cerinte GRESITE din tabele garbled, fara sa stie.
**Fix:** Scoring automat al calitatii tabelelor dupa OCR:

```python
def score_table_quality(markdown_table: str) -> float:
    """Scor 0-1 al calitatii unui tabel Markdown din OCR."""
    rows = [r.strip() for r in markdown_table.strip().split('\n') 
            if r.strip().startswith('|') and not set(r.strip()) <= set('|-: ')]
    if len(rows) < 2:
        return 0.0
    
    # 1. Consistenta numar coloane (60% din scor)
    col_counts = [r.count('|') - 1 for r in rows]
    mode_count = max(set(col_counts), key=col_counts.count)
    consistency = col_counts.count(mode_count) / len(col_counts)
    
    # 2. Fill rate — celule non-goale (40% din scor)
    cells = [c.strip() for r in rows for c in r.split('|')[1:-1]]
    fill_rate = sum(1 for c in cells if c) / max(len(cells), 1)
    
    return consistency * 0.6 + fill_rate * 0.4
```

Aplicat in chunking service: daca chunk_type == "table" si scor < 0.7:
- Chunk-ul primeste `needs_review = true` (camp nou pe document_chunks)
- In UI, pagina cu tabelul e flagged: "Tabel posibil garbled de OCR — verificati manual"
- La extragere, cerinte din tabele cu scor < 0.7 primesc `extraction_confidence *= 0.5`

### FIX 30: Exclude categorii la evaluare — economie cost si zgomot (SUBTILA MODERATA)
**Problema:** 50+ cerinte generice de calitate ("ISO 9001", "personal calificat") sunt
INTOTDEAUNA CONFORM, costa $5+ la evaluare si acopera NECONFORM-urile importante.
**Fix:** Endpoint-ul de evaluare accepta filtre de excludere:

```python
@router.post("/api/projects/{id}/evaluations/run")
async def trigger_evaluation(
    id: UUID,
    body: EvaluationRunConfig,  # Pydantic model
):
    ...

class EvaluationRunConfig(BaseModel):
    exclude_categories: list[str] = []          # ex: ["calitate", "administrativ"]
    exclude_verification_types: list[str] = ["unverifiable"]  # DEFAULT: exclude unverifiable
    only_priorities: list[str] = ["obligatoriu", "recomandat"]  # DEFAULT: skip optional+informativ
```

Filtrele se aplica la query-ul de cerinte:
```python
query = db.query(ExtractedRequirement).filter(
    ExtractedRequirement.project_id == project_id,
    ExtractedRequirement.priority.in_(config.only_priorities),
    ~ExtractedRequirement.category.in_(config.exclude_categories),
    ~ExtractedRequirement.verification_type.in_(config.exclude_verification_types),
)
```

Frontend pe pagina de estimare: checkboxes vizuale:
```
Categorii incluse: [✓] Tehnic [✓] Materiale [✓] Echipamente [ ] Calitate [ ] Administrativ
Prioritati: [✓] Obligatoriu [✓] Recomandat [ ] Optional [ ] Informativ
Exclud automat: [✓] Cerinte neverificabile

Cerinte selectate: 145 din 320 totale
Cost estimat: ~$12  |  Durata: ~10 minute
[LANSEAZA EVALUAREA]
```

### --- ROUND 4: Workflow utilizator, UX, trasabilitate ---

### FIX 31: Deduplicare in 2 pasi — original_text INAINTE de embedding (DATA QUALITY)
**Problema:** Overlap-ul de 2 propozitii creeaza duplicate SISTEMATICE la fiecare granita de chunk.
Embedding similarity e doar ~0.85 pt duplicate reformulate diferit → deduplicarea le rateaza.
800 chunks = ~800 perechi potentiale de duplicate ratate.
**Fix:** Pas 1 (nou) inainte de pasul embedding existent:

```python
# PAS 1: Duplicare EXACTA pe original_text normalizat
# Prinde overlap-induced duplicates perfect — acelasi text sursa
seen_texts = {}
for req in all_reqs:
    key = strip_whitespace(normalize_ro(req.original_text)).lower()
    if key in seen_texts:
        existing = seen_texts[key]
        keeper = pick_best(existing, req)
        to_delete.add(existing.id if keeper.id != existing.id else req.id)
        seen_texts[key] = keeper
    else:
        seen_texts[key] = req

def pick_best(a, b):
    """Pastreaza cerinta mai specifica."""
    return max([a, b], key=lambda r: (
        len(r.referenced_standards or []),  # mai multe standarde = mai specifica
        len(r.requirement_text),             # text mai lung = mai detaliat
        r.extraction_confidence or 0,
    ))

# PAS 2: Embedding similarity (codul existent din FIX 3)
# ... threshold 0.92 + same section
```

### FIX 32: Pagina cerinte — grouped, collapsed, actionable (UX CRITICA)
**Problema:** 300 cerinte intr-un flat list = userul da rubber-stamp pe validare. 
Checkpoint-ul obligatoriu exista dar NU functioneaza in practica.
**Fix:** Redesign pagina /requirements:

```
┌─────────────────────────────────────────────────────────┐
│ 320 cerinte extrase din Caiet de Sarcini                │
│                                                         │
│ ▸ Cap.2: Conditii generale (34 cerinte)                 │ collapsed
│ ▾ Cap.3: Specificatii tehnice (156 cerinte)              │ expanded
│   ├─ 3.1: Materiale (45)                                │
│   │  ⚠ 3 cerinte necesita review                        │
│   ├─ 3.2: Executie (67)                                 │
│   └─ 3.3: Testare (44)                                  │
│ ▸ Cap.4: Calitate (89 cerinte)                          │
│ ▸ Fisa de Date (41 cerinte — [CALIFICARE])              │
│                                                         │
│ ── Sumar rapid ──                                       │
│ 🔴 12 cerinte necesita review manual                    │
│ 📋 156 tehnic, 89 calitate, 41 admin, 34 general       │
│ 🔍 67 match_value, 45 match_ref, 89 match_descr        │
│ ❌ 41 neverificabile (excluse automat de la evaluare)   │
│                                                         │
│ [REVIZUIESTE CELE 12 FLAGGED]  [VALIDEAZA SI CONTINUA→] │
└─────────────────────────────────────────────────────────┘
```

Implementare frontend:
- Grupare pe `hierarchy_path` (nivel 1-2 din breadcrumb)
- Expand/collapse per sectiune
- Counter `needs_review` per sectiune (badge rosu)
- Buton "Revizuieste flagged" → filtreaza doar cele cu `needs_review=true`
- Buton "Valideaza" activat DOAR dupa ce userul a deschis cel putin tab-ul flagged

### FIX 33: Config evaluare salvat pe evaluation_runs (TRASABILITATE)
**Problema:** Userul exclude "calitate" la evaluare. Raportul arata 158 rezultate din 320.
Peste 2 saptamani, nimeni nu stie de ce lipsesc 162 cerinte.
**Fix:** Camp nou in schema:

```sql
ALTER TABLE evaluation_runs ADD COLUMN
    run_config JSONB DEFAULT '{}';
    -- {"mode": "thorough", "exclude_categories": ["calitate", "administrativ"],
    --  "exclude_verification_types": ["unverifiable"],
    --  "only_priorities": ["obligatoriu", "recomandat"],
    --  "excluded_requirement_count": 162, "total_requirement_count": 320,
    --  "previous_run_id": null}
```

In UI pe pagina rezultate, banner permanent:
```
ℹ Aceasta evaluare a procesat 158 din 320 cerinte.
  Excluse: 89 calitate, 41 neverificabile, 32 administrative.
  [Ruleaza evaluare completa]
```

In raportul exportat: aceeasi nota in prima pagina.

### FIX 34: Detectie document uploadat in slot gresit (ERROR PREVENTION)
**Problema:** Userul pune PT in slotul CS sau invers. Totul se proceseaza. 
Rezultat: cerinte extrase din PT, evaluare impotriva CS-ului. Gunoi complet.
**Fix:** Dupa OCR, scanam primele 3000 caractere pt keywords de tip document:

```python
CS_KEYWORDS = ["caiet de sarcini", "specificatii tehnice", "conditii tehnice",
               "cerinte tehnice", "se va executa", "trebuie sa respecte",
               "este obligatoriu", "se impune", "conform normativ"]
PT_KEYWORDS = ["propunere tehnica", "oferta tehnica", "propunem", "vom executa",
               "experienta similara", "organizare de santier", "grafic de executie",
               "memoriu tehnic", "personal propus", "utilaje propuse"]

def detect_doc_type_mismatch(markdown_first_3000: str, declared_type: str) -> str | None:
    text = markdown_first_3000.lower()
    cs_hits = sum(1 for kw in CS_KEYWORDS if kw in text)
    pt_hits = sum(1 for kw in PT_KEYWORDS if kw in text)
    
    if declared_type == "caiet_de_sarcini" and pt_hits > cs_hits + 2:
        return "Documentul pare sa fie o Propunere Tehnica, nu un Caiet de Sarcini"
    if declared_type == "propunere_tehnica" and cs_hits > pt_hits + 2:
        return "Documentul pare sa fie un Caiet de Sarcini, nu o Propunere Tehnica"
    return None  # OK sau inconclusiv
```

Rezultat stocat in `documents.processing_warning` (camp nou TEXT). 
Frontend: banner galben pe document daca warning e non-null. NU blocheaza procesarea.

### FIX 35: Evaluare cu tabs — Probleme / De verificat / Conform (UX CRITICA)
**Problema:** Userul vrea raspunsul la O INTREBARE: "Ce trebuie sa fixez?"
Nu vrea sa scrolleze prin 150 CONFORM-uri ca sa gaseasca 15 NECONFORM-uri.
**Fix:** Pagina evaluare cu tabs ca view default:

```
[🔴 Probleme (15)] [🟡 De verificat (23)] [✅ Conform (162)]
```

**Tab Probleme** (default activ):
- NECONFORM-uri primele, apoi INSUFFICIENT_DATA
- Fiecare card arata: cerinta CS, ce s-a gasit/nu in PT, sectiune CS, sectiune PT
- Buton "Detalii" → expandeaza citate + rationament
- Buton "Override" → human review
- Link direct la sectiune PT relevanta

**Tab De verificat:**
- PARTIAL + items cu `needs_human_review = true`
- Ordonate descrescator pe confidence (cele mai incerte primele)

**Tab Conform:**
- Collapsed by default (doar header vizibil)
- Expandabil pt audit/verificare

### FIX 36: Re-evaluare incrementala — doar cerintele esuate (COST SAVING)
**Problema:** Dupa fix PT si re-upload, re-evaluarea completa costa $8 + 15min.
Dar 185/200 cerinte erau deja CONFORM. Se cheltuie $7 degeaba.
**Fix:** Camp nou pe evaluation_runs + logica in task:

```sql
ALTER TABLE evaluation_runs ADD COLUMN
    previous_run_id UUID REFERENCES evaluation_runs(id);
    -- Daca e setat, re-evalueaza DOAR cerintele non-CONFORM din run anterior
```

In task:
```python
daca config.previous_run_id:
    failed_req_ids = db.query(RequirementEvaluation.requirement_id).filter(
        RequirementEvaluation.run_id == config.previous_run_id,
        RequirementEvaluation.verdict != "CONFORM"
    ).subquery()
    cerinte = cerinte.filter(ExtractedRequirement.id.in_(failed_req_ids))
```

Frontend: dupa prima evaluare, butonul devine:
```
[Re-evalueaza totul ($8, ~15min)]  [Re-evalueaza doar esuate ($0.60, ~2min)]
```

In raport: "Re-evaluare incrementala: 15 cerinte re-evaluate. 
Comparatie: 8 fixate (NECONFORM→CONFORM), 5 raman NECONFORM, 2 noi PARTIAL."

### FIX 37: Structura raport actionable (VALOARE PRODUS)
**Problema:** Export Word/PDF e doar o lista de verdicts. Inginerul nu stie ce sa faca cu ea.
**Fix:** Raportul exportat are structura ACTIONABILA:

```
═══════════════════════════════════════════════════════════
RAPORT VERIFICARE CONFORMITATE PROPUNERE TEHNICA
═══════════════════════════════════════════════════════════

Proiect: DJ714 - Modernizare drum comunal
Caiet de Sarcini: 320 pagini, 5 fisiere
Propunere Tehnica: 100 pagini, 3 fisiere
Data evaluare: 2026-04-06
Cerinte evaluate: 209 din 320 (excluse: 42 calitate, 41 neverificabile, 28 admin)

──────────────── SUMAR ────────────────
  ✅ CONFORM:           162 (77.5%)
  ❌ NECONFORM:          15 (7.2%)
  🟡 PARTIAL:            23 (11.0%)
  ❓ INSUFICIENT DATE:    9 (4.3%)
  ⚠ Necesita review:    28
  Confidenta medie:    0.82

──────────────── ATENTIONARI SISTEM ────────────────
  • 3 evaluari cu posibile erori OCR in valori numerice
  • PT contine text 72% similar cu CS — posibil copy-paste

══════════════════════════════════════════════════════
1. NECONFORMITATI — ACTIUNE NECESARA
══════════════════════════════════════════════════════

Nr.1 ❌ NECONFORM (confidence: 94%)
  Cerinta CS: "Betonul pentru fundatii va fi de clasa C25/30"
  Sursa CS: Cap.3 > 3.2.1: Fundatii, pagina 47
  
  Gasit in PT: "Se propune beton de clasa C20/25 pentru fundatii"
  Sursa PT: Cap.4 > 4.1: Materiale, pagina 23
  
  Problema: PT specifica C20/25, CS cere minim C25/30
  Recomandare: Modificati specificatia din PT la C25/30 sau superior
  
  ────

Nr.2 ❌ NECONFORM (confidence: 87%)
  ...

══════════════════════════════════════════════════════
2. CONFORMITATE PARTIALA — DE VERIFICAT
══════════════════════════════════════════════════════
  ...

══════════════════════════════════════════════════════
3. DATE INSUFICIENTE — POSIBIL OMISIUNI DIN PT
══════════════════════════════════════════════════════
  ...

══════════════════════════════════════════════════════
NOTA: Acest raport a fost generat automat de [Nume Sistem].
Verdictele sunt orientative si trebuie validate de personal calificat.
Prompt version: eval_v1.2 | Cost evaluare: $18.40
══════════════════════════════════════════════════════
```

Implementare: `report_service.py` genereaza structura → export cu `python-docx` (Word) sau `reportlab` (PDF).

### FIX 38: Quick mode — skip validare cerinte (UX WORKFLOW)
**Problema:** Vineri ora 14, deadline luni ora 9. Inginerul NU are timp sa revizuiasca 300 cerinte.
Checkpoint-ul obligatoriu (FIX 17) il BLOCHEAZA de la scenariul principal: verificare rapida.
**Fix:** Doua moduri de operare:

```python
class EvaluationRunConfig(BaseModel):
    mode: Literal["thorough", "quick"] = "thorough"
    # ... restul campurilor existente
```

**Modul "thorough"** (default): Flow complet, validare obligatorie.
**Modul "quick"**: 
- Skip checkpoint validare (project.status poate fi "requirements_extracted", nu neaparat "validated")
- Exclude automat: unverifiable + informativ + administrativ
- Banner PERMANENT in UI si raport: "⚠ EVALUARE RAPIDA — cerintele NU au fost validate manual"
- Userul poate oricand re-rula in mod thorough ulterior

Frontend: pe pagina proiect, dupa extragere cerinte:
```
[Revizuieste cerintele (recomandat)]  [Evaluare rapida ⚡ (skip review)]
```

### --- ROUND 5: Bug-uri de implementare & consistenta interna ---

### FIX 39: Race condition pe contoare cu evaluare paralela (BUG CRITIC)
**Problema:** 5 coroutine paralele fac `run.conform_count += 1; db.save(run)`. 
Read-modify-write concurent → pierdere counts. Raportul zice 145 CONFORM cand sunt 162.
**Fix:** Atomic SQL update, nu ORM read-modify-write:

```python
async def update_run_counter(run_id: UUID, verdict: str, needs_review: bool):
    """Thread-safe counter increment via atomic SQL."""
    await db.execute(text("""
        UPDATE evaluation_runs SET
            evaluated_count = evaluated_count + 1,
            conform_count = conform_count + CASE WHEN :v = 'CONFORM' THEN 1 ELSE 0 END,
            neconform_count = neconform_count + CASE WHEN :v = 'NECONFORM' THEN 1 ELSE 0 END,
            partial_count = partial_count + CASE WHEN :v = 'PARTIAL' THEN 1 ELSE 0 END,
            insufficient_count = insufficient_count + CASE WHEN :v = 'INSUFFICIENT_DATA' THEN 1 ELSE 0 END,
            needs_review_count = needs_review_count + CASE WHEN :nr THEN 1 ELSE 0 END,
            error_count = error_count + CASE WHEN :err THEN 1 ELSE 0 END
        WHERE id = :run_id
    """), {"run_id": run_id, "v": verdict, "nr": needs_review, "err": False})
    await db.commit()
```

TOATE coroutinele din `asyncio.gather` folosesc aceasta functie. Nu mai exista `run.X_count += 1`.

### FIX 40: Task idempotent — skip evaluari deja procesate la re-run (BUG CRITIC)
**Problema:** Task crapa la cerinta 150/200. Celery re-queue-uiaza (acks_late). 
Noul worker reia DE LA INCEPUT → evaluarile 1-149 duplicate in DB.
**Fix:** La inceput de task, verifica ce e deja procesat:

```python
# La inceputul run_evaluation, DUPA filtrarea cerintelor:
already_done_ids = set(
    row[0] for row in db.execute(
        select(RequirementEvaluation.requirement_id)
        .where(RequirementEvaluation.run_id == run.id)
    ).all()
)
cerinte = [c for c in cerinte if c.id not in already_done_ids]

daca not cerinte:
    # Totul era deja procesat — doar finalizeaza
    run.status = "completed"
    run.completed_at = now()
    db.save(run)
    return
```

Task-ul devine IDEMPOTENT: safe sa re-ruleze de oricate ori fara duplicate.

### FIX 41: Finally block — status nu ramane "running" la crash (BUG CRITIC)
**Problema:** Exception necaptata / OOM kill → `run.status` ramane "running" pt totdeauna.
FIX 13 (concurrent prevention) blocheaza ORICE evaluare viitoare pe proiect.
**Fix:** Wrap COMPLET cu try/finally:

```python
TASK run_evaluation(project_id, config):
    run = create_run(project_id, status="running")
    
    try:
        ... # validari, filtrare, asyncio.gather
        run.status = "completed"
    except SoftTimeLimitExceeded:
        run.status = "failed"
        run.error_message = "Timeout: evaluarea a depasit limita de timp"
    except Exception as e:
        run.status = "failed"  
        run.error_message = str(e)[:500]
        raise  # re-raise pt Celery retry (daca mai are retries)
    finally:
        # INTOTDEAUNA se executa — chiar si la crash
        run.completed_at = now()
        db.save(run)
        # Updateaza project status pe baza ce avem
        daca run.evaluated_count > 0:
            project.status = "evaluated"  # partial dar exista rezultate
        db.save(project)
```

### ~~FIX 42~~: ~~Ordinea page_map vs postprocessor~~ → ELIMINAT (DOCX-only, zero page_map)
**Problema:** Planul actual ruleaza postprocessor INAINTE de page_map extraction.
Postprocessorul poate modifica whitespace → PAGE_BREAK markers corupte → pagini calculate gresit.
**Fix:** Ordinea CORECTA in process_document task:

```python
# ORDINEA CORECTA (era gresita in plan):

# PASUL 1: Construieste page map SI curata markdown (UN SINGUR PAS, fara formula fragila)
clean_markdown, page_map = build_page_map_and_clean(raw_markdown)

# PASUL 2: ABIA ACUM postprocessing (pe text CURAT, fara markeri)
clean_markdown = ocr_postprocessor.fix_common_errors(clean_markdown)
clean_markdown = ocr_postprocessor.normalize_ro_chars(clean_markdown)

# PASUL 3: Detect doc type mismatch
mismatch = doc_type_detector.detect_mismatch(clean_markdown[:3000], doc.doc_type)

# PASUL 4: Chunking cu page_map
chunks = chunking_service.chunk_document(clean_markdown, doc.id, page_map)
```

Functia `build_page_map_and_clean` — varianta ROBUSTA (split, nu formula):
```python
def build_page_map_and_clean(raw_markdown: str) -> tuple[str, list[tuple[int, int]]]:
    PAGE_BREAK = "\n\n---PAGE_BREAK---\n\n"
    parts = raw_markdown.split(PAGE_BREAK)
    page_map = []
    offset = 0
    for page_num, part in enumerate(parts, start=1):
        page_map.append((offset, page_num))
        offset += len(part) + 2  # +2 pt "\n\n" separator intre pagini
    clean = "\n\n".join(parts)
    return clean, page_map
```

### FIX 43: Structured output — provider-specific + retry cu context (BUG IMPORTANT)
**Problema 1:** FIX 11 retry nu include raspunsul LLM anterior — LLM-ul nu stie ce sa corecteze.
**Problema 2:** Claude si OpenAI au mecanisme DIFERITE de structured output.
**Fix:** LLM client abstract cu schema enforcement nativ:

```python
class LLMClient:
    async def call_structured(self, prompt: str, response_model: type[BaseModel]) -> BaseModel:
        schema = response_model.model_json_schema()
        
        if self.provider == "anthropic":
            # Claude: tool_choice forteaza schema — JSON GARANTAT valid
            response = await self.client.messages.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                tools=[{"name": "result", "description": "Structured output",
                        "input_schema": schema}],
                tool_choice={"type": "tool", "name": "result"},
                max_tokens=4096,
            )
            raw = response.content[0].input  # dict, deja parsat
            return response_model.model_validate(raw)
        
        elif self.provider == "openai":
            # OpenAI: response_format cu json_schema — JSON GARANTAT valid  
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_schema", 
                                 "json_schema": {"name": "result", "strict": True,
                                                 "schema": schema}},
            )
            return response_model.model_validate_json(response.choices[0].message.content)
```

Cu schema enforcement nativ, **NU mai avem nevoie de retry pt JSON invalid** — API-ul garanteaza structura. Retry ramane doar pt erori de retea/rate limit (acoperit de FIX 10).

Fallback (daca provider nu suporta schema enforcement):
```python
        else:
            # Fallback: prompt-based JSON, cu retry
            for attempt in range(3):
                raw = await self._call_raw(prompt + "\nRaspunde cu JSON valid.")
                try:
                    return response_model.model_validate_json(raw)
                except ValidationError as e:
                    if attempt < 2:
                        prompt = (f"{prompt}\n\nRaspunsul anterior:\n```\n{raw[:800]}\n```\n"
                                  f"Eroare: {str(e)[:300]}\nCorecteaza si returneaza JSON valid.")
                    else:
                        raise
```

### ~~FIX 44~~: ~~PDF splitting~~ → ELIMINAT (DOCX-only, python-docx n-are limita de pagini)
**Problema:** PDF 500+ pagini scanate (300MB) → upload + OCR = 20+ min → aproape de timeout.
**Fix:** Split PDF inainte de OCR daca > 100 pagini:

```python
import pymupdf

MAX_OCR_PAGES = 100

async def ocr_pdf(pdf_path: str) -> list[PageResult]:
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    doc.close()
    
    if total_pages <= MAX_OCR_PAGES:
        return await mistral_ocr_single(pdf_path)
    
    # Split in batch-uri
    all_pages = []
    for start in range(0, total_pages, MAX_OCR_PAGES):
        end = min(start + MAX_OCR_PAGES, total_pages)
        batch_path = split_pdf_range(pdf_path, start, end)
        batch_pages = await mistral_ocr_single(batch_path)
        
        # Ajusteaza page numbers (batch-ul incepe de la 0, noi vrem offset)
        for page in batch_pages:
            page.index += start
        all_pages.extend(batch_pages)
        
        # Update progress
        doc_record.processing_progress = f"OCR: {end}/{total_pages} pagini"
        db.save(doc_record)
        
        # Cleanup batch file
        os.remove(batch_path)
    
    return all_pages
```

Camp nou pe documents pt progress granular:
```sql
ALTER TABLE documents ADD COLUMN processing_progress TEXT;
-- "OCR: 150/400 pagini", "Embedding: 300/500 chunks"
```

### FIX 45: Tabel in sectiune scurta — regula explicita (CLARIFICARE)
**Problema:** Conflict intre "tabele atomice" si "sectiuni scurte = un chunk".
Sectiune 3.2.1 cu 200 tokeni text + 100 tokeni tabel = 300 tokeni. Ce facem?
**Fix:** Regula EXPLICITA adaugata la chunking:

```
REGULA 3 CLARIFICATA: Tabele sunt atomice DOAR daca:
  a) Tabelul este standalone (nu e in cadrul unei sectiuni cu text <1024 tokeni)
  b) SAU tabelul singur depaseste 2048 tokeni (tabel enorm)
  
Daca un tabel e INSIDE o sectiune cu text si totalul < 1024 tokeni:
  → text + tabel raman IMPREUNA ca un singur chunk
  → Motivatie: contextul din text e ESENTIAL pt a intelege tabelul
  
Daca un tabel e INSIDE o sectiune dar totalul > 1024 tokeni:
  → textul = un chunk, tabelul = chunk separat (ambele cu acelasi breadcrumb)
```

### FIX 46: CONFORM cu needs_review — in tab "De verificat" (CLARIFICARE UX)
**Problema:** Evaluare CONFORM cu needs_human_review=true (confidenta scazuta, citate neverificate)
apare in tab "Conform" (collapsed). Userul nu o vede.
**Fix:** Tab assignment explicit:

```python
def get_evaluation_tab(eval) -> str:
    """Determina in ce tab apare o evaluare."""
    if eval.needs_human_review:
        return "de_verificat"  # INDIFERENT de verdict — review necesar
    if eval.verdict in ("NECONFORM", "INSUFFICIENT_DATA"):
        return "probleme"
    if eval.verdict == "PARTIAL":
        return "de_verificat"
    return "conform"
```

Frontend: tab counts reflecta aceasta logica. Un CONFORM cu review flag apare la "De verificat".
Tab labels: `[🔴 Probleme (15)] [🟡 De verificat (23+3)] [✅ Conform (159)]`

### ~~FIX 47~~: ~~Detectie PDF digital vs scanat~~ → ELIMINAT (DOCX-only, zero PDF processing)
**Problema:** PDF-uri digitale (generate din Word) au text extractibil direct. 
Mistral OCR e overkill: costa bani, ia timp, si poate introduce erori pe text deja perfect.
**Fix:** Detectie automata inainte de OCR:

```python
import pymupdf

def pdf_needs_ocr(pdf_path: str) -> bool:
    """Returneaza True daca PDF-ul e scanat (nu are text extractibil)."""
    doc = pymupdf.open(pdf_path)
    # Verifica primele 5 pagini
    text_pages = 0
    for page in doc[:min(5, len(doc))]:
        text = page.get_text().strip()
        if len(text) > 100:  # Pagina are text real, nu doar metadata
            text_pages += 1
    doc.close()
    return text_pages < 2  # Daca <2 din 5 pagini au text → scanat

# In process_document:
if doc.mime_type == "application/pdf":
    if pdf_needs_ocr(doc.storage_path):
        # PDF scanat → Mistral OCR (costisitor dar necesar)
        pages = await ocr_service.ocr_pdf(doc.storage_path)  # FIX 44: cu splitting
    else:
        # PDF digital → extractie directa cu PyMuPDF (gratuit, instant)
        pages = extract_pdf_text_pymupdf(doc.storage_path)
```

```python
def extract_pdf_text_pymupdf(pdf_path: str) -> list[PageResult]:
    """Extractie text directa din PDF digital. Gratuit, instant, fara OCR."""
    doc = pymupdf.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text")
        # Converteste la Markdown basic (headings, bold, etc.)
        markdown = convert_pymupdf_to_markdown(text)
        pages.append(PageResult(
            index=i + 1,
            markdown=markdown,
            confidence=1.0,  # Text digital = confidence perfecta
        ))
    doc.close()
    return pages
```

Economie: ~50% din documente sunt PDF digitale → **50% reducere cost OCR**.

### --- ROUND 6: Runtime compatibility & deployment ---

### FIX 48: Celery pool SOLO — asyncio.gather nu merge cu prefork (BUG CRITIC SHOWSTOPPER)
**Problema:** Celery default pool = `prefork` (fork processes). asyncio event loop NU functioneaza
in procese forked. `await asyncio.gather(...)` crapa cu `RuntimeError: no running event loop`.
TOATA evaluarea paralela (FIX 12) e blocata.
**Fix:** Pool `solo` + 2 workeri separati (processing + evaluation):

```yaml
# docker-compose.yml
celery-worker-processing:
    build: ./backend
    command: celery -A app.tasks.celery_app worker 
             --loglevel=info --pool=solo --concurrency=1
             --queues=processing
    volumes: ["./backend:/app", "./uploads:/uploads"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }

celery-worker-evaluation:
    build: ./backend
    command: celery -A app.tasks.celery_app worker 
             --loglevel=info --pool=solo --concurrency=1
             --queues=evaluation
    volumes: ["./backend:/app", "./uploads:/uploads"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
```

Routing in `celery_app.py`:
```python
app.conf.task_routes = {
    'app.tasks.process_document.*': {'queue': 'processing'},
    'app.tasks.extract_requirements.*': {'queue': 'evaluation'},
    'app.tasks.run_evaluation.*': {'queue': 'evaluation'},
}
```

De ce 2 workeri:
- Processing + evaluare pot rula IN PARALEL (user uploadeaza noi documente in timp ce alta evaluare ruleaza)
- `--pool=solo --concurrency=1` = un task la un moment dat per worker, dar asyncio.gather merge INTERN
- Paralelismul intra-task (5 evaluari simultane) vine din asyncio, nu din Celery

### FIX 49: Dockerfile backend SIMPLIFICAT (DOCX-only — fara LibreOffice)
**Decizie DOCX-only:** Nu mai avem nevoie de LibreOffice (nu mai exista conversie Word→PDF→OCR).
**Fix:** Dockerfile backend simplu si usor (~200MB in loc de ~400MB):

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### FIX 50: PostgreSQL healthcheck — previne connection errors la startup (BUG IMPORTANT)
**Problema:** `depends_on` asteapta doar START container, nu READY. Backend crapa pt ca postgres
nu accepta inca conexiuni.
**Fix:** Healthcheck pe postgres:

```yaml
postgres:
    image: pgvector/pgvector:pg16
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
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ports: ["8000:8000"]
    volumes: ["./backend:/app", "./uploads:/uploads"]
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
```

### FIX 51: DELETE endpoint pt documente — lipsea din API (GAP)
**Problema:** FIX 18 descrie cascade delete dar endpoint-ul nu era listat.
**Fix:** Adaugat la API endpoints (sectiunea 10):
```
DEL  /api/projects/{id}/documents/{doc_id}
     → Cascade delete: chunks, requirements, evaluations din acel document
     → Response: {"deleted": {"chunks": 45, "requirements": 12, "evaluations": 12}}
     → Reset project.status la "processing" daca doc era "ready"
     → Warning header daca evaluari existente au fost invalidate
```

### FIX 52: Elimina pyproject.toml din structura — doar requirements.txt (CLARIFICARE)
**Problema:** Project structure listeaza si `pyproject.toml` si `requirements.txt`. Redundant pt MVP.
**Fix:** Pastram doar `requirements.txt`. Stergem `pyproject.toml` din structura proiect.

### LIMITARI ACCEPTATE PT MVP (nu se rezolva acum):
- **Planse/desene tehnice** — nu se pot procesa automat. Se noteaza ca limitare in UI.
- **PDF multi-coloana** — depinde de Mistral OCR. Se logheaza pt monitorizare.
- **Cerinte conditionale** ("daca X, atunci Y") — se extrag simple, flagged pt review.
- **Evaluare grouped pe sectiuni** — optimizare post-MVP (reduce costuri 3-5x).
- **Continut standarde externe** — sistemul verifica referinte la standarde, nu continutul lor.
- **Override feedback loop** — overrides stocate pt analiza viitoare, dar fara auto-tuning pt MVP.
- **Concurrency multi-user** — pt MVP, un singur user activ per proiect. Fara locking.
- **Extractie cu model mai ieftin** — Haiku pt extractie ar reduce costul de la $4 la $0.50.

---

## 3. STRUCTURA PROIECT (FIECARE FISIER)

```
/root/facultate/rag/
│
├── docker-compose.yml              # PostgreSQL+pgvector, Redis, backend, frontend
├── .env.example                    # Template variabile de mediu
├── .gitignore
├── Makefile                        # make dev, make migrate, make seed
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini                 # Config migrari DB
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   │       └── 001_initial.py      # Schema initiala
│   │
│   └── app/
│       ├── __init__.py
│       ├── main.py                 # FastAPI app: CORS, lifespan, include routers
│       ├── config.py               # Pydantic Settings — citeste din .env
│       ├── database.py             # SQLAlchemy async engine + session factory
│       ├── dependencies.py         # get_db(), get_current_user()
│       │
│       ├── models/                 # SQLAlchemy ORM
│       │   ├── __init__.py         # Re-exporta toate modelele
│       │   ├── base.py             # Base class cu id UUID, created_at, updated_at
│       │   ├── user.py             # User (simplu, pt MVP)
│       │   ├── project.py          # Project = o licitatie verificata
│       │   ├── document.py         # Document uploadat (CS/FDA/PT)
│       │   ├── document_page.py    # Pagina individuala cu OCR result
│       │   ├── chunk.py            # DocumentChunk cu embedding pgvector
│       │   ├── requirement.py      # ExtractedRequirement din CS/FDA
│       │   ├── evaluation.py       # RequirementEvaluation (verdict per cerinta)
│       │   └── evaluation_run.py   # EvaluationRun (o sesiune completa de evaluare)
│       │
│       ├── schemas/                # Pydantic request/response models
│       │   ├── __init__.py
│       │   ├── project.py          # ProjectCreate, ProjectResponse
│       │   ├── document.py         # DocumentUpload, DocumentStatus
│       │   ├── requirement.py      # RequirementResponse
│       │   ├── evaluation.py       # EvaluationResponse, EvaluationDetail, ReportResponse
│       │   └── common.py           # PaginatedResponse, ErrorResponse, HealthResponse
│       │
│       ├── api/                    # FastAPI routers
│       │   ├── __init__.py
│       │   ├── router.py           # Aggregation: include all sub-routers
│       │   ├── health.py           # GET /api/health
│       │   ├── projects.py         # CRUD /api/projects
│       │   ├── documents.py        # Upload + status /api/projects/{id}/documents
│       │   ├── requirements.py     # GET /api/projects/{id}/requirements
│       │   └── evaluations.py      # Trigger + results /api/projects/{id}/evaluations
│       │
│       ├── services/               # Business logic (DETALIAT la sectiunile 5-8)
│       │   ├── __init__.py
│       │   ├── word_parser_service.py      # DOCX → Markdown (python-docx: headings reale, tabele structurate)
│       │   ├── text_normalizer.py          # FIX 23: Normalizare diacritice romanesti (ş→ș, ţ→ț)
│       │   ├── chunking_service.py         # Chunk-uri cu context + heading-based structure
│       │   ├── embedding_service.py        # Text → vector embedding (multi-provider)
│       │   ├── retrieval_service.py        # Hybrid search: pgvector + FTS + reranking + diversity
│       │   ├── extraction_service.py       # Extrage cerinte atomice + deduplicare + FDA handling
│       │   ├── evaluation_service.py       # Evalueaza PT vs cerinte + parallel + echivalente
│       │   ├── quote_verification_service.py  # Verifica citate cu rapidfuzz
│       │   ├── analytics_service.py        # Statistici + health warnings + copy-paste detect
│       │   ├── doc_type_detector.py        # FIX 34: Detectie document uploadat in slot gresit
│       │   └── report_service.py           # Genereaza raport actionable (Word export)
│       │
│       ├── core/                   # Utilitare partajate
│       │   ├── __init__.py
│       │   ├── llm.py              # LLM client unificat (Claude/OpenAI) cu retry + logging
│       │   ├── prompts.py          # TOATE prompt-urile (centralizate, versionabile)
│       │   └── storage.py          # Salvare/citire fisiere pe disk
│       │
│       └── tasks/                  # Celery async tasks
│           ├── __init__.py
│           ├── celery_app.py       # Celery config: broker=redis, result_backend=redis
│           ├── process_document.py # Pipeline: OCR → structure detection → chunk → embed
│           ├── extract_requirements.py  # CS chunks → cerinte atomice
│           └── run_evaluation.py   # Cerinte × PT → verdict per cerinta → raport
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx                  # Root layout cu sidebar navigatie
│       │   ├── page.tsx                    # Dashboard: lista proiecte
│       │   ├── projects/
│       │   │   ├── new/page.tsx            # Creare proiect + upload documente
│       │   │   └── [id]/
│       │   │       ├── page.tsx            # Overview proiect: status pipeline
│       │   │       ├── documents/page.tsx  # Status procesare documente
│       │   │       ├── requirements/page.tsx  # Lista cerinte extrase (editabila)
│       │   │       ├── evaluation/page.tsx # Rezultate evaluare (pagina principala)
│       │   │       └── report/page.tsx     # Raport final + export
│       │   └── globals.css
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx
│       │   │   └── PageHeader.tsx
│       │   ├── projects/
│       │   │   ├── ProjectCard.tsx
│       │   │   └── CreateProjectForm.tsx
│       │   ├── documents/
│       │   │   ├── DocumentUploader.tsx    # Drag-drop upload
│       │   │   ├── ProcessingPipeline.tsx  # Vizualizare stadiu: OCR → Chunk → Embed → Ready
│       │   │   └── PageViewer.tsx          # Vizualizare pagina originala PDF
│       │   ├── evaluation/
│       │   │   ├── RequirementCard.tsx     # O cerinta cu badge verdict
│       │   │   ├── EvaluationDetail.tsx    # Expandat: citate, rationament, surse
│       │   │   ├── VerdictBadge.tsx        # CONFORM=verde, NECONFORM=rosu, etc
│       │   │   ├── ConfidenceIndicator.tsx # Bara vizuala confidenta
│       │   │   └── SourceReference.tsx     # Link la pagina/chunk sursa
│       │   ├── report/
│       │   │   ├── ReportSummary.tsx       # Sumar: X conform, Y neconform, Z partial
│       │   │   └── ReportExport.tsx        # Export PDF/DOCX
│       │   └── ui/                         # Componente generice (Button, Badge, Card, etc.)
│       │
│       ├── hooks/
│       │   ├── useProject.ts
│       │   ├── useDocumentStatus.ts        # Polling status procesare
│       │   └── useEvaluation.ts
│       │
│       └── lib/
│           ├── api.ts                      # Fetch wrapper pt backend API
│           └── types.ts                    # TypeScript types (mirror backend schemas)
│
└── scripts/
    └── seed_test.py                        # Seed cu date de test
```

---

## 4. SCHEMA BAZA DE DATE (PostgreSQL + pgvector)

```sql
-- Extensii necesare
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ===================== USERS (simplu pt MVP) =====================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ===================== PROJECTS =====================
-- Un proiect = o licitatie care se verifica
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,               -- ex: "DJ714 - Modernizare drum comunal"
    description     TEXT,
    -- FIX 17: requirements_validated e checkpoint OBLIGATORIU inainte de evaluare
    status          TEXT NOT NULL DEFAULT 'created'
                    CHECK (status IN ('created','processing','documents_ready','requirements_extracted','requirements_validated','evaluated','completed')),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ===================== DOCUMENTS =====================
-- Fisierele uploadate: CS (PDF), FDA (PDF), PT (Word)
CREATE TABLE documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_type            TEXT NOT NULL CHECK (doc_type IN ('caiet_de_sarcini','fisa_de_date','propunere_tehnica')),
    original_filename   TEXT NOT NULL,
    storage_path        TEXT NOT NULL,           -- Cale pe disk
    file_size_bytes     BIGINT,
    file_hash           TEXT,                    -- SHA256 pt duplicate detection
    heading_count       INTEGER,                 -- Numar headings detectate din Word styles
    paragraph_count     INTEGER,                 -- Numar paragrafe total
    markdown_content    TEXT,                     -- Output parsing python-docx (Markdown)

    processing_status   TEXT NOT NULL DEFAULT 'uploaded'
        CHECK (processing_status IN (
            'uploaded',                     -- Fisier .docx salvat
            'parsing_in_progress',          -- python-docx parsing
            'parsing_completed',            -- Markdown generat
            'chunking_in_progress',         -- Chunking + structure
            'chunking_completed',
            'embedding_in_progress',        -- Vector embeddings
            'ready',                        -- Complet procesat
            'error'
        )),
    processing_error    TEXT,                    -- Mesaj eroare daca a esuat
    processing_warning  TEXT,                    -- FIX 34: Warning daca doc pare in slot gresit

    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_hash ON documents(file_hash);

-- NOTA: document_pages ELIMINAT. Nu mai avem OCR per-pagina.
-- Trasabilitatea se face prin hierarchy_path (sectiune din Word), nu page numbers.

-- ===================== DOCUMENT CHUNKS =====================
-- Inima sistemului RAG. Fiecare chunk = un fragment semantic din document.
CREATE TABLE document_chunks (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index         INTEGER NOT NULL,        -- Ordine secventiala in document

    -- Ierarhie detectata
    hierarchy_path      TEXT NOT NULL,            -- "Cap.3: Specificatii > 3.2: Structura > 3.2.1: Fundatii"
    section_id          TEXT,                     -- "3.2.1" — numarul sectiunii
    section_title       TEXT,                     -- "Fundatii" — titlul sectiunii
    hierarchy_level     INTEGER NOT NULL DEFAULT 0,

    -- DUBLA STOCARE (anti-halucinare)
    content_with_context TEXT NOT NULL,           -- Chunk cu breadcrumb prepended → pt embedding & retrieval
    content_raw         TEXT NOT NULL,            -- Text exact din document → pt verificare citate

    -- Trasabilitate sursa (DOCX-only: paragraph index, nu page number)
    start_paragraph     INTEGER NOT NULL,        -- Index paragraf start in documentul Word
    end_paragraph       INTEGER NOT NULL,        -- Index paragraf sfarsit

    -- Metadata
    chunk_type          TEXT NOT NULL DEFAULT 'text'
                        CHECK (chunk_type IN ('text','table','list','header','mixed')),
    token_count         INTEGER,
    detected_standards  TEXT[],                   -- ["SR EN 206", "STAS 10107/0"]

    -- FIX 29: Table quality scoring
    table_quality_score FLOAT,                   -- 0.0-1.0 pt chunk_type='table', NULL altfel
    needs_review        BOOLEAN DEFAULT false,    -- FIX 29: true daca table quality < 0.7

    -- Embedding pgvector
    embedding           vector(1536),

    created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_section ON document_chunks(section_id);

-- Index HNSW pt cautare vectoriala (mai bun decat IVFFlat pt <1M vectori)
CREATE INDEX idx_chunks_embedding ON document_chunks
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Index GIN pt full-text search (BM25-like keyword search)
CREATE INDEX idx_chunks_fts ON document_chunks
    USING gin (to_tsvector('simple', content_with_context));

-- Index trigram pt fuzzy matching (verificare citate)
CREATE INDEX idx_chunks_trgm ON document_chunks
    USING gin (content_raw gin_trgm_ops);


-- ===================== EXTRACTED REQUIREMENTS =====================
-- Cerinte atomice extrase din CS/FDA
CREATE TABLE extracted_requirements (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_chunk_id         UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    source_document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    -- Cerinta
    requirement_text        TEXT NOT NULL,        -- Cerinta reformulata clar pt evaluare
    original_text           TEXT NOT NULL,        -- Text EXACT din CS (pt citare)
    section_reference       TEXT,                 -- "Cap.3, Art.3.2.1, lit.a)"
    hierarchy_path          TEXT,                 -- Mostenit din chunk sursa

    -- Clasificare
    category        TEXT NOT NULL DEFAULT 'tehnic'
                    CHECK (category IN ('tehnic','administrativ','calitate','termene','personal','echipamente','materiale')),
    priority        TEXT NOT NULL DEFAULT 'obligatoriu'
                    CHECK (priority IN ('obligatoriu','recomandat','optional','informativ')),

    -- Tipul de verificare (FIX 2)
    verification_type       TEXT NOT NULL DEFAULT 'match_description'
                            CHECK (verification_type IN ('match_value','match_reference','match_description','unverifiable')),

    -- Cerinte compuse (daca originalul = "X SI Y SI Z")
    is_compound             BOOLEAN DEFAULT false,
    parent_requirement_id   UUID REFERENCES extracted_requirements(id),

    -- Standarde referentiate
    referenced_standards    TEXT[],

    -- Cross-referinte la alte sectiuni CS (FIX 6)
    cross_references        TEXT[],              -- ["3.2.1", "Anexa 5"]
    cross_reference_context TEXT,                -- Text din sectiunile referite, concatenat

    -- Control calitate
    extraction_confidence   FLOAT,               -- Confidenta LLM la extragere
    needs_human_review      BOOLEAN DEFAULT false,
    human_review_note       TEXT,

    created_at              TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_reqs_project ON extracted_requirements(project_id);
CREATE INDEX idx_reqs_category ON extracted_requirements(category);

-- ===================== EVALUATION RUNS =====================
-- O sesiune completa de evaluare (pt tracking progres)
CREATE TABLE evaluation_runs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','running','completed','failed')),
    total_requirements  INTEGER DEFAULT 0,
    evaluated_count     INTEGER DEFAULT 0,
    conform_count       INTEGER DEFAULT 0,
    neconform_count     INTEGER DEFAULT 0,
    partial_count       INTEGER DEFAULT 0,
    insufficient_count  INTEGER DEFAULT 0,
    needs_review_count  INTEGER DEFAULT 0,
    error_count     INTEGER DEFAULT 0,          -- FIX 10: cerinte care au esuat individual
    
    -- FIX 15: Cost tracking
    total_input_tokens  INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd  DECIMAL(10,4) DEFAULT 0,
    
    -- FIX 33: Config evaluare salvat pt trasabilitate
    run_config          JSONB DEFAULT '{}',     -- exclude_categories, priorities, mode, etc.
    
    -- FIX 36: Re-evaluare incrementala
    previous_run_id     UUID REFERENCES evaluation_runs(id),
    
    celery_task_id      TEXT,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    error_message       TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_runs_project ON evaluation_runs(project_id);

-- ===================== REQUIREMENT EVALUATIONS =====================
-- Verdictul AI pt fiecare cerinta: PT respecta cerinta sau nu?
CREATE TABLE requirement_evaluations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id              UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    requirement_id      UUID NOT NULL REFERENCES extracted_requirements(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- VERDICT
    verdict             TEXT NOT NULL CHECK (verdict IN ('CONFORM','NECONFORM','PARTIAL','INSUFFICIENT_DATA')),
    confidence_score    FLOAT NOT NULL,          -- 0.0 - 1.0

    -- ANTI-HALUCINARE: rationament structurat
    reasoning           TEXT NOT NULL,            -- Rationament pas cu pas

    -- ANTI-HALUCINARE: citate exacte din PT (propunerea tehnica)
    -- Format: [{"quote": "text exact", "chunk_id": "uuid", "verified": true/false, "similarity": 0.95}]
    proposal_quotes     JSONB NOT NULL DEFAULT '[]',

    -- Ce aspecte sunt acoperite vs lipsesc
    covered_aspects     JSONB DEFAULT '[]',      -- ["clasa beton C25/30", "grosime 30cm"]
    missing_aspects     JSONB DEFAULT '[]',      -- ["nu specifica tipul ciment"]

    -- Metadata retrieval
    retrieved_chunk_ids UUID[],                  -- Ce chunk-uri PT au fost gasite si folosite
    retrieval_scores    JSONB DEFAULT '{}',       -- {chunk_id: score} pt debugging

    -- Verificare citate
    all_quotes_verified BOOLEAN DEFAULT false,
    verification_retries INTEGER DEFAULT 0,

    -- Human review
    needs_human_review  BOOLEAN DEFAULT false,
    human_verdict       TEXT,                     -- Override uman
    human_note          TEXT,
    reviewed_by         UUID REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,

    -- LLM metadata (pt audit + debugging)
    llm_model           TEXT,                     -- "claude-sonnet-4-20250514"
    llm_prompt_version  TEXT,                     -- "v1.2"
    llm_tokens_used     INTEGER,
    llm_latency_ms      INTEGER,

    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_evals_run ON requirement_evaluations(run_id);
CREATE INDEX idx_evals_verdict ON requirement_evaluations(verdict);
CREATE INDEX idx_evals_review ON requirement_evaluations(needs_human_review) WHERE needs_human_review = true;
```

---

## 5. CHUNKING SERVICE — ALGORITMUL DETALIAT (ANTI-HALUCINARE CRITICA)

Aceasta este cea mai importanta parte a sistemului. Un chunking prost = halucinari garantate.

### 5.1 De ce chunking-ul e critic

LLM-urile au fereastra de context limitata. Un CS de 300 pagini NU incape intr-un singur prompt. Trebuie spart in bucati (chunks) care sunt apoi cautate semantic. DAR:

- Daca spargi la intamplare → cerinte taiate la mijloc → informatii pierdute
- Daca chunk-ul nu are context ierarhic → AI-ul nu stie ca "betonul C25/30" se refera la fundatii, nu la pereti
- Daca chunk-uri prea mari → retrieval imprecis (aduci prea multa informatie irelevanta)
- Daca chunk-uri prea mici → pierdere context (fragment izolat fara sens)

### 5.2 Algoritmul in 5 Faze

#### FAZA 1: Clasificarea Liniilor

**SIMPLIFICAT CU DOCX-ONLY:** python-docx ne da heading levels DIRECT din Word styles.
Nu mai avem nevoie de regex fragil. Heading 1 = nivel 1, Heading 2 = nivel 2, etc.
Markdown-ul generat de word_parser_service deja are `#`, `##`, `###` corecte.

Regex-urile de mai jos raman ca FALLBACK pt documentele Word fara heading styles
(unele documente convertite din PDF pierd stilurile). Fiecare linie se clasifica:

```python
# Regex patterns pt structura documente constructii romanesti
HIERARCHY_PATTERNS = {
    1: [  # NIVEL 1: Capitol
        r"^(?:CAPITOLUL|CAPITOL|Cap\.?)\s*(\d+|[IVXLC]+)[\s.:–\-]*(.*)",
        r"^(\d+)\.\s*(?:CAPITOLUL|CAPITOL)\s*(.*)",
    ],
    2: [  # NIVEL 2: Sectiune/Articol
        r"^(?:Art(?:icolul)?\.?|Sect(?:iunea)?\.?)\s*(\d+\.\d+)[\s.:–\-]*(.*)",
        r"^(\d+\.\d+)\.?\s+([A-ZĂÎȘȚÂ].{2,})",
    ],
    3: [  # NIVEL 3: Sub-sectiune
        r"^(\d+\.\d+\.\d+)\.?\s+(.*)",
    ],
    4: [  # NIVEL 4: Punct/litera
        r"^(\d+\.\d+\.\d+\.\d+)\.?\s+(.*)",
        r"^\(?([a-z])\)\s+(.*)",
        r"^(\d+)\)\s+(.*)",
    ],
}

TABLE_PATTERN = r"^\|.*\|"  # Linie de tabel Markdown
STANDARD_PATTERNS = [
    r"SR\s*EN\s*[\d:–\-/]+",
    r"STAS\s*[\d/–\-]+",
    r"NP\s*\d+[-–]\d+",
    r"EN\s*\d+",
    r"ISO\s*\d+",
]
```

**Pseudocod:**
```
pentru fiecare linie din markdown:
    daca linia match HIERARCHY_PATTERNS[nivel]:
        clasificare = (nivel, id_sectiune, titlu_sectiune)
    altfel daca linia match TABLE_PATTERN:
        clasificare = "tabel"
    altfel:
        clasificare = "text"
    
    extrage orice standard reference din linie
    
    rezultat: lista de (linie, clasificare, standarde_gasite)
```

#### FAZA 2: Constructia Arborelui Ierarhic

Transformam lista liniara de linii clasificate intr-un arbore:

```
Document
├── Capitol 1: Prevederi Generale
│   ├── 1.1: Obiectul lucrarii
│   │   └── [text linii...]
│   ├── 1.2: Amplasamentul
│   │   └── [text linii...]
├── Capitol 2: Conditii Tehnice
│   ├── 2.1: Materiale
│   │   ├── 2.1.1: Beton
│   │   │   ├── a) Clasa betonului
│   │   │   │   └── [text + tabel]
│   │   │   ├── b) Agregate
│   │   │   │   └── [text]
│   │   ├── 2.1.2: Otel beton
│   │   │   └── [text + standarde]
│   ├── 2.2: Executie lucrari
│   │   └── ...
```

**Pseudocod:**
```
arbore = Node(nivel=0, titlu="Document", copii=[], linii=[])
stiva_context = [arbore]

pentru fiecare (linie, clasificare, standarde) din lista_clasificata:
    daca clasificare.nivel > 0:  # E un heading
        nod_nou = Node(
            nivel=clasificare.nivel,
            id_sectiune=clasificare.id,
            titlu=clasificare.titlu,
            copii=[],
            linii=[]
        )
        # Urca in stiva pana gasim parintele corect
        cat_timp stiva_context[-1].nivel >= clasificare.nivel:
            stiva_context.pop()
        stiva_context[-1].copii.append(nod_nou)
        stiva_context.append(nod_nou)
    altfel:
        stiva_context[-1].linii.append(linie)
```

#### FAZA 3: Generarea Breadcrumb-urilor

Traversam arborele si generam calea ierarhica completa pt fiecare nod:

```
Nod "2.1.1: Beton" → breadcrumb = "Cap.2: Conditii Tehnice > 2.1: Materiale > 2.1.1: Beton"
Nod "a) Clasa betonului" → breadcrumb = "Cap.2: Conditii Tehnice > 2.1: Materiale > 2.1.1: Beton > a) Clasa betonului"
```

**Pseudocod:**
```
functie genereaza_breadcrumbs(nod, cale_curenta=""):
    daca nod.id_sectiune:
        cale = cale_curenta + " > " + nod.id_sectiune + ": " + nod.titlu
    altfel daca nod.titlu:
        cale = cale_curenta + " > " + nod.titlu
    altfel:
        cale = cale_curenta
    
    nod.breadcrumb = cale.strip(" > ")
    
    pentru copil in nod.copii:
        genereaza_breadcrumbs(copil, cale)
```

#### FAZA 4: Chunking Efectiv

Traversam arborele si cream chunk-uri cu aceste REGULI STRICTE:

**REGULA 1: Target 512-1024 tokeni per chunk** (optimal pt retrieval)

**REGULA 2: NICIODATA nu taiem la mijloc de propozitie**
- Detectam sfarsit propozitie: `.` urmat de spatiu/newline, DAR NU in abrevieri ("Art.", "Nr.", "pct.", "lit.", "alin.", "SR EN")

**REGULA 3: Tabelele sunt atomice**
- Un tabel = un chunk intreg, chiar daca depaseste 1024 tokeni
- Motivatie: tabelele din CS contin specificatii tehnice precise; daca le spargi, pierzi corespondenta rand-header

**REGULA 4: Chunk-urile poarta context ierarhic**
- `content_with_context` = breadcrumb + "\n\n" + text_chunk
- `content_raw` = text_chunk (fara breadcrumb)

**REGULA 5: Overlap de 2 propozitii**
- Ultimele 2 propozitii din chunk N apar si la inceputul chunk N+1
- Asta asigura ca informatia de la granite nu se pierde

**REGULA 6: Sectiuni scurte nu se sparg**
- Daca o sectiune intreaga (cu tot textul) < 1024 tokeni → un singur chunk
- NU spargi in bucati de 512 daca sectiunea e doar 800 tokeni

**Pseudocod:**
```
functie chunk_document(arbore):
    chunks = []
    
    functie proceseaza_nod(nod):
        text_total = join(nod.linii)
        
        # Adauga textul copiilor fara sub-sectiuni (text direct sub nod)
        # Copiii cu sub-sectiuni se proceseaza recursiv
        
        daca nod are copii cu nivel > 0:
            # Proceseaza mai intai textul propriu al nodului
            daca text_total nu e gol:
                chunk_text_simplu(text_total, nod.breadcrumb, nod)
            # Apoi proceseaza recursiv copiii
            pentru copil in nod.copii:
                proceseaza_nod(copil)
        altfel:
            # Nod frunza — chunk textul
            chunk_text_simplu(text_total, nod.breadcrumb, nod)
    
    functie chunk_text_simplu(text, breadcrumb, nod):
        tokeni = numar_tokeni(text)
        
        daca tokeni <= 1024:
            # Sectiune scurta → un singur chunk
            chunks.append(Chunk(
                content_with_context = breadcrumb + "\n\n" + text,
                content_raw = text,
                hierarchy_path = breadcrumb,
                section_id = nod.id_sectiune,
                section_title = nod.titlu,
                hierarchy_level = nod.nivel,
                chunk_type = detecteaza_tip(text),
                detected_standards = extrage_standarde(text),
                start_paragraph = nod.start_para_idx,
                end_paragraph = nod.end_para_idx,
            ))
        altfel:
            # Sectiune lunga → sparge la granite de propozitie
            propozitii = split_propozitii(text)
            chunk_curent = []
            tokeni_curent = 0
            
            pentru prop in propozitii:
                tokeni_prop = numar_tokeni(prop)
                daca tokeni_curent + tokeni_prop > 1024 SI chunk_curent nu e gol:
                    # Salveaza chunk-ul curent
                    text_chunk = join(chunk_curent)
                    chunks.append(Chunk(
                        content_with_context = breadcrumb + "\n\n" + text_chunk,
                        content_raw = text_chunk,
                        ...
                    ))
                    # Overlap: incepe noul chunk cu ultimele 2 propozitii
                    chunk_curent = chunk_curent[-2:] daca len(chunk_curent) >= 2 altfel chunk_curent[-1:]
                    tokeni_curent = numar_tokeni(join(chunk_curent))
                
                chunk_curent.append(prop)
                tokeni_curent += tokeni_prop
            
            # Ultimul chunk
            daca chunk_curent:
                text_chunk = join(chunk_curent)
                chunks.append(Chunk(...))
    
    proceseaza_nod(arbore)
    return chunks
```

#### FAZA 5: Detectia si Tratamentul Tabelelor

Tabelele in Markdown arata asa:
```markdown
| Material | Clasa | Standard |
|----------|-------|----------|
| Beton fundatii | C25/30 | SR EN 206 |
| Beton stalpi | C30/37 | SR EN 206 |
```

**Reguli tabele:**
- Detectam blocuri de tabele (linii consecutive cu `|`)
- Un tabel = INTOTDEAUNA un chunk separat
- Breadcrumb-ul se aplica si la tabele
- Daca un tabel depaseste 2048 tokeni (tabel ENORM), il spargem pe randuri DAR pastram INTOTDEAUNA header-ul tabelului (prima linie + separator) la inceputul fiecarui chunk de tabel

---

## 6. RETRIEVAL SERVICE — CAUTARE HIBRIDA ANTI-HALUCINARE

### 6.1 De ce cautare hibrida?

**Vector search singur ESUEAZA pe specificatii tehnice:**
- "C25/30" (clasa beton) — embedding-ul NU captureaza semnificatia exacta a numericelor
- "SR EN 206-1:2014" — un numar de standard nu are sens semantic, e un IDENTIFICATOR
- "Ø16 mm" (diametru armatura) — vectorul nu diferentiaza Ø16 de Ø20

**Keyword search singur ESUEAZA pe sens:**
- "armatura longitudinala" NU gaseste "bare de otel dispuse pe directia principala" (sinonim)
- "impermeabilizare" NU gaseste "protectie contra infiltratiilor de apa" (parafrazare)

**SOLUTIA: AMBELE simultan, combinate cu Reciprocal Rank Fusion (RRF)**

### 6.2 Algoritmul Hybrid Search

```
FUNCTIE hybrid_search(query, document_ids: list[UUID], top_k=20):
    # FIX 16: document_ids PLURAL — cauta in TOATE documentele PT simultan
    
    # PASUL 1: Vector Search (semantic)
    query_embedding = embedding_service.embed(query)
    vector_results = SQL:
        SELECT id, content_raw, section_id,
               1 - (embedding <=> query_embedding) as cosine_similarity
        FROM document_chunks
        WHERE document_id = ANY({document_ids})
        ORDER BY embedding <=> query_embedding
        LIMIT {top_k * 2}
    
    # PASUL 2: Full-Text Search (keyword/BM25-like)
    # NOTA FIX 20: Folosim 'simple' intentionat — keyword search e pt valori exacte
    # ("C25/30", "SR EN 206"). Vector search se ocupa de variatii lingvistice.
    fts_results = SQL:
        SELECT id, content_raw, section_id,
               ts_rank(to_tsvector('simple', content_with_context), 
                       plainto_tsquery('simple', query)) as fts_score
        FROM document_chunks
        WHERE document_id = ANY({document_ids})
          AND to_tsvector('simple', content_with_context) @@ plainto_tsquery('simple', query)
        ORDER BY fts_score DESC
        LIMIT {top_k * 2}
    
    # PASUL 3: Reciprocal Rank Fusion (RRF)
    # RRF combina doua liste ranked fara sa depinda de scala scorurilor
    k = 60  # constanta RRF standard
    scores = {}
    
    pentru i, result in enumerate(vector_results):
        scores[result.id] = scores.get(result.id, 0) + 1/(k + i + 1)
    
    pentru i, result in enumerate(fts_results):
        scores[result.id] = scores.get(result.id, 0) + 1/(k + i + 1)
    
    # PASUL 4: Sorteaza dupa scor combinat, returneaza top_k
    sorted_ids = sorted(scores, key=scores.get, reverse=True)[:top_k]
    
    returneaza chunk-urile ordonate
```

### 6.3 Multi-Query Retrieval

Pentru a maximiza sansa de a gasi informatia relevanta, nu cautam cu un singur query:

```
FUNCTIE multi_query_search(requirement_text, pt_document_ids: list[UUID], top_k=20):
    
    # Query 1: Textul cerintei direct
    q1 = requirement_text
    
    # Query 2: Reformulare de catre LLM (ieftin, Haiku/4o-mini)
    q2 = llm_call(
        model="haiku",
        prompt="""Reformuleaza aceasta cerinta tehnica de constructii in 2-3 
        variante diferite, pastrand sensul exact. Foloseste sinonime si 
        formulari alternative. Cerinta: {requirement_text}"""
    )
    
    # Query 3: Extragere cuvinte-cheie tehnice
    q3 = extrage_keywords(requirement_text)  
    # ex: din "Betonul pt fundatii trebuie sa fie clasa C25/30 conform SR EN 206"
    # → "C25/30 SR EN 206 beton fundatii"
    
    # Executa hybrid search pt fiecare query (FIX 16: document_ids plural)
    results_1 = hybrid_search(q1, pt_document_ids, top_k)
    results_2 = hybrid_search(q2, pt_document_ids, top_k)
    results_3 = hybrid_search(q3, pt_document_ids, top_k)
    
    # Combina cu RRF
    all_results = rrf_merge(results_1, results_2, results_3)
    
    returneaza top_k rezultate unice
```

### 6.4 Cross-Encoder Reranking (BATCH — FIX 1)

Dupa retrieval initial, avem ~20 chunk-uri candidat. Multi sunt irelevanti. Reranking-ul e BATCH (un singur apel LLM), NU per-chunk.

```
FUNCTIE rerank(query, chunks, top_k=5):
    # BATCH reranking: un singur apel LLM pt TOATE chunk-urile
    
    chunks_text = ""
    pentru i, chunk in enumerate(chunks):
        chunks_text += f"[FRAGMENT {i+1}] (Sectiune: {chunk.hierarchy_path})\n"
        # Tabele: text integral (contin specificatii precise — nu trunchia)
        # Text: max 1000 chars (crescut de la 500 — info relevanta poate fi dupa char 500)
        daca chunk.chunk_type == "table":
            chunks_text += chunk.content_raw
        altfel:
            chunks_text += chunk.content_raw[:1000]
        chunks_text += "\n\n"
    
    response = llm_call(
        model="haiku",
        prompt=f"""Evalueaza relevanta fiecarui fragment pentru cerinta data.
        
CERINTA: {query}

FRAGMENTE:
{chunks_text}

Raspunde cu JSON: {{"scores": [scor1, scor2, ...]}} unde fiecare scor e 0-10.
Scor 0 = complet irelevant, 10 = contine exact informatia cautata."""
    )
    
    scores = parse_json(response).scores
    scored_chunks = list(zip(chunks, scores))
    
    # FIX 7: Diversity filter — max 2 chunk-uri din aceeasi sectiune
    scored_chunks.sort(key=lambda x: x[1], reverse=True)
    result = []
    section_counts = {}
    pentru chunk, score in scored_chunks:
        section = chunk.section_id or "unknown"
        daca section_counts.get(section, 0) < 2:
            result.append(chunk)
            section_counts[section] = section_counts.get(section, 0) + 1
        daca len(result) >= top_k:
            break
    
    returneaza result
```

### 6.5 Verification Pass (Anti-False-Negative)

Cel mai periculos tip de eroare: sa zici NECONFORM cand de fapt informatia EXISTA in PT dar retrieval-ul a ratat-o.

```
FUNCTIE evaluation_cu_verificare(requirement, pt_document_id):
    
    # Runda 1: retrieval + evaluare normala
    chunks = multi_query_search(requirement.text, pt_document_id)
    chunks = rerank(requirement.text, chunks, top_k=5)
    result = evaluate_with_llm(requirement, chunks)
    
    DACA result.verdict == "NECONFORM" SAU result.verdict == "INSUFFICIENT_DATA":
        # Runda 2: retry cu query-uri diferite
        # Genereaza query-uri complet noi, din alt unghi
        alternative_queries = llm_call(
            model="haiku",
            prompt="""Cerinta: {requirement.text}
            Nu am gasit informatia relevanta cu aceste cautari: {queries_runda1}
            
            Genereaza 3 interogari COMPLET DIFERITE care ar putea gasi 
            informatia in propunerea tehnica. Gandeste-te la sinonime, 
            formulari indirecte, sectiuni unde aceasta informatie 
            ar putea aparea (ex: memoriu tehnic, specificatii, grafic)."""
        )
        
        chunks_noi = cautare_cu_queries_noi(alternative_queries, pt_document_id)
        chunks_combinate = merge_unique(chunks, chunks_noi)[:8]
        
        result_2 = evaluate_with_llm(requirement, chunks_combinate)
        
        DACA result_2.verdict DIFERIT DE result.verdict:
            # Doua runde au dat rezultate diferite → uncertain → human review
            result_2.needs_human_review = true
            result_2.confidence_score = min(result_2.confidence_score, 0.5)
        
        returneaza result_2
    
    returneaza result
```

---

## 7. EVALUATION SERVICE — PROMPT ENGINEERING ANTI-HALUCINARE

### 7.1 Prompt-ul de Evaluare (CRITIC)

Acesta este prompt-ul EXACT care se trimite la LLM (Claude/GPT-4o) pt evaluarea fiecarei cerinte.

**IMPORTANT:** Prompt-ul este ULTRA-RESTRICTIV intentionat. Fiecare regula previne un tip specific de halucinare.

```python
EVALUATION_PROMPT = """
Esti un evaluator de conformitate pentru propuneri tehnice de constructii in cadrul 
licitatiilor publice din Romania.

SARCINA: Evalueaza daca PROPUNEREA TEHNICA (PT) respecta o cerinta specifica 
din CAIETUL DE SARCINI (CS).

=== REGULI ABSOLUTE (INCALCAREA = EROARE FATALA) ===

REGULA 1: Foloseste EXCLUSIV informatia din FRAGMENTELE PT de mai jos. 
NU ai voie sa folosesti cunostinte proprii, informatii din antrenament, 
sau presupuneri logice.

REGULA 2: Pentru FIECARE afirmatie pe care o faci, TREBUIE sa citezi 
TEXT EXACT din fragmentele PT. Citeaza intre ghilimele duble.

REGULA 3: Daca informatia NU exista in fragmentele date, verdictul 
TREBUIE sa fie INSUFFICIENT_DATA. NU ghici, NU deduce, NU presupune.

REGULA 4: Numerele, masuratorile si specificatiile tehnice trebuie sa 
se potriveasca EXACT. "C25/30" NU este "C20/25". "Ø16" NU este "Ø14".

REGULA 5: Daca PT spune "similar", "echivalent", "sau similar" fara 
a specifica EXACT, aceasta NU este conformitate deplina → verdict PARTIAL.

REGULA 6: Daca fragmentele PT mentioneaza partial cerinta (ex: mentioneaza 
materialul dar nu clasa), verdict = PARTIAL cu specificarea clara a ce lipseste.

REGULA 7: ALTERNATIVE SI ECHIVALENTE (FIX 24)
Daca PT propune o alternativa diferita de cerinta CS:
- Si valoarea propusa e CLAR SUPERIOARA (clasa mai mare, grosime mai mare,
  rezistenta mai mare) → verdict CONFORM + nota "PT depaseste cerinta: [detalii]"
- Si PT declara explicit "echivalent" sau "sau echivalent" fara a demonstra →
  verdict PARTIAL + nota "Alternativa declarata echivalenta — verificare umana necesara"
- Si PT propune altceva FARA justificare → verdict NECONFORM
NU da automat NECONFORM doar pentru ca valoarea/produsul e DIFERIT.

REGULA 8: SUSPICIUNE ERORI DE CONVERSIE (FIX 27, adaptat pt DOCX-only)
Documentele pot contine erori din conversia PDF→Word (caractere gresite, cifre schimbate).
Daca o valoare din PT e APROAPE identica cu cea din CS dar difera cu exact 1 caracter:
- Noteaza: "POSIBILA EROARE DE CONVERSIE: PT contine [X], CS cere [Y]"
- verdict = PARTIAL (NU NECONFORM)
- confidence_score = max 0.5
- In missing_aspects: "Verificare manuala necesara — posibila eroare din conversia PDF→Word"

=== CERINTA DIN CAIETUL DE SARCINI ===
Sectiunea: {requirement.section_reference}
Context ierarhic: {requirement.hierarchy_path}
Cerinta: {requirement.requirement_text}
Text original CS: "{requirement.original_text}"
Standarde referentiate: {requirement.referenced_standards}
Tip verificare: {requirement.verification_type}

=== INSTRUCTIUNI SPECIFICE TIPULUI DE VERIFICARE ===
{if verification_type == "match_value"}
ATENTIE: Aceasta cerinta necesita o VALOARE SPECIFICA in PT.
Cauta valoarea exacta. "C25/30" NU este "C20/25". "20cm" NU este "15cm".
Daca PT da o valoare mai mare decat minimul cerut (ex: cerinta "minim 20cm", PT "25cm"), 
verdict = CONFORM.
Daca PT da o valoare diferita fara relatie de ordine, verdict = NECONFORM.
{elif verification_type == "match_reference"}
ATENTIE: Cerinta e doar sa MENTIONEZE standardul/normativul.
NU cauta continutul standardului in PT — doar verifica daca PT il refera.
Daca PT mentioneaza standardul (chiar cu o formulare diferita), verdict = CONFORM.
{elif verification_type == "unverifiable"}
Aceasta cerinta e prea generala pt verificare automata.
Verdict = INSUFFICIENT_DATA cu nota ca necesita verificare umana.
{endif}

=== ECHIVALENTE TERMINOLOGICE (STAS ↔ SR EN) ===
{if equivalences}
Urmatoarele denumiri sunt ECHIVALENTE (standard vechi ↔ standard nou):
{for old, new in equivalences}
- {old} = {new}
{endfor}
Daca CS cere "{old_term}" si PT ofera "{new_term}" (sau invers), 
acestea sunt ECHIVALENTE → verdict CONFORM.
{endif}

=== FRAGMENTE DIN PROPUNEREA TEHNICA (PT) ===
{for i, chunk in enumerate(retrieved_chunks)}
--- FRAGMENT PT #{i+1} ---
Sursa: {chunk.hierarchy_path}
Paragraf: {chunk.start_paragraph}-{chunk.end_paragraph}
Text:
{chunk.content_raw}
--- / FRAGMENT PT #{i+1} ---
{endfor}

=== FORMAT RASPUNS (JSON STRICT) ===
Raspunde EXCLUSIV cu un obiect JSON valid, fara text inainte sau dupa:

{{
    "verdict": "CONFORM" | "NECONFORM" | "PARTIAL" | "INSUFFICIENT_DATA",
    "confidence_score": <float 0.0-1.0>,
    "exact_quotes_from_pt": [
        {{
            "quote": "<text EXACT copiat din fragmentele PT, nu parafrazat>",
            "fragment_number": <numarul fragmentului PT (1,2,3...)>,
            "relevance": "<de ce acest citat e relevant pt cerinta>"
        }}
    ],
    "step_by_step_reasoning": "<rationament PAS CU PAS: 1) Ce cere cerinta exact? 2) Ce am gasit in PT? 3) Se potrivesc? 4) Ce lipseste?>",
    "covered_aspects": ["<aspect1 din cerinta care e acoperit in PT>"],
    "missing_aspects": ["<aspect1 din cerinta care NU e acoperit in PT>"],
    "technical_comparison": "<daca cerinta implica valori numerice: comparatie directa CS vs PT>"
}}

IMPORTANT: 
- "exact_quotes_from_pt" trebuie sa contina TEXT IDENTIC cu cel din fragmentele PT. 
  Copy-paste, nu parafrazare.
- Daca nu gasesti NICIO informatie relevanta in fragmente, "exact_quotes_from_pt" = [] 
  si verdict = "INSUFFICIENT_DATA".
- confidence_score < 0.6 daca informatia e ambigua sau incompleta.
"""
```

### 7.2 Prompt-ul de Extragere Cerinte din CS

```python
EXTRACTION_PROMPT = """
Esti un analist de licitatii publice de constructii din Romania.

SARCINA: Extrage TOATE cerintele tehnice individuale (atomice) din fragmentul 
de Caiet de Sarcini de mai jos.

=== REGULI ===

1. O cerinta ATOMICA = o singura obligatie verificabila. 
   GRESIT: "Betonul trebuie sa fie C25/30 si armaturile din OB37"
   CORECT: Doua cerinte separate:
   - "Betonul trebuie sa fie clasa C25/30"
   - "Armaturile trebuie sa fie din otel OB37"

2. Pastreaza EXACT textul original pt fiecare cerinta (camp separat).

3. Clasifica fiecare cerinta:
   - Categorie: tehnic | administrativ | calitate | termene | personal | echipamente | materiale
   - Prioritate: obligatoriu (cuvinte: "trebuie", "va fi", "este obligatoriu", "se impune")
                  recomandat (cuvinte: "se recomanda", "este de preferat")
                  optional (cuvinte: "poate", "optional")
                  informativ (informatii de context fara obligatie)

4. Daca o cerinta refera un standard (SR EN, STAS, NP, etc.), extrage-l explicit.

5. Daca o cerinta e compusa ("X SI Y SI Z"), sparge-o in sub-cerinte dar noteaza 
   ca sunt legate (is_compound = true).

6. Ignora textul pur informativ fara obligatii verificabile.

7. Clasifica TIPUL DE VERIFICARE necesar:
   - "match_value": PT trebuie sa contina o valoare specifica (ex: "C25/30", "20cm", "Ø16")
   - "match_reference": PT trebuie doar sa MENTIONEZE un standard/normativ (ex: "conform SR EN 206")
   - "match_description": PT trebuie sa descrie o abordare/metodologie/proces
   - "unverifiable": cerinta prea vaga ("conform normativelor in vigoare", "calitate corespunzatoare")
   Acesta e ESENTIAL pt evaluarea corecta — nu cere LLM-ului sa gasca continutul unui 
   standard in PT daca cerinta e doar sa-l referentieze.

8. Daca fragmentul contine referinte la ALTE sectiuni ale CS (ex: "conform pct. 3.2.1",
   "vezi Anexa 5"), noteaza-le in cross_references.

=== FRAGMENT CAIET DE SARCINI ===
Sectiune: {chunk.hierarchy_path}
Pagini: {chunk.start_page}-{chunk.end_page}
Text:
{chunk.content_raw}

=== FORMAT RASPUNS (JSON STRICT) ===
{{
    "requirements": [
        {{
            "requirement_text": "<cerinta reformulata clar, verificabila>",
            "original_text": "<text EXACT din fragment>",
            "category": "tehnic|administrativ|calitate|termene|personal|echipamente|materiale",
            "priority": "obligatoriu|recomandat|optional|informativ",
            "verification_type": "match_value|match_reference|match_description|unverifiable",
            "referenced_standards": ["SR EN 206", ...],
            "cross_references": ["3.2.1", "Anexa 5"],
            "is_compound": false,
            "compound_parts": [],
            "confidence": <float 0.0-1.0>
        }}
    ]
}}

Daca fragmentul nu contine cerinte verificabile, returneaza {{"requirements": []}}.
"""
```

### 7.3 Prompt-ul de Query Rewriting

```python
QUERY_REWRITE_PROMPT = """
Esti un specialist in cautare semantica in documente tehnice de constructii.

SARCINA: Genereaza 3 interogari de cautare DIFERITE care ar putea gasi 
informatia relevanta pentru cerinta data, intr-o propunere tehnica de constructii.

Cerinta din Caietul de Sarcini: {requirement_text}

Gandeste-te la:
1. O reformulare directa cu sinonime tehnice din constructii
2. O cautare focusata pe cuvinte-cheie tehnice (coduri, standarde, masuratori)
3. O cautare focusata pe sectiunea din PT unde aceasta informatie ar aparea 
   de obicei (memoriu tehnic, grafice, specificatii materiale, organizare santier)

Raspunde cu JSON:
{{
    "queries": [
        "<interogare 1>",
        "<interogare 2>",
        "<interogare 3>"
    ]
}}
"""
```

---

## 8. QUOTE VERIFICATION SERVICE — VERIFICARE PROGRAMATICA A CITATELOR

### 8.1 Algoritmul

Dupa ce LLM-ul returneaza evaluarea cu citate, verificam ca citatele EXISTA in chunk-urile sursa:

```
FUNCTIE verifica_citate(evaluation_result, retrieved_chunks):
    toate_verificate = true
    
    pentru citat in evaluation_result.exact_quotes_from_pt:
        gasit = false
        best_similarity = 0
        best_chunk_id = null
        
        pentru chunk in retrieved_chunks:
            # FIX 14: rapidfuzz in loc de SequenceMatcher (100x mai rapid)
            from rapidfuzz import fuzz
            similarity = fuzz.partial_ratio(
                normalizeaza(citat.quote),
                normalizeaza(chunk.content_raw)
            ) / 100.0
            
            daca similarity > best_similarity:
                best_similarity = similarity
                best_chunk_id = chunk.id
            
            daca similarity >= 0.80:  # Threshold 80% (scazut de la 85% pt toleranta OCR)
                gasit = true
                break
        
        citat.verified = gasit
        citat.similarity = best_similarity
        citat.chunk_id = best_chunk_id
        
        daca NOT gasit:
            toate_verificate = false
    
    evaluation_result.all_quotes_verified = toate_verificate
    
    daca NOT toate_verificate:
        evaluation_result.needs_human_review = true
        evaluation_result.confidence_score = min(
            evaluation_result.confidence_score, 0.4
        )

    # FIX 14 ALTERNATIV pt productie: pg_trgm direct din PostgreSQL
    # SQL: SELECT similarity(content_raw, %(quote)s) FROM document_chunks WHERE id = ANY(%(ids)s)
    
    returneaza evaluation_result


# FIX 14: calculeaza_similaritate inlocuit cu rapidfuzz.fuzz.partial_ratio (vezi mai sus)
# Vechea implementare SequenceMatcher sliding window era O(n^3) — eliminata.
```

---

## 9. CELERY TASK PIPELINE — FLUXUL COMPLET

### 9.1 Task 1: process_document (OCR → Chunk → Embed)

Triggered la upload document. Ruleaza pt FIECARE document uploadat.

```
TASK process_document(document_id):
    # FIX 10: Task cu retry + error handling
    # Decorat cu: @celery_app.task(bind=True, autoretry_for=(...), max_retries=3, acks_late=True)
    # FIX 48: Pool solo — task sync, asyncio.run() intern daca e nevoie
    
    doc = db.get(Document, document_id)
    
    try:
        # ═══ ETAPA 1: Parsare Word (.docx) ═══
        # SIMPLIFICAT: Doar .docx. Zero OCR. python-docx extrage tot.
        doc.processing_status = "parsing_in_progress"
        db.save(doc)
        
        result = word_parser_service.parse(doc.storage_path)
        
        # Validare minimala
        daca result.word_count < 50:
            raise ValueError(f"Document prea scurt ({result.word_count} cuvinte). Verificati fisierul.")
        
        # FIX 23: Normalizare diacritice romanesti (ş→ș, ţ→ț)
        markdown = text_normalizer.normalize_ro_chars(result.markdown)
        
        # FIX 34: Detectie document in slot gresit
        mismatch = doc_type_detector.detect_mismatch(markdown[:3000], doc.doc_type)
        daca mismatch:
            doc.processing_warning = mismatch
        
        doc.markdown_content = markdown
        doc.heading_count = result.heading_count
        doc.paragraph_count = result.paragraph_count
        doc.processing_status = "parsing_completed"
        db.save(doc)
        
        # ═══ ETAPA 2: Chunking ═══
        # SIMPLIFICAT: Heading-urile vin direct din Word styles (Heading 1/2/3)
        # Nu mai avem regex fragil pt structure detection — python-docx ne da structura REALA
        doc.processing_status = "chunking_in_progress"
        db.save(doc)
        
        chunks = chunking_service.chunk_document(
            markdown=markdown,
            document_id=doc.id,
            heading_levels=result.heading_levels,  # [(paragraph_idx, level, text), ...]
        )
        pentru chunk in chunks:
            db.create(DocumentChunk(**chunk))
        
        doc.processing_status = "chunking_completed"
        db.save(doc)
        
        # ═══ ETAPA 3: Embedding ═══
        doc.processing_status = "embedding_in_progress"
        db.save(doc)
        
        chunk_records = db.query(DocumentChunk).filter_by(document_id=doc.id).all()
        texts = [c.content_with_context pentru c in chunk_records]
        embeddings = embedding_service.embed_batch(texts)  # multi-provider (local sau OpenAI)
        
        pentru chunk_record, emb in zip(chunk_records, embeddings):
            chunk_record.embedding = emb
        db.bulk_save(chunk_records)
        
        doc.processing_status = "ready"
        db.save(doc)
        
        # Verifica daca TOATE documentele proiectului sunt ready → update project status
        all_docs = db.query(Document).filter_by(project_id=doc.project_id).all()
        daca all(d.processing_status == "ready" pentru d in all_docs):
            project = db.get(Project, doc.project_id)
            project.status = "documents_ready"
            db.save(project)
    
    except SoftTimeLimitExceeded:
        doc.processing_status = "error"
        doc.processing_error = "Timeout: procesarea a depasit limita de timp"
        db.save(doc)
    except Exception as e:
        doc.processing_status = "error"
        doc.processing_error = str(e)[:500]
        db.save(doc)
        raise  # re-raise pt Celery retry
```

### 9.2 Task 2: extract_requirements (CS chunks → cerinte atomice)

Triggered manual de user dupa ce CS + FDA sunt procesate.

```
TASK extract_requirements(project_id):
    project = db.get(Project, project_id)
    project.status = "processing"
    db.save(project)
    
    # Ia toate chunk-urile din documentele CS si FDA
    cs_fda_docs = db.query(Document).filter(
        Document.project_id == project_id,
        Document.doc_type.in_(['caiet_de_sarcini', 'fisa_de_date']),
        Document.processing_status == 'ready'
    ).all()
    
    pentru doc in cs_fda_docs:
        chunks = db.query(DocumentChunk).filter_by(
            document_id=doc.id
        ).order_by(DocumentChunk.chunk_index).all()
        
        pentru chunk in chunks:
            # Skip chunk-uri care sunt doar headere sau prea scurte
            daca chunk.token_count < 20:
                continue
            
            # FIX 25: Prompt diferit pt FDA vs CS
            prompt_template = FDA_EXTRACTION_PROMPT daca doc.doc_type == 'fisa_de_date' altfel EXTRACTION_PROMPT
            
            # FIX 11: Structured output cu Pydantic
            response = await llm_client.call_structured(
                model="claude-sonnet",
                prompt=prompt_template.format(chunk=chunk),
                response_model=ExtractionResponse,
            )
            
            cerinte = parse_json(response).requirements
            
            pentru cerinta in cerinte:
                db.create(ExtractedRequirement(
                    project_id=project_id,
                    source_chunk_id=chunk.id,
                    source_document_id=doc.id,
                    requirement_text=cerinta.requirement_text,
                    original_text=cerinta.original_text,
                    section_reference=chunk.hierarchy_path,
                    hierarchy_path=chunk.hierarchy_path,
                    category=cerinta.category,
                    priority=cerinta.priority,
                    referenced_standards=cerinta.referenced_standards,
                    is_compound=cerinta.is_compound,
                    extraction_confidence=cerinta.confidence,
                    needs_human_review=(cerinta.confidence < 0.7)
                ))
    
    # PASUL 2: Rezolva cross-referinte (FIX 6)
    all_reqs = db.query(ExtractedRequirement).filter_by(project_id=project_id).all()
    pentru req in all_reqs:
        daca req.cross_references:
            context_extra = []
            pentru ref in req.cross_references:
                # Cauta chunk-uri din CS cu section_id matching
                ref_chunks = db.query(DocumentChunk).filter(
                    DocumentChunk.document_id.in_([d.id pentru d in cs_fda_docs]),
                    DocumentChunk.section_id == ref
                ).all()
                pentru rc in ref_chunks:
                    context_extra.append(rc.content_raw)
            daca context_extra:
                req.cross_reference_context = "\n---\n".join(context_extra)
                db.save(req)
    
    # PASUL 3: Deduplicare cerinte (FIX 3 + FIX 31: dedup in 2 pasi)
    all_reqs = db.query(ExtractedRequirement).filter_by(project_id=project_id).all()
    to_delete = set()
    
    # PAS 3a (FIX 31): Dedup EXACTA pe original_text — prinde overlap-induced duplicates
    seen_texts = {}
    pentru req in all_reqs:
        key = strip_whitespace(normalize_ro(req.original_text)).lower()
        daca key in seen_texts:
            existing = seen_texts[key]
            keeper = pick_best(existing, req)  # pastreaza mai specifica
            to_delete.add(existing.id daca keeper.id != existing.id altfel req.id)
            seen_texts[key] = keeper
        altfel:
            seen_texts[key] = req
    
    # PAS 3b (FIX 3): Dedup SEMANTICA pe embedding — prinde reformulari
    remaining = [r pentru r in all_reqs daca r.id not in to_delete]
    req_embeddings = embedding_service.embed_batch([r.requirement_text pentru r in remaining])
    
    pentru i in range(len(remaining)):
        daca remaining[i].id in to_delete:
            continue
        pentru j in range(i+1, len(remaining)):
            daca remaining[j].id in to_delete:
                continue
            similarity = cosine_similarity(req_embeddings[i], req_embeddings[j])
            # FIX 3 imbunatatit: verifica SI ca sunt din aceeasi sectiune
            same_section = (remaining[i].hierarchy_path == remaining[j].hierarchy_path
                           or remaining[i].source_chunk_id == remaining[j].source_chunk_id)
            daca similarity > 0.92 SI same_section:
                keeper = pick_best(remaining[i], remaining[j])
                to_delete.add(remaining[i].id daca keeper.id != remaining[i].id altfel remaining[j].id)
    
    pentru req in all_reqs:
        daca req.id in to_delete:
            db.delete(req)
    
    project.status = "requirements_extracted"
    # FIX 17: Status NU devine "requirements_validated" automat.
    # Userul trebuie sa revizuiasca cerintele si sa apese "Valideaza" in UI.
    db.save(project)
```

### 9.3 Task 3: run_evaluation (cerinte × PT → verdicts)

Triggered manual de user dupa ce a validat cerintele extrase.

```
TASK run_evaluation(project_id, config: EvaluationRunConfig):
    # config contine: exclude_categories, exclude_verification_types, only_priorities (FIX 30)
    
    # FIX 13: Verificare concurrent run
    existing = db.query(EvaluationRun).filter(
        EvaluationRun.project_id == project_id,
        EvaluationRun.status.in_(["pending", "running"])
    ).first()
    daca existing:
        raise ValueError("Evaluare deja in curs")
    
    # FIX 17 + FIX 38: Verificare status (thorough = validare obligatorie, quick = skip)
    project = db.get(Project, project_id)
    daca config.mode == "thorough" SI project.status != "requirements_validated":
        raise ValueError("Cerintele nu au fost validate. Folositi modul 'quick' sau validati cerinte.")
    daca config.mode == "quick" SI project.status not in ["requirements_extracted", "requirements_validated"]:
        raise ValueError("Cerintele nu au fost extrase inca")
    
    run = db.create(EvaluationRun(
        project_id=project_id,
        status="running",
        started_at=now()
    ))
    
    # FIX 16: Ia TOATE documentele PT (pot fi multiple)
    pt_docs = db.query(Document).filter(
        Document.project_id == project_id,
        Document.doc_type == 'propunere_tehnica',
        Document.processing_status == 'ready'
    ).all()
    pt_doc_ids = [d.id pentru d in pt_docs]
    
    # FIX 30: Filtrare cerinte pe baza configuratiei
    cerinte_query = db.query(ExtractedRequirement).filter(
        ExtractedRequirement.project_id == project_id,
        ExtractedRequirement.priority.in_(config.only_priorities),
        ~ExtractedRequirement.category.in_(config.exclude_categories),
        ~ExtractedRequirement.verification_type.in_(config.exclude_verification_types),
    )
    
    # FIX 36: Re-evaluare incrementala — doar cerintele non-CONFORM din run anterior
    daca config.previous_run_id:
        failed_ids = db.query(RequirementEvaluation.requirement_id).filter(
            RequirementEvaluation.run_id == config.previous_run_id,
            RequirementEvaluation.verdict != "CONFORM"
        ).subquery()
        cerinte_query = cerinte_query.filter(ExtractedRequirement.id.in_(failed_ids))
    
    cerinte = cerinte_query.all()
    
    # FIX 33: Salveaza config pe run pt trasabilitate
    run.run_config = config.model_dump()
    run.run_config["total_requirement_count"] = db.query(ExtractedRequirement).filter_by(
        project_id=project_id).count()
    run.run_config["excluded_requirement_count"] = run.run_config["total_requirement_count"] - len(cerinte)
    
    run.total_requirements = len(cerinte)
    db.save(run)
    
    # FIX 40: Skip cerinte deja evaluate (idempotent la re-run dupa crash)
    already_done_ids = set(
        row[0] for row in db.execute(
            select(RequirementEvaluation.requirement_id)
            .where(RequirementEvaluation.run_id == run.id)
        ).all()
    )
    cerinte = [c pentru c in cerinte daca c.id not in already_done_ids]
    
    daca not cerinte:
        run.status = "completed"
        run.completed_at = now()
        db.save(run)
        return  # totul era deja procesat (re-run dupa crash)
    
    # FIX 41: Try/finally wrapper — status NICIODATA nu ramane "running"
    try:
        # FIX 12: Evaluare PARALELA cu semaphore
        semaphore = asyncio.Semaphore(EVAL_CONCURRENCY)  # default 5 din config
        
        async def evaluate_one(cerinta):
            async with semaphore:
                try:
                    # PASUL 1: Multi-query retrieval din PT
                    chunks = await retrieval_service.multi_query_search(
                        requirement_text=cerinta.requirement_text,
                        document_ids=pt_doc_ids,
                        top_k=20
                    )
                    
                    # PASUL 2: Reranking BATCH (FIX 1)
                    chunks = await retrieval_service.rerank(
                        query=cerinta.requirement_text,
                        chunks=chunks,
                        top_k=5
                    )
                    
                    # PASUL 3: Evaluare cu LLM (FIX 43: provider-specific structured output)
                    result = await llm_client.call_structured(
                        prompt=EVALUATION_PROMPT.format(
                            requirement=cerinta,
                            retrieved_chunks=chunks
                        ),
                        response_model=EvaluationResult,
                    )
                    
                    # PASUL 4: Verificare citate (FIX 14: rapidfuzz)
                    result = quote_verification_service.verifica_citate(result, chunks)
                    
                    # PASUL 5: Verification pass (daca NECONFORM/INSUFFICIENT)
                    daca result.verdict in ["NECONFORM", "INSUFFICIENT_DATA"]:
                        result = await verification_pass(cerinta, pt_doc_ids, chunks, result)
                    
                    # PASUL 6: Confidence routing
                    daca result.confidence_score < 0.6:
                        result.needs_human_review = true
                    daca result.verdict == "INSUFFICIENT_DATA":
                        result.needs_human_review = true
                    
                    # FIX 27: Detectie programatica erori OCR in valori numerice
                    daca result.verdict == "NECONFORM":
                        daca detect_ocr_value_mismatch(cerinta, result):
                            result.needs_human_review = true
                            result.reasoning += "\n⚠ POSIBILA EROARE OCR detectata programatic."
                    
                    # Salveaza evaluarea
                    db.create(RequirementEvaluation(
                        run_id=run.id,
                        requirement_id=cerinta.id,
                        project_id=project_id,
                        verdict=result.verdict,
                        confidence_score=result.confidence_score,
                        reasoning=result.step_by_step_reasoning,
                        proposal_quotes=result.exact_quotes_from_pt,
                        covered_aspects=result.covered_aspects,
                        missing_aspects=result.missing_aspects,
                        retrieved_chunk_ids=[c.id pentru c in chunks],
                        all_quotes_verified=result.all_quotes_verified,
                        needs_human_review=result.needs_human_review,
                        llm_model=settings.LLM_MODEL,
                        llm_prompt_version=CURRENT_EVAL_PROMPT_VERSION,
                    ))
                    
                    # FIX 39: Atomic counter update (NU run.X_count += 1)
                    await update_run_counter(run.id, result.verdict, result.needs_human_review, is_error=false)
                    
                except Exception as e:
                    # FIX 10: Skip cerinta esuata, continua cu restul
                    db.create(RequirementEvaluation(
                        run_id=run.id, requirement_id=cerinta.id, project_id=project_id,
                        verdict="INSUFFICIENT_DATA", confidence_score=0.0,
                        reasoning=f"Eroare la evaluare: {str(e)[:200]}",
                        proposal_quotes=[], needs_human_review=true,
                    ))
                    # FIX 39: Atomic counter (inclusiv error_count)
                    await update_run_counter(run.id, "INSUFFICIENT_DATA", true, is_error=true)
        
        # FIX 12: Lanseaza TOATE evaluarile in paralel (limitat de semaphore)
        await asyncio.gather(*[evaluate_one(c) pentru c in cerinte])
        
        run.status = "completed"
    
    except SoftTimeLimitExceeded:
        run.status = "failed"
        run.error_message = "Timeout: evaluarea a depasit limita de timp"
    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)[:500]
        raise  # re-raise pt Celery retry
    finally:
        # FIX 41: INTOTDEAUNA se executa — chiar si la crash
        run.completed_at = now()
        db.save(run)
        daca run.evaluated_count > 0:
            project.status = "evaluated"
        db.save(project)
```

---

## 10. API ENDPOINTS

```
# Health
GET  /api/health                                → {status, db_ok, redis_ok}

# Projects
GET  /api/projects                              → lista proiecte
POST /api/projects                              → creare proiect nou
GET  /api/projects/{id}                         → detalii proiect + status
DEL  /api/projects/{id}                         → stergere proiect

# Documents
POST /api/projects/{id}/documents               → upload fisier (multipart)
GET  /api/projects/{id}/documents               → lista documente + status procesare
GET  /api/projects/{id}/documents/{doc_id}      → detalii document
DEL  /api/projects/{id}/documents/{doc_id}      → FIX 51: cascade delete + reset project status
GET  /api/projects/{id}/documents/{doc_id}/pages/{page_num}  → pagina individuala (OCR result)

# Requirements
POST /api/projects/{id}/requirements/extract    → trigger extragere cerinte (async, returneaza task_id)
GET  /api/projects/{id}/requirements            → lista cerinte extrase (paginat, filtrat pe categorie/prioritate)
PUT  /api/projects/{id}/requirements/{req_id}   → edit cerinta (pt review uman)
DEL  /api/projects/{id}/requirements/{req_id}   → sterge cerinta falsa

# Requirements validation (FIX 17)
POST /api/projects/{id}/requirements/validate   → marcheaza cerintele ca validate (permite evaluare)

# Evaluations
POST /api/projects/{id}/evaluations/estimate    → estimare cost + durata INAINTE de evaluare (FIX 15)
POST /api/projects/{id}/evaluations/run         → trigger evaluare (FIX 13: rejecta daca run deja activ)
GET  /api/projects/{id}/evaluations/runs        → lista evaluation runs
GET  /api/projects/{id}/evaluations/runs/{run_id}           → status run + counters
GET  /api/projects/{id}/evaluations/runs/{run_id}/results   → rezultate detaliate (paginat, filtrat pe verdict)
GET  /api/projects/{id}/evaluations/results/{eval_id}       → detaliu evaluare (citate, rationament, surse)
PUT  /api/projects/{id}/evaluations/results/{eval_id}/review → human review override

# Analytics (FIX 19)
GET  /api/projects/{id}/analytics               → statistici + health warnings

# Report
GET  /api/projects/{id}/report                  → raport sumarizat JSON
GET  /api/projects/{id}/report/export           → export Word/PDF
```

---

## 11. DEPENDINTE PYTHON (requirements.txt)

```
# Web framework
fastapi>=0.115
uvicorn[standard]>=0.30
pydantic>=2.0
pydantic-settings>=2.0
python-multipart>=0.0.9

# Database
sqlalchemy[asyncio]>=2.0
asyncpg>=0.29
alembic>=1.13
pgvector>=0.3

# Task queue
celery>=5.4
redis>=5.0

# AI/ML — PRODUCTIE (comenteaza pt testare gratuita)
anthropic>=0.40          # Claude API (productie)
openai>=1.50             # OpenAI embeddings (productie)

# AI/ML — TESTARE GRATUITA (decomentate by default pt development)
google-generativeai>=0.8 # Gemini 2.0 Flash — FREE: 15 RPM, 1.5M tok/zi
sentence-transformers>=3.0  # Embeddings locale pe CPU (384 dim, multilingual)

# Document parsing (DOCX-only — zero OCR)
python-docx>=1.1         # Parsare Word: headings, tabele, formatting + export raport
rapidfuzz>=3.0           # FIX 14: fuzzy matching pt quote verification (C++ impl)

# Utilities
httpx>=0.27              # Async HTTP client
tiktoken>=0.7            # Token counting
python-jose[cryptography]>=3.3  # JWT (auth simplu)
passlib[bcrypt]>=1.7     # Password hashing
```

---

## 12. DOCKER COMPOSE (FIX 48,49,50 integrat)

```yaml
services:
  # FIX 50: Healthcheck pt a preveni connection errors la startup
  postgres:
    image: pgvector/pgvector:pg16
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

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ports: ["8000:8000"]
    volumes: ["./backend:/app", "./uploads:/uploads"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }

  # FIX 48: 2 workeri Celery cu pool=solo (suporta asyncio.gather)
  # Worker 1: procesare documente (Word parsing, chunking, embedding)
  celery-worker-processing:
    build: ./backend
    command: celery -A app.tasks.celery_app worker --loglevel=info --pool=solo --concurrency=1 --queues=processing
    volumes: ["./backend:/app", "./uploads:/uploads"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }

  # Worker 2: evaluare (extractie cerinte, evaluare conformitate)
  celery-worker-evaluation:
    build: ./backend
    command: celery -A app.tasks.celery_app worker --loglevel=info --pool=solo --concurrency=1 --queues=evaluation
    volumes: ["./backend:/app", "./uploads:/uploads"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }

  frontend:
    build: ./frontend
    command: npm run dev
    ports: ["3000:3000"]
    volumes: ["./frontend/src:/app/src"]
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000

volumes:
  postgres_data:
```

---

## 13. .env.example

```bash
# ================================================================
# DATABASE & INFRA (aceleasi pt testare si productie)
# ================================================================
DATABASE_URL=postgresql+asyncpg://ragcheck:ragcheck_dev@postgres:5432/ragcheck
REDIS_URL=redis://redis:6379/0
UPLOAD_DIR=/uploads
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1
EVAL_CONCURRENCY=5

# ================================================================
# PROFIL TESTARE — GRATUIT ($0)
# Decomentate by default. Obtine Gemini key de pe:
# https://aistudio.google.com/apikey (instant, gratis)
# ================================================================

# LLM: Google Gemini 2.0 Flash (FREE: 15 RPM, 1.5M tokens/zi)
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.0-flash
LLM_MODEL_CHEAP=gemini-2.0-flash
GEMINI_API_KEY=your_free_gemini_key_here

# Embeddings: sentence-transformers local (CPU, 384 dim, multilingual)
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL_LOCAL=paraphrase-multilingual-MiniLM-L12-v2
EMBEDDING_DIMENSIONS=384

# OCR: ELIMINAT. Toate documentele sunt .docx (convertite de echipa din PDF cu Adobe Acrobat).

# ================================================================
# PROFIL PRODUCTIE — PLATIT (~$13/evaluare)
# Decomentati blocul de mai jos si comentati blocul de testare
# ================================================================

# # LLM: Anthropic Claude (sau OpenAI GPT-4o)
# LLM_PROVIDER=anthropic
# LLM_MODEL=claude-sonnet-4-20250514
# LLM_MODEL_CHEAP=claude-haiku-4-5-20251001
# ANTHROPIC_API_KEY=sk-ant-...
# # Alternativ OpenAI:
# # LLM_PROVIDER=openai
# # LLM_MODEL=gpt-4o
# # LLM_MODEL_CHEAP=gpt-4o-mini
# # OPENAI_API_KEY=sk-...

# # Embeddings: OpenAI (1536 dim)
# EMBEDDING_PROVIDER=openai
# EMBEDDING_MODEL=text-embedding-3-small
# EMBEDDING_DIMENSIONS=1536
# OPENAI_API_KEY=sk-...

# NOTA: Schimbarea EMBEDDING_DIMENSIONS dupa ce exista date necesita
# re-embedding complet (stergere chunks + re-procesare documente)
# NOTA: OCR ELIMINAT. Input = doar .docx (echipa converteste PDF→Word cu Adobe).
```

---

## 14. FRONTEND — PAGINILE PRINCIPALE

### Pagina 1: Dashboard (/)
- Lista proiecte cu status badge (creat/procesare/evaluat/complet)
- Buton "Proiect Nou"
- Fiecare card: nume, data, numar documente, sumar verdict (daca exista)

### Pagina 2: Proiect Nou (/projects/new)
- Form: nume proiect, descriere
- **DOAR FISIERE .DOCX** — nota vizibila: "Convertiti PDF-urile in Word inainte de upload (Adobe Acrobat → Export → Word)"
- Upload zone-uri SEPARATE:
  - Drop zone 1: "Caiet de Sarcini (.docx)" — multiple fisiere (volume separate)
  - Drop zone 2: "Fisa de Date (.docx)" — un singur fisier
  - Drop zone 3: "Propunere Tehnica (.docx)" — **multiple fisiere** (memoriu + anexe)
- Accept: `.docx` only. Reject `.pdf`, `.doc` (format vechi) cu mesaj clar.
- Buton Submit → creare proiect + start procesare automata

### Pagina 3: Status Proiect (/projects/[id])
- Pipeline vizual: Upload → OCR → Chunking → Embedding → Ready
- Per document: bara progres cu status curent + buton "Sterge" (FIX 18: cu warning cascade)
- Cand toate documentele sunt "ready": buton "Extrage Cerinte"
- Dupa extragere: buton pe pagina /requirements (NU aici — FIX 17)
- Daca document in stare "error": arata mesajul de eroare + buton "Retry" (FIX 10)

### Pagina 4: Cerinte Extrase (/projects/[id]/requirements) — CHECKPOINT OBLIGATORIU (FIX 17)
- Tabel cu cerinte extrase din CS
- Coloane: #, Text Cerinta, Categorie, Prioritate, Tip Verificare (FIX 2), Sectiune Sursa, Confidenta
- Filtre: categorie, prioritate, verification_type, needs_review
- Edit inline: userul poate modifica/sterge cerinte gresite
- Badge "Necesita Review" pt cerinte cu confidenta scazuta
- **BUTON MARE: "Valideaza cerintele si continua la evaluare"** (FIX 17)
  - Disabled pana cand userul a scrollat prin lista (sau explicit confirmat)
  - Seteaza project.status = "requirements_validated"

### Pagina 5: Rezultate Evaluare (/projects/[id]/evaluation) — PAGINA PRINCIPALA

**Inainte de prima evaluare:**
- FIX 15: Estimare cost + durata
- FIX 30: Checkboxes exclude categorii
- FIX 38: Toggle "Evaluare rapida" vs "Evaluare completa"
- FIX 36: Daca exista run anterior: buton "Re-evalueaza doar esuate ($0.60)"
- Buton "Confirma si lanseaza"

**Dupa evaluare — FIX 35: View cu TABS:**
```
[🔴 Probleme (15)] [🟡 De verificat (23)] [✅ Conform (162)]
```

- **FIX 33:** Banner trasabilitate: "Evaluat 158/320 cerinte. Excluse: 42 calitate, 28 admin..."
- **FIX 19:** Banner warnings daca analytics detecteaza probleme
- **Rezultate apar LIVE** pe masura ce sunt evaluate (polling 3s cand run activ)

**Tab Probleme (default activ):**
- NECONFORM primele, apoi INSUFFICIENT_DATA
- Fiecare card: cerinta CS, ce s-a gasit in PT, sectiune CS, sectiune PT
- Click "Detalii" → citate exacte, rationament pas cu pas, confidence
- Buton "Override verdict" pt review uman
- Link direct la sectiune PT (pt a sti unde sa fixeze)
- Daca erori (FIX 10): badge "Eroare" + buton "Retry individual"

**Tab De verificat:**
- PARTIAL + items cu needs_human_review
- Ordonate descrescator pe confidence

**Tab Conform:**
- Collapsed by default
- Expandabil pt audit

### Pagina 6: Raport (/projects/[id]/report)
- **FIX 37:** Raport structurat actionable (nu doar lista verdicts)
- Sumar executiv: statistici, rata conformitate, cost evaluare, cerinte excluse
- Health warnings (FIX 19,27,28)
- NECONFORMITATI cu: cerinta CS, ce s-a gasit in PT, pagina, recomandare de fixare
- CONFORMITATE PARTIALA cu: ce e acoperit, ce lipseste
- INSUFICIENT DATE cu: posibil omisiuni din PT
- Nota disclaimer: "Generat automat. Validate de personal calificat."
- **Export Word** (python-docx) + **Export PDF** — format profesional pt sedinte/audit

---

## 15. ORDINEA DE IMPLEMENTARE (PASI)

### Faza 1: Fundatie (se implementeaza PRIMA)
1. Docker Compose + PostgreSQL + Redis
2. Backend: FastAPI skeleton, config, database connection, models, migrations
3. API: health endpoint
4. Test: `make dev` porneste totul

### Faza 2: Upload si Parsare Word (DOCX-ONLY)
5. File storage service
6. Document upload (.docx only) + delete API (FIX 18: cascade delete)
7. Word parser service (python-docx → Markdown cu headings reale + tabele structurate)
8. Text normalizer (FIX 23: diacritice romanesti ş→ș, ţ→ț)
9. Doc type detector (FIX 34: verifica daca CS/PT sunt in slot-urile corecte)
10. Celery task: process_document cu retry + error handling (FIX 10)
11. Test: upload .docx CS → vezi markdown cu heading-uri si tabele corecte in DB

### Faza 3: Chunking + Embedding
12. Chunking service (heading-based structure din Word styles, paragraph tracking)
13. Embedding service multi-provider (local sentence-transformers / OpenAI — FIX 21)
14. Celery task: process_document complet (parse → normalize → chunk → embed)
15. Test: upload CS .docx → chunk-uri cu hierarchy_path, paragraph indices, embedding in DB

### Faza 4: Extraction
18. LLM client unificat cu Pydantic structured output (FIX 11)
19. Prompts centralizate (cu verification_type — FIX 2)
20. Extraction service cu deduplicare section-aware (FIX 3) si cross-references (FIX 6)
21. Celery task: extract_requirements
22. API: requirements endpoints + validate endpoint (FIX 17)
23. Test: extrage cerinte → vezi deduplicate, cu verification_type, standarde, cross-refs

### Faza 5: Evaluare (CRITICA)
24. Retrieval service: hybrid search cu document_ids plural (FIX 16) + terminology expansion (FIX 4)
25. Reranking BATCH (FIX 1) cu diversity filter (FIX 7)
26. Evaluation service cu parallel execution (FIX 12)
27. Quote verification cu rapidfuzz (FIX 14)
28. Cost estimation endpoint (FIX 15)
29. Concurrent run prevention (FIX 13)
30. Celery task: run_evaluation cu skip-on-failure (FIX 10)
31. API: evaluation endpoints + analytics (FIX 19)
32. Test: evaluare completa → verdicts cu citate verificate, paralela, cost tracked

### Faza 6: Frontend MVP
33. Next.js skeleton + layout
34. Dashboard + project list
35. Create project + upload (multiple PT files — FIX 16)
36. Document status page (cu retry pe erori — FIX 10, delete cu warning — FIX 18)
37. Requirements page cu checkpoint obligatoriu (FIX 17)
38. Evaluation results page cu live updates, cost estimate (FIX 15), health warnings (FIX 19)
39. Report page cu cost total

### Faza 7: Polish
40. Human review UI (override verdicts)
41. Export raport Word/PDF
42. Retry individual pt cerinte esuate
43. Analytics dashboard simplificat

---

## 16. VERIFICARE END-TO-END

### Test Manual Complet:
1. `docker compose up -d` → totul porneste fara erori
2. Upload un .docx caiet de sarcini (convertit din PDF cu Adobe Acrobat)
3. Upload un .docx propunere tehnica (+ eventual un al doilea .docx PT — FIX 16)
4. Verifica: documentele apar in UI cu status "processing" → "ready" in cateva secunde
5. Verifica: daca un document esueaza → status "error" cu mesaj clar + buton Retry (FIX 10)
6. Verifica: in DB, document_chunks au hierarchy_path (din Word headings) si paragraph indices
7. Verifica: in DB, markdown-ul are headings Markdown corecte (# ## ###) din Word styles
8. Click "Extrage Cerinte"
10. Verifica: cerinte cu verification_type (match_value/match_reference/etc.) (FIX 2)
11. Verifica: NU sunt duplicate evidente (FIX 3)
12. **OBLIGATORIU:** Click "Valideaza cerintele" inainte de a putea evalua (FIX 17)
13. Pe pagina evaluare: vezi estimare cost/durata (FIX 15). Confirma.
14. Verifica: evaluari apar LIVE pe masura ce se proceseaza (FIX 12: paralel)
15. Verifica: citatele din PT sunt text REAL din document (verificate cu rapidfuzz — FIX 14)
16. Verifica: NECONFORM-urile au missing_aspects clar definite
17. Verifica: evaluarile cu confidenta scazuta sunt flagged pt review
18. Verifica: analytics endpoint returneaza health warnings daca e cazul (FIX 19)
19. Verifica: cost total e tracked in evaluation_runs (FIX 15)
20. Verifica: dublu-click pe "Ruleaza Evaluare" → eroare 409 (FIX 13)

### Metrici Anti-Halucinare de Monitorizat:
- % evaluari cu TOATE citatele verificate (target: >90%)
- % evaluari cu INSUFFICIENT_DATA (sub 15% = retrieval bun)
- % evaluari flagged pt human review (sub 20% = sistem matur)
- Timpul mediu per evaluare (target: <30s per cerinta cu parallel, <5min pt 200 cerinte)
- Cost mediu per evaluare run (target: <$20 pt 200 cerinte)
- Rata erori Celery tasks (target: <2% dupa retries)
