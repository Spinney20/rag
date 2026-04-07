import uuid

from sqlalchemy import Text, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, _sql_in_check

PROJECT_STATUSES = [
    "created",
    "processing",
    "documents_ready",
    "requirements_extracted",
    "requirements_validated",
    "evaluated",
    "completed",
]


class Project(BaseModel):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(_sql_in_check("status", PROJECT_STATUSES), name="ck_project_status"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="created")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    requirements = relationship("ExtractedRequirement", back_populates="project", cascade="all, delete-orphan")
    evaluation_runs = relationship("EvaluationRun", back_populates="project", cascade="all, delete-orphan")
