import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class EvaluationRunConfig(BaseModel):
    """Configuration for an evaluation run (FIX 30, 36, 38)."""
    mode: Literal["thorough", "quick"] = "thorough"
    exclude_categories: list[str] = []
    exclude_verification_types: list[str] = ["unverifiable"]
    only_priorities: list[str] = ["obligatoriu", "recomandat"]
    previous_run_id: str | None = None  # For incremental re-evaluation (FIX 36)
    # NOTE: concurrency removed — evaluation is sequential (post-MVP for parallel)


class EvaluationRunResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    status: str
    total_requirements: int
    evaluated_count: int
    conform_count: int
    neconform_count: int
    partial_count: int
    insufficient_count: int
    needs_review_count: int
    error_count: int
    estimated_cost_usd: Decimal
    run_config: dict
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EvalResultResponse(BaseModel):
    id: uuid.UUID
    requirement_id: uuid.UUID
    verdict: str
    confidence_score: float
    reasoning: str
    proposal_quotes: list
    covered_aspects: list
    missing_aspects: list
    all_quotes_verified: bool
    needs_human_review: bool
    human_verdict: str | None
    human_note: str | None
    llm_model: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EvalResultListResponse(BaseModel):
    results: list[EvalResultResponse]
    total: int


class HumanReviewUpdate(BaseModel):
    human_verdict: Literal["CONFORM", "NECONFORM", "PARTIAL", "INSUFFICIENT_DATA"]
    human_note: str = ""
    reviewer_id: str | None = None  # UUID string — TODO: populate from auth when implemented


class CostEstimateResponse(BaseModel):
    total_requirements: int
    filtered_requirements: int
    estimated_llm_calls: int
    estimated_cost_usd: float
    estimated_duration_minutes: float


class AnalyticsResponse(BaseModel):
    verdict_distribution: dict[str, int]
    avg_confidence: float
    quote_verification_rate: float
    needs_review_count: int
    error_count: int
    total_evaluated: int
    health_warnings: list[str]
