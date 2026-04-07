import uuid
from decimal import Decimal

from sqlalchemy import Integer, Text, Numeric, ForeignKey, CheckConstraint, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.base import _sql_in_check

import datetime

RUN_STATUSES = ["pending", "running", "completed", "failed"]


class EvaluationRun(BaseModel):
    __tablename__ = "evaluation_runs"
    __table_args__ = (
        CheckConstraint(_sql_in_check("status", RUN_STATUSES), name="ck_run_status"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")

    total_requirements: Mapped[int] = mapped_column(Integer, default=0)
    evaluated_count: Mapped[int] = mapped_column(Integer, default=0)
    conform_count: Mapped[int] = mapped_column(Integer, default=0)
    neconform_count: Mapped[int] = mapped_column(Integer, default=0)
    partial_count: Mapped[int] = mapped_column(Integer, default=0)
    insufficient_count: Mapped[int] = mapped_column(Integer, default=0)
    needs_review_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)

    # Cost tracking
    total_input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=0)

    # Run configuration (for traceability)
    run_config: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Incremental re-evaluation
    previous_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evaluation_runs.id")
    )

    celery_task_id: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)

    project = relationship("Project", back_populates="evaluation_runs")
    evaluations = relationship("RequirementEvaluation", back_populates="run", cascade="all, delete-orphan")
