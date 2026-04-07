import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    doc_type: str
    original_filename: str
    file_size_bytes: int | None
    heading_count: int | None
    paragraph_count: int | None
    processing_status: str
    processing_error: str | None  # Sanitized — internal details stripped in production
    processing_warning: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]


class DocumentDetailResponse(DocumentResponse):
    """Extended response with full content — used for single document detail views."""
    markdown_content: str | None
    file_hash: str | None


class DocumentDeleteResponse(BaseModel):
    deleted_chunks: int
    message: str
