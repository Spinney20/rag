import uuid

from sqlalchemy import Text, Float, Boolean, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.base import _sql_in_check

CATEGORIES = ["tehnic", "administrativ", "calitate", "termene", "personal", "echipamente", "materiale"]
PRIORITIES = ["obligatoriu", "recomandat", "optional", "informativ"]
VERIFICATION_TYPES = ["match_value", "match_reference", "match_description", "unverifiable"]


class ExtractedRequirement(BaseModel):
    __tablename__ = "extracted_requirements"
    __table_args__ = (
        CheckConstraint(_sql_in_check("category", CATEGORIES), name="ck_req_category"),
        CheckConstraint(_sql_in_check("priority", PRIORITIES), name="ck_req_priority"),
        CheckConstraint(_sql_in_check("verification_type", VERIFICATION_TYPES), name="ck_req_verification_type"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    source_chunk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document_chunks.id", ondelete="CASCADE"), nullable=False
    )
    source_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )

    requirement_text: Mapped[str] = mapped_column(Text, nullable=False)
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    section_reference: Mapped[str | None] = mapped_column(Text)
    hierarchy_path: Mapped[str | None] = mapped_column(Text)

    category: Mapped[str] = mapped_column(Text, nullable=False, default="tehnic")
    priority: Mapped[str] = mapped_column(Text, nullable=False, default="obligatoriu")
    verification_type: Mapped[str] = mapped_column(Text, nullable=False, default="match_description")

    is_compound: Mapped[bool] = mapped_column(Boolean, default=False)
    parent_requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("extracted_requirements.id")
    )

    referenced_standards: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    cross_references: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    cross_reference_context: Mapped[str | None] = mapped_column(Text)

    extraction_confidence: Mapped[float | None] = mapped_column(Float)
    needs_human_review: Mapped[bool] = mapped_column(Boolean, default=False)
    human_review_note: Mapped[str | None] = mapped_column(Text)

    project = relationship("Project", back_populates="requirements")
    source_chunk = relationship("DocumentChunk", foreign_keys=[source_chunk_id])
    source_document = relationship("Document", foreign_keys=[source_document_id])
    evaluations = relationship("RequirementEvaluation", back_populates="requirement", cascade="all, delete-orphan")
