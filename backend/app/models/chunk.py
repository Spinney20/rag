import uuid

from sqlalchemy import Text, Integer, Float, Boolean, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.models.base import Base
from app.models.base import _sql_in_check
from app.config import settings

import datetime
from sqlalchemy import DateTime, func

CHUNK_TYPES = ["text", "table", "list", "header", "mixed"]


class DocumentChunk(Base):
    """Extends Base (not BaseModel) intentionally — chunks are immutable.
    They are created once during processing and deleted+recreated on re-processing.
    No updated_at needed. If you need to track re-embedding, delete and recreate."""
    __tablename__ = "document_chunks"
    __table_args__ = (
        CheckConstraint(_sql_in_check("chunk_type", CHUNK_TYPES), name="ck_chunk_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # Hierarchy
    hierarchy_path: Mapped[str] = mapped_column(Text, nullable=False)
    section_id: Mapped[str | None] = mapped_column(Text)
    section_title: Mapped[str | None] = mapped_column(Text)
    hierarchy_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Dual storage (anti-hallucination)
    content_with_context: Mapped[str] = mapped_column(Text, nullable=False)
    content_raw: Mapped[str] = mapped_column(Text, nullable=False)

    # Source tracing (paragraph index in Word doc)
    start_paragraph: Mapped[int] = mapped_column(Integer, nullable=False)
    end_paragraph: Mapped[int] = mapped_column(Integer, nullable=False)

    # Metadata
    chunk_type: Mapped[str] = mapped_column(Text, nullable=False, default="text")
    token_count: Mapped[int | None] = mapped_column(Integer)
    detected_standards: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    # Table quality (FIX 29)
    table_quality_score: Mapped[float | None] = mapped_column(Float)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)

    # Vector embedding
    embedding = mapped_column(Vector(settings.EMBEDDING_DIMENSIONS), nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    document = relationship("Document", back_populates="chunks")
