"""Evaluation service — evaluate a single requirement against PT chunks.

Orchestrates: retrieval → reranking → LLM evaluation → quote verification → OCR error detection.
Called by the run_evaluation Celery task for each requirement.
"""

import re
import uuid

from app.config import settings
from app.core.llm import call_llm_structured
from app.core.prompts import build_evaluation_prompt, CURRENT_EVALUATION_VERSION
from app.core.logging import get_logger
from app.models.requirement import ExtractedRequirement
from app.schemas.llm_responses import EvaluationResult
from app.services.retrieval_service import RetrievedChunk, search_and_rerank
from app.services.quote_verification_service import verify_quotes

logger = get_logger(__name__)


def evaluate_requirement(
    db,
    requirement: ExtractedRequirement,
    pt_document_ids: list[uuid.UUID],
) -> tuple[EvaluationResult, list[RetrievedChunk], bool]:
    """Evaluate a single requirement against PT documents.

    Returns:
        Tuple of (evaluation_result, retrieved_chunks, all_quotes_verified).
    """
    # Step 1: Retrieval
    chunks = search_and_rerank(
        db=db,
        requirement_text=requirement.requirement_text,
        document_ids=pt_document_ids,
        top_k_retrieval=20,
        top_k_rerank=5,
    )

    if not chunks:
        # No chunks found at all
        return EvaluationResult(
            verdict="INSUFFICIENT_DATA",
            confidence_score=0.1,
            exact_quotes_from_pt=[],
            step_by_step_reasoning="No relevant fragments found in PT documents.",
            covered_aspects=[],
            missing_aspects=["Entire requirement not addressed in PT"],
        ), [], True

    # Step 2: LLM Evaluation
    chunks_dicts = [
        {
            "hierarchy_path": c.hierarchy_path,
            "start_paragraph": c.start_paragraph,
            "end_paragraph": c.end_paragraph,
            "content_raw": c.content_raw,
        }
        for c in chunks
    ]

    prompt = build_evaluation_prompt(
        requirement_text=requirement.requirement_text,
        requirement_original=requirement.original_text,
        requirement_hierarchy=requirement.hierarchy_path or "",
        requirement_standards=requirement.referenced_standards,
        verification_type=requirement.verification_type,
        chunks=chunks_dicts,
    )

    result = call_llm_structured(prompt, EvaluationResult)

    # Step 3: Quote verification (anti-hallucination layer 5)
    result, all_verified = verify_quotes(result, chunks)

    # Step 4: OCR/conversion error detection (FIX 27)
    if result.verdict == "NECONFORM":
        _check_conversion_errors(requirement, result)

    return result, chunks, all_verified


def evaluate_with_verification_pass(
    db,
    requirement: ExtractedRequirement,
    pt_document_ids: list[uuid.UUID],
    first_result: EvaluationResult,
    first_chunks: list[RetrievedChunk],
) -> tuple[EvaluationResult, list[RetrievedChunk], bool]:
    """Second retrieval pass for NECONFORM/INSUFFICIENT_DATA results.

    Uses different search queries to avoid false negatives (FIX: Verification Pass).
    """
    # Generate alternative query from a different angle
    # Use standards + keywords instead of literal text (avoids same retrieval results)
    alt_parts = []
    if requirement.referenced_standards:
        alt_parts.extend(requirement.referenced_standards)
    # Extract key nouns from requirement (simple heuristic)
    words = [w for w in requirement.requirement_text.split() if len(w) > 4]
    alt_parts.extend(words[:5])
    alt_query = " ".join(alt_parts) if alt_parts else requirement.requirement_text

    alt_chunks = search_and_rerank(
        db=db,
        requirement_text=alt_query,
        document_ids=pt_document_ids,
        top_k_retrieval=20,
        top_k_rerank=5,
    )

    # Merge unique chunks from both passes
    seen_ids = {c.id for c in first_chunks}
    combined = list(first_chunks)
    for c in alt_chunks:
        if c.id not in seen_ids:
            combined.append(c)
            seen_ids.add(c.id)

    # Re-evaluate with combined chunks (up to 8)
    combined = combined[:8]

    chunks_dicts = [
        {
            "hierarchy_path": c.hierarchy_path,
            "start_paragraph": c.start_paragraph,
            "end_paragraph": c.end_paragraph,
            "content_raw": c.content_raw,
        }
        for c in combined
    ]

    prompt = build_evaluation_prompt(
        requirement_text=requirement.requirement_text,
        requirement_original=requirement.original_text,
        requirement_hierarchy=requirement.hierarchy_path or "",
        requirement_standards=requirement.referenced_standards,
        verification_type=requirement.verification_type,
        chunks=chunks_dicts,
    )

    result2 = call_llm_structured(prompt, EvaluationResult)
    result2, all_verified = verify_quotes(result2, combined)

    # If two passes disagree → flag for human review
    if result2.verdict != first_result.verdict:
        result2.confidence_score = min(result2.confidence_score, 0.5)

    if result2.verdict == "NECONFORM":
        _check_conversion_errors(requirement, result2)

    return result2, combined, all_verified


# --- OCR/Conversion Error Detection (FIX 27) ---

def _check_conversion_errors(
    requirement: ExtractedRequirement,
    result: EvaluationResult,
) -> None:
    """Detect possible OCR/conversion errors in numeric values."""
    cs_values = _extract_numeric_values(requirement.original_text)
    pt_values = set()
    for quote in result.exact_quotes_from_pt:
        pt_values.update(_extract_numeric_values(quote.quote))

    for cs_val in cs_values:
        for pt_val in pt_values:
            if _is_single_char_diff(cs_val, pt_val):
                result.step_by_step_reasoning += (
                    f"\n⚠ POSIBILA EROARE DE CONVERSIE: CS='{cs_val}' vs PT='{pt_val}' "
                    "(differ cu 1 caracter — posibil eroare din conversia PDF→Word)"
                )
                result.confidence_score = min(result.confidence_score, 0.5)
                return


def _extract_numeric_values(text: str) -> list[str]:
    """Extract numeric values like C25/30, 20cm, Ø16, SR EN 206."""
    patterns = [
        r"[A-Z]\d+/\d+",  # C25/30, B350
        r"\d+(?:\.\d+)?\s*(?:mm|cm|m|kg|kN|MPa|kPa)",  # 20cm, 3.5m
        r"Ø\d+",  # Ø16
        r"SDR\d+",  # SDR17
    ]
    values = []
    for pattern in patterns:
        values.extend(re.findall(pattern, text))
    return values


# Character pairs commonly confused in OCR/PDF→Word conversion
OCR_CONFUSIONS = {
    ("0", "O"), ("O", "0"), ("0", "o"), ("o", "0"),
    ("1", "l"), ("l", "1"), ("1", "I"), ("I", "1"),
    ("5", "S"), ("S", "5"), ("8", "B"), ("B", "8"),
}


def _is_single_char_diff(a: str, b: str) -> bool:
    """Check if two strings differ by exactly one OCR-confusable character."""
    if len(a) != len(b):
        return False
    diffs = [(ca, cb) for ca, cb in zip(a, b) if ca != cb]
    if len(diffs) != 1:
        return False
    # Only flag if the differing character pair is a known OCR confusion
    return diffs[0] in OCR_CONFUSIONS
