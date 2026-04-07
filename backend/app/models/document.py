import uuid

from sqlalchemy import Text, BigInteger, Integer, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.base import _sql_in_check

DOC_TYPES = ["caiet_de_sarcini", "fisa_de_date", "propunere_tehnica"]

PROCESSING_STATUSES = [
    "uploaded",
    "parsing_in_progress",
    "parsing_completed",
    "chunking_in_progress",
    "chunking_completed",
    "embedding_in_progress",
    "ready",
    "error",
]


class Document(BaseModel):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(_sql_in_check("doc_type", DOC_TYPES), name="ck_doc_type"),
        CheckConstraint(_sql_in_check("processing_status", PROCESSING_STATUSES), name="ck_processing_status"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    doc_type: Mapped[str] = mapped_column(Text, nullable=False)
    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    file_hash: Mapped[str | None] = mapped_column(Text)
    heading_count: Mapped[int | None] = mapped_column(Integer)
    paragraph_count: Mapped[int | None] = mapped_column(Integer)
    markdown_content: Mapped[str | None] = mapped_column(Text)
    processing_status: Mapped[str] = mapped_column(Text, nullable=False, default="uploaded")
    processing_error: Mapped[str | None] = mapped_column(Text)
    processing_warning: Mapped[str | None] = mapped_column(Text)

    project = relationship("Project", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
