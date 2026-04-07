"""Retrieval service — hybrid search + multi-query + batch reranking.

Implements the 3-layer retrieval from PLAN.md Section 6:
1. Hybrid search: pgvector cosine + PostgreSQL FTS, merged via RRF
2. Multi-query: original + LLM rewrite + keyword extraction
3. Batch reranking with diversity filter (max 2 chunks per section)

All searches use document_ids plural (FIX 16) for multi-file PT support.
"""

import re
import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.core.llm import call_llm_structured, call_llm_raw
from app.core.prompts import build_query_rewrite_prompt, EQUIVALENCES
from app.core.logging import get_logger
from app.schemas.llm_responses import QueryRewriteResponse, RerankResponse
from app.services import embedding_service

logger = get_logger(__name__)

RRF_K = 60  # Standard RRF constant


@dataclass
class RetrievedChunk:
    id: uuid.UUID
    content_raw: str
    content_with_context: str
    hierarchy_path: str
    section_id: str | None
    chunk_type: str
    start_paragraph: int
    end_paragraph: int
    rrf_score: float = 0.0
    rerank_score: float = 0.0


# --- Main entry point ---

def search_and_rerank(
    db: Session,
    requirement_text: str,
    document_ids: list[uuid.UUID],
    top_k_retrieval: int = 20,
    top_k_rerank: int = 5,
) -> list[RetrievedChunk]:
    """Full retrieval pipeline: multi-query → hybrid search → rerank → diversity filter.

    Args:
        db: Database session.
        requirement_text: The requirement text to search for.
        document_ids: List of PT document IDs to search in.
        top_k_retrieval: How many chunks to retrieve before reranking.
        top_k_rerank: Final number of chunks after reranking + diversity.

    Returns:
        List of RetrievedChunk objects, ranked by relevance.
    """
    if not document_ids:
        return []

    # Step 1: Multi-query generation
    queries = _generate_multi_queries(requirement_text)

    # Step 2: Hybrid search for each query, merge via RRF
    all_chunks: dict[uuid.UUID, RetrievedChunk] = {}
    all_scores: dict[uuid.UUID, float] = {}

    for query in queries:
        results = _hybrid_search(db, query, document_ids, top_k_retrieval)
        # RRF merge across queries
        for i, chunk in enumerate(results):
            score = 1.0 / (RRF_K + i + 1)
            all_scores[chunk.id] = all_scores.get(chunk.id, 0) + score
            if chunk.id not in all_chunks:
                all_chunks[chunk.id] = chunk

    # Sort by combined RRF score
    sorted_ids = sorted(all_scores, key=all_scores.get, reverse=True)[:top_k_retrieval]
    candidates = []
    for cid in sorted_ids:
        chunk = all_chunks[cid]
        chunk.rrf_score = all_scores[cid]
        candidates.append(chunk)

    if not candidates:
        return []

    # Step 3: Batch reranking
    reranked = _batch_rerank(requirement_text, candidates, top_k_rerank)

    # Step 4: Diversity filter (max 2 per section)
    final = _diversity_filter(reranked, top_k_rerank)

    logger.info(
        "Retrieval: queries=%d, candidates=%d, reranked=%d, final=%d",
        len(queries), len(candidates), len(reranked), len(final),
    )
    return final


# --- Step 1: Multi-Query Generation ---

def _generate_multi_queries(requirement_text: str) -> list[str]:
    """Generate 3 search queries from different angles."""
    queries = [requirement_text]  # Query 1: original text

    # Query 2: LLM-rewritten queries
    try:
        prompt = build_query_rewrite_prompt(requirement_text)
        response = call_llm_structured(
            prompt, QueryRewriteResponse,
            model_name=settings.LLM_MODEL_CHEAP,
        )
        queries.extend(response.queries[:3])
    except Exception as e:
        logger.warning("Query rewriting failed, using original only: %s", e)

    # Query 3: Keyword extraction (standards, numbers, technical terms)
    keywords = _extract_keywords(requirement_text)
    if keywords:
        queries.append(keywords)

    # Expand with STAS↔SR EN equivalences (FIX 4)
    expanded = []
    for q in queries:
        expanded.append(q)
        equiv_q = _expand_equivalences(q)
        if equiv_q != q:
            expanded.append(equiv_q)

    return expanded[:6]  # Cap at 6 queries max


def _extract_keywords(text: str) -> str:
    """Extract technical keywords (standards, numbers, measurements)."""
    patterns = [
        r"[A-Z]{1,3}\s*\d+[/\-:]\d+",  # C25/30, SR EN 206
        r"\d+(?:\.\d+)?\s*(?:mm|cm|m|kg|t|kN|MPa|kPa|°C|%)",  # measurements
        r"(?:SR\s*EN|STAS|NP|ISO)\s*[\d:–\-/]+",  # standards
        r"Ø\d+",  # diameters
    ]
    keywords = set()
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            keywords.add(match.group())

    # Also add significant words (nouns, typically >4 chars, not common words)
    common = {"care", "este", "pentru", "conform", "trebuie", "minim", "maxim", "prin", "dupa", "inainte"}
    words = set(w for w in re.findall(r"\b[a-zA-ZăîșțâĂÎȘȚÂ]{4,}\b", text.lower()) if w not in common)
    keywords.update(list(words)[:5])

    return " ".join(sorted(keywords))


def _expand_equivalences(query: str) -> str:
    """Expand query with STAS↔SR EN equivalences (FIX 4)."""
    expanded = query
    for old, news in EQUIVALENCES.items():
        if old.lower() in query.lower():
            expanded += " " + " ".join(news)
        for new in news:
            if new.lower() in query.lower():
                expanded += " " + old
                break
    return expanded


# --- Step 2: Hybrid Search ---

