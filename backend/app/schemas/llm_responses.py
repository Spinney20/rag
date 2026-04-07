"""Pydantic models for LLM structured outputs (FIX 11).

These models enforce schema validation on LLM responses, preventing:
- Missing fields
- Wrong types
- Invalid enum values
- Out-of-range confidence scores
"""

from pydantic import BaseModel, Field
from typing import Literal


# --- Extraction Response Models ---

class ExtractedReq(BaseModel):
    """A single atomic requirement extracted from a CS/FDA chunk."""
    requirement_text: str = Field(description="Cerinta reformulata clar, verificabila")
    original_text: str = Field(description="Text EXACT din fragment CS")
    category: Literal[
        "tehnic", "administrativ", "calitate", "termene",
        "personal", "echipamente", "materiale"
    ]
    priority: Literal["obligatoriu", "recomandat", "optional", "informativ"]
    verification_type: Literal["match_value", "match_reference", "match_description", "unverifiable"]
    referenced_standards: list[str] = []
    cross_references: list[str] = []
    is_compound: bool = False
    confidence: float = Field(ge=0.0, le=1.0)


class ExtractionResponse(BaseModel):
    """LLM response for requirement extraction from a single chunk."""
    requirements: list[ExtractedReq]


# --- Evaluation Response Models ---

class QuoteEvidence(BaseModel):
    """An exact quote from PT that supports the evaluation verdict."""
    quote: str = Field(description="Text EXACT copiat din fragment PT, nu parafrazat")
    fragment_number: int = Field(description="Numarul fragmentului PT (1,2,3...)")
    relevance: str = Field(description="De ce acest citat e relevant pt cerinta")


class EvaluationResult(BaseModel):
    """LLM response for evaluating a single requirement against PT chunks."""
    verdict: Literal["CONFORM", "NECONFORM", "PARTIAL", "INSUFFICIENT_DATA"]
    confidence_score: float = Field(ge=0.0, le=1.0)
    exact_quotes_from_pt: list[QuoteEvidence]
    step_by_step_reasoning: str
    covered_aspects: list[str]
    missing_aspects: list[str]
    technical_comparison: str = ""


# --- Query Rewriting Response ---

class QueryRewriteResponse(BaseModel):
    """LLM response for multi-query generation."""
    queries: list[str]
