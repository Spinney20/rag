"""Extraction service — extract atomic requirements from CS/FDA chunks.

Includes:
- LLM-based extraction per chunk (with FDA-specific prompt)
- Deduplication in 2 passes (FIX 31: original_text exact + FIX 3: embedding semantic)
- Cross-reference resolution (FIX 6: fetch referenced section chunks)
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.llm import call_llm_structured
from app.core.prompts import build_extraction_prompt, CURRENT_EXTRACTION_VERSION
from app.core.logging import get_logger
from app.models.chunk import DocumentChunk
from app.models.document import Document
from app.models.requirement import ExtractedRequirement
from app.schemas.llm_responses import ExtractionResponse
from app.services.text_normalizer import normalize_romanian_chars, normalize_whitespace
from app.services import embedding_service

logger = get_logger(__name__)

MIN_CHUNK_TOKENS = 20  # Skip chunks shorter than this


def extract_requirements_from_chunks(
    db: Session,
    project_id: uuid.UUID,
    cs_fda_documents: list[Document],
) -> list[ExtractedRequirement]:
    """Extract atomic requirements from all CS/FDA document chunks.

    Returns list of created ExtractedRequirement records (already committed to DB).
    """
    all_requirements: list[ExtractedRequirement] = []

    for doc in cs_fda_documents:
        is_fda = doc.doc_type == "fisa_de_date"
        chunks = db.execute(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == doc.id)
            .order_by(DocumentChunk.chunk_index)
        ).scalars().all()

        logger.info(
            "Extracting from doc=%s type=%s chunks=%d",
            doc.id, doc.doc_type, len(chunks),
        )

        for chunk in chunks:
            if chunk.token_count and chunk.token_count < MIN_CHUNK_TOKENS:
                continue

            try:
                reqs = _extract_from_chunk(chunk, doc, project_id, is_fda)
                for req in reqs:
                    db.add(req)
                    all_requirements.append(req)
            except Exception as e:
                logger.error("Extraction failed for chunk %s: %s", chunk.id, e)
                continue

        db.commit()

    logger.info("Extracted %d raw requirements (before dedup)", len(all_requirements))

    # Deduplication
    removed_ids = deduplicate_requirements(db, project_id, all_requirements)
    logger.info("Deduplication removed %d requirements", len(removed_ids))

    # Filter out deleted requirements from the returned list
    all_requirements = [r for r in all_requirements if r.id not in removed_ids]

    # Cross-reference resolution
    resolve_cross_references(db, project_id, cs_fda_documents)

    return all_requirements


def _extract_from_chunk(
    chunk: DocumentChunk,
    doc: Document,
    project_id: uuid.UUID,
    is_fda: bool,
) -> list[ExtractedRequirement]:
    """Extract requirements from a single chunk via LLM."""
    prompt = build_extraction_prompt(
        chunk_hierarchy=chunk.hierarchy_path,
        chunk_text=chunk.content_raw,
        is_fda=is_fda,
    )

    response = call_llm_structured(prompt, ExtractionResponse)

    requirements = []
    for req in response.requirements:
        requirements.append(ExtractedRequirement(
            project_id=project_id,
            source_chunk_id=chunk.id,
            source_document_id=doc.id,
            requirement_text=req.requirement_text,
            original_text=req.original_text,
            section_reference=chunk.hierarchy_path,
            hierarchy_path=chunk.hierarchy_path,
            category=req.category,
            priority=req.priority,
            verification_type=req.verification_type,
            is_compound=req.is_compound,
            referenced_standards=req.referenced_standards if req.referenced_standards else [],
            cross_references=req.cross_references if req.cross_references else [],
            extraction_confidence=req.confidence,
            needs_human_review=req.confidence < 0.7,
        ))

    return requirements


# --- Deduplication (FIX 31 + FIX 3) ---

def deduplicate_requirements(
    db: Session,
    project_id: uuid.UUID,
    requirements: list[ExtractedRequirement],
) -> set[uuid.UUID]:
    """Remove duplicate requirements in 2 passes.

    Pass 1 (FIX 31): Exact match on normalized original_text — catches overlap-induced duplicates.
    Pass 2 (FIX 3): Embedding similarity > 0.92 + same section — catches semantic duplicates.

    Returns set of removed requirement UUIDs.
    """
    if not requirements:
        return set()

    to_delete: set[uuid.UUID] = set()  # type: set[uuid.UUID]

    # PASS 1: Exact match on original_text
    seen_texts: dict[str, ExtractedRequirement] = {}
    for req in requirements:
        key = normalize_whitespace(normalize_romanian_chars(req.original_text)).lower()
        if key in seen_texts:
            existing = seen_texts[key]
            keeper = _pick_best(existing, req)
            loser = req if keeper.id == existing.id else existing
            to_delete.add(loser.id)
            seen_texts[key] = keeper
        else:
            seen_texts[key] = req

    # PASS 2: Embedding similarity (only on remaining)
    remaining = [r for r in requirements if r.id not in to_delete]
    if len(remaining) > 1:
        texts = [r.requirement_text for r in remaining]
        embeddings = embedding_service.embed_batch(texts)

        for i in range(len(remaining)):
            if remaining[i].id in to_delete:
                continue
            for j in range(i + 1, len(remaining)):
                if remaining[j].id in to_delete:
                    continue

                sim = _cosine_similarity(embeddings[i], embeddings[j])
                same_section = (
                    remaining[i].hierarchy_path == remaining[j].hierarchy_path
                    or remaining[i].source_chunk_id == remaining[j].source_chunk_id
                )

                if sim > 0.92 and same_section:
                    keeper = _pick_best(remaining[i], remaining[j])
                    loser = remaining[j] if keeper.id == remaining[i].id else remaining[i]
                    to_delete.add(loser.id)

    # Delete from DB
    for req in requirements:
        if req.id in to_delete:
            db.delete(req)
    db.commit()

    return to_delete


def _pick_best(a: ExtractedRequirement, b: ExtractedRequirement) -> ExtractedRequirement:
    """Pick the more specific/confident requirement."""
    def score(r: ExtractedRequirement) -> tuple:
        return (
            len(r.referenced_standards or []),
            len(r.requirement_text),
            r.extraction_confidence or 0,
        )
    return a if score(a) >= score(b) else b


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = sum(a * a for a in vec_a) ** 0.5
    norm_b = sum(b * b for b in vec_b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# --- Cross-reference resolution (FIX 6) ---

def resolve_cross_references(
    db: Session,
    project_id: uuid.UUID,
    cs_fda_documents: list[Document],
) -> None:
    """For requirements with cross_references, fetch the referenced section text."""
    doc_ids = [d.id for d in cs_fda_documents]

    from sqlalchemy import func as sa_func
    reqs_with_refs = db.execute(
        select(ExtractedRequirement).where(
            ExtractedRequirement.project_id == project_id,
            ExtractedRequirement.cross_references != None,  # noqa: E711
            sa_func.array_length(ExtractedRequirement.cross_references, 1) > 0,
        )
    ).scalars().all()

    for req in reqs_with_refs:
        if not req.cross_references:
            continue

        context_parts = []
        for ref in req.cross_references:
            # Search for chunks with matching section_id across all CS/FDA docs
            ref_chunks = db.execute(
                select(DocumentChunk).where(
                    DocumentChunk.document_id.in_(doc_ids),
                    DocumentChunk.section_id == ref,
                )
            ).scalars().all()

            for rc in ref_chunks:
                context_parts.append(rc.content_raw)

        if context_parts:
            req.cross_reference_context = "\n---\n".join(context_parts)

    db.commit()
    logger.info("Resolved cross-references for %d requirements", len(reqs_with_refs))