def _hybrid_search(
    db: Session,
    query: str,
    document_ids: list[uuid.UUID],
    top_k: int,
) -> list[RetrievedChunk]:
    """Combine vector search + full-text search via RRF."""
    # Get query embedding
    query_embedding = embedding_service.embed_batch([query])[0]
    doc_ids_str = [str(d) for d in document_ids]

    # Format embedding as pgvector-compatible string: [0.1,0.2,0.3]
    embedding_str = "[" + ",".join(str(f) for f in query_embedding) + "]"

    # Vector search (semantic)
    vector_sql = text("""
        SELECT id, content_raw, content_with_context, hierarchy_path,
               section_id, chunk_type, start_paragraph, end_paragraph,
               1 - (embedding <=> :embedding::vector) as cosine_sim
        FROM document_chunks
        WHERE document_id = ANY(:doc_ids::uuid[])
          AND embedding IS NOT NULL
        ORDER BY embedding <=> :embedding::vector
        LIMIT :limit
    """)
    vector_results = db.execute(vector_sql, {
        "embedding": embedding_str,
        "doc_ids": doc_ids_str,
        "limit": top_k * 2,
    }).fetchall()

    # Full-text search (keyword/BM25-like)
    fts_sql = text("""
        SELECT id, content_raw, content_with_context, hierarchy_path,
               section_id, chunk_type, start_paragraph, end_paragraph,
               ts_rank(to_tsvector('simple', content_with_context),
                       plainto_tsquery('simple', :query)) as fts_score
        FROM document_chunks
        WHERE document_id = ANY(:doc_ids::uuid[])
          AND to_tsvector('simple', content_with_context) @@ plainto_tsquery('simple', :query)
        ORDER BY fts_score DESC
        LIMIT :limit
    """)
    fts_results = db.execute(fts_sql, {
        "query": query,
        "doc_ids": doc_ids_str,
        "limit": top_k * 2,
    }).fetchall()

    # RRF merge
    scores: dict[uuid.UUID, float] = {}
    chunks: dict[uuid.UUID, RetrievedChunk] = {}

    for i, row in enumerate(vector_results):
        rid = row.id
        scores[rid] = scores.get(rid, 0) + 1.0 / (RRF_K + i + 1)
        if rid not in chunks:
            chunks[rid] = RetrievedChunk(
                id=rid, content_raw=row.content_raw,
                content_with_context=row.content_with_context,
                hierarchy_path=row.hierarchy_path, section_id=row.section_id,
                chunk_type=row.chunk_type, start_paragraph=row.start_paragraph,
                end_paragraph=row.end_paragraph,
            )

    for i, row in enumerate(fts_results):
        rid = row.id
        scores[rid] = scores.get(rid, 0) + 1.0 / (RRF_K + i + 1)
        if rid not in chunks:
            chunks[rid] = RetrievedChunk(
                id=rid, content_raw=row.content_raw,
                content_with_context=row.content_with_context,
                hierarchy_path=row.hierarchy_path, section_id=row.section_id,
                chunk_type=row.chunk_type, start_paragraph=row.start_paragraph,
                end_paragraph=row.end_paragraph,
            )

    # Sort by RRF score
    sorted_ids = sorted(scores, key=scores.get, reverse=True)[:top_k]
    return [chunks[cid] for cid in sorted_ids if cid in chunks]


# --- Step 3: Batch Reranking ---


def _batch_rerank(
    requirement_text: str,
    candidates: list[RetrievedChunk],
    top_k: int,
) -> list[RetrievedChunk]:
    """Rerank candidates using a single batch LLM call (FIX 1)."""
    if len(candidates) <= top_k:
        return candidates

    # Build chunks text for reranking
    chunks_text = ""
    for i, chunk in enumerate(candidates):
        chunks_text += f"[FRAGMENT {i + 1}] (Sectiune: {chunk.hierarchy_path})\n"
        # Tables: full text. Text: max 1000 chars (FIX from review)
        if chunk.chunk_type == "table":
            chunks_text += chunk.content_raw
        else:
            chunks_text += chunk.content_raw[:1000]
        chunks_text += "\n\n"

    prompt = f"""Evalueaza relevanta fiecarui fragment pentru cerinta data.

CERINTA: {requirement_text}

FRAGMENTE:
{chunks_text}

Raspunde cu un obiect JSON cu un camp "scores" care contine o lista de numere intregi 0-10.
Scor 0 = complet irelevant, 10 = contine exact informatia cautata.
Lista trebuie sa aiba exact {len(candidates)} elemente."""

    try:
        response = call_llm_structured(
            prompt, RerankResponse,
            model_name=settings.LLM_MODEL_CHEAP,
        )
        scores = response.scores

        if len(scores) != len(candidates):
            logger.warning("Rerank scores count mismatch: %d vs %d", len(scores), len(candidates))
            return candidates[:top_k]

        # Attach scores and sort
        for chunk, score in zip(candidates, scores):
            chunk.rerank_score = score

        candidates.sort(key=lambda c: c.rerank_score, reverse=True)

    except Exception as e:
        logger.warning("Batch reranking failed, using RRF order: %s", e)

    return candidates[:top_k * 2]  # Return more than top_k for diversity filter


# --- Step 4: Diversity Filter ---

def _diversity_filter(chunks: list[RetrievedChunk], top_k: int) -> list[RetrievedChunk]:
    """Max 2 chunks per section (FIX 7)."""
    result = []
    section_counts: dict[str, int] = {}

    for chunk in chunks:
        section = chunk.section_id or "unknown"
        count = section_counts.get(section, 0)
        if count < 2:
            result.append(chunk)
            section_counts[section] = count + 1
        if len(result) >= top_k:
            break

    return result
