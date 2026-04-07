import uuid

import sqlalchemy as sa
from sqlalchemy import Text, Integer, Float, Boolean, ForeignKey, CheckConstraint, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.base import _sql_in_check

import datetime

VERDICTS = ["CONFORM", "NECONFORM", "PARTIAL", "INSUFFICIENT_DATA"]


class RequirementEvaluation(BaseModel):
    __tablename__ = "requirement_evaluations"
    __table_args__ = (
        CheckConstraint(_sql_in_check("verdict", VERDICTS), name="ck_eval_verdict"),
        sa.UniqueConstraint("run_id", "requirement_id", name="uq_eval_run_requirement"),
    )

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evaluation_runs.id", ondelete="CASCADE"), nullable=False
    )
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("extracted_requirements.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )

    # Verdict
    verdict: Mapped[str] = mapped_column(Text, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)

    # Anti-hallucination: structured reasoning
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)

    # Anti-hallucination: exact quotes from PT
    proposal_quotes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Covered vs missing aspects
    covered_aspects: Mapped[list] = mapped_column(JSONB, default=list)
    missing_aspects: Mapped[list] = mapped_column(JSONB, default=list)

    # Retrieval metadata
    retrieved_chunk_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    retrieval_scores: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Quote verification
    all_quotes_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_retries: Mapped[int] = mapped_column(Integer, default=0)

    # Human review
    needs_human_review: Mapped[bool] = mapped_column(Boolean, default=False)
    human_verdict: Mapped[str | None] = mapped_column(Text)
    human_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))

    # LLM metadata
    llm_model: Mapped[str | None] = mapped_column(Text)
    llm_prompt_version: Mapped[str | None] = mapped_column(Text)
    llm_tokens_used: Mapped[int | None] = mapped_column(Integer)
    llm_latency_ms: Mapped[int | None] = mapped_column(Integer)

    run = relationship("EvaluationRun", back_populates="evaluations")
    requirement = relationship("ExtractedRequirement", back_populates="evaluations")
