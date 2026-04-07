import uuid
from datetime import datetime

from typing import Literal

from pydantic import BaseModel, Field


class RequirementResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    source_document_id: uuid.UUID
    requirement_text: str
    original_text: str
    section_reference: str | None
    hierarchy_path: str | None
    category: str
    priority: str
    verification_type: str
    is_compound: bool
    referenced_standards: list[str] | None
    cross_references: list[str] | None
    extraction_confidence: float | None
    needs_human_review: bool
    human_review_note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RequirementUpdate(BaseModel):
    requirement_text: str | None = None
    category: Literal[
        "tehnic", "administrativ", "calitate", "termene",
        "personal", "echipamente", "materiale"
    ] | None = None
    priority: Literal["obligatoriu", "recomandat", "optional", "informativ"] | None = None
    verification_type: Literal[
        "match_value", "match_reference", "match_description", "unverifiable"
    ] | None = None
    needs_human_review: bool | None = None
    human_review_note: str | None = None


class RequirementListResponse(BaseModel):
    requirements: list[RequirementResponse]
    total: int
    by_category: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    by_verification_type: dict[str, int] = {}
    needs_review_count: int = 0
