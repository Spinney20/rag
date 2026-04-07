"""Quote verification service — verify LLM-cited quotes exist in source chunks.

Anti-hallucination layer 5: After LLM produces an evaluation with "exact quotes",
we programmatically verify that each quote actually exists in the retrieved chunks.

Uses rapidfuzz (C++ implementation, 100x faster than difflib) for fuzzy matching.
Threshold: 80% (lower than 85% to tolerate minor conversion errors from PDF→Word).
"""

from rapidfuzz import fuzz

from app.core.logging import get_logger
from app.services.text_normalizer import strip_diacritics
from app.schemas.llm_responses import EvaluationResult
from app.services.retrieval_service import RetrievedChunk

logger = get_logger(__name__)

QUOTE_MATCH_THRESHOLD = 80  # 0-100 scale (rapidfuzz returns 0-100)
MIN_QUOTE_LENGTH = 20  # Quotes shorter than this are too vague to verify reliably


def verify_quotes(
    result: EvaluationResult,
    chunks: list[RetrievedChunk],
) -> tuple[EvaluationResult, bool]:
    """Verify that all LLM-cited quotes actually exist in the source chunks.

    Args:
        result: The LLM evaluation result with exact_quotes_from_pt.
        chunks: The retrieved chunks that were given to the LLM.

    Returns:
        Tuple of (modified result, all_verified boolean).
    """
    if not result.exact_quotes_from_pt:
        # No quotes to verify — if verdict is CONFORM, this is suspicious
        return result, result.verdict == "INSUFFICIENT_DATA"

    all_verified = True

    for quote_evidence in result.exact_quotes_from_pt:
        quote_text = quote_evidence.quote

        # Short quotes are unreliable for fuzzy matching — skip verification
        if len(quote_text.strip()) < MIN_QUOTE_LENGTH:
            quote_evidence.relevance += " [too_short_to_verify]"
            continue

        best_similarity = 0.0
        best_chunk_idx = -1

        for idx, chunk in enumerate(chunks):
            sim = _fuzzy_match(quote_text, chunk.content_raw)
            if sim > best_similarity:
                best_similarity = sim
                best_chunk_idx = idx

            if sim >= QUOTE_MATCH_THRESHOLD:
                break  # Good enough

        verified = best_similarity >= QUOTE_MATCH_THRESHOLD

        # Store verification metadata (will be serialized to JSONB)
        quote_evidence.relevance = (
            f"{quote_evidence.relevance} "
            f"[verified={verified}, similarity={best_similarity:.0f}%"
            f"{f', chunk={best_chunk_idx+1}' if best_chunk_idx >= 0 else ''}]"
        )

        if not verified:
            all_verified = False

    # If any quote failed verification → flag for human review
    if not all_verified:
        result.confidence_score = min(result.confidence_score, 0.4)
        logger.warning(
            "Quote verification failed: %d/%d quotes unverified",
            sum(1 for q in result.exact_quotes_from_pt if "[verified=False" in q.relevance),
            len(result.exact_quotes_from_pt),
        )

    return result, all_verified


def _fuzzy_match(quote: str, chunk_text: str) -> float:
    """Fuzzy match a quote against chunk text using rapidfuzz.

    Uses partial_ratio which finds the best matching substring.
    Normalizes both texts (strip diacritics, lowercase) for tolerance.

    Returns: similarity score 0-100.
    """
    # Normalize for matching (strip diacritics to handle ş/ș differences)
    quote_norm = strip_diacritics(quote)
    chunk_norm = strip_diacritics(chunk_text)

    if not quote_norm or not chunk_norm:
        return 0.0

    return fuzz.partial_ratio(quote_norm, chunk_norm)
