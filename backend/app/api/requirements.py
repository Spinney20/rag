"""Requirements API — extract, list, edit, delete, validate.

Endpoints:
- POST /projects/{id}/requirements/extract  → trigger extraction (async Celery)
- GET  /projects/{id}/requirements          → list with filters + stats
- PUT  /projects/{id}/requirements/{req_id} → edit requirement
- DEL  /projects/{id}/requirements/{req_id} → delete requirement
- POST /projects/{id}/requirements/validate → mark requirements as validated (FIX 17)
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.project import Project
from app.models.requirement import ExtractedRequirement
from app.schemas.requirement import (
    RequirementResponse,
    RequirementUpdate,
    RequirementListResponse,
)
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["requirements"])


@router.post("/projects/{project_id}/requirements/extract", status_code=202)
async def trigger_extraction(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Trigger async requirement extraction from CS/FDA documents."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if project.status not in ("documents_ready", "requirements_extracted", "requirements_validated"):
        raise HTTPException(
            400,
            f"Project status is '{project.status}'. Documents must be processed first.",
        )

    from app.tasks.extract_requirements import extract_requirements_task
    task = extract_requirements_task.delay(str(project_id))

    return {"task_id": task.id, "message": "Extraction started"}


@router.get("/projects/{project_id}/requirements", response_model=RequirementListResponse)
async def list_requirements(
    project_id: uuid.UUID,
    category: str | None = Query(None),
    priority: str | None = Query(None),
    verification_type: str | None = Query(None),
    needs_review: bool | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List extracted requirements with filtering and stats."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Base query
    query = select(ExtractedRequirement).where(
        ExtractedRequirement.project_id == project_id
    )

    # Filters
    if category:
        query = query.where(ExtractedRequirement.category == category)
    if priority:
        query = query.where(ExtractedRequirement.priority == priority)
    if verification_type:
        query = query.where(ExtractedRequirement.verification_type == verification_type)
    if needs_review is not None:
        query = query.where(ExtractedRequirement.needs_human_review == needs_review)

    # Total count (with filters)
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    query = query.order_by(ExtractedRequirement.hierarchy_path, ExtractedRequirement.created_at)
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    reqs = result.scalars().all()

    # Stats via SQL aggregation (no ORM object loading)
    base_filter = ExtractedRequirement.project_id == project_id

    async def _count_by(column):
        rows = (await db.execute(
            select(column, func.count()).where(base_filter).group_by(column)
        )).all()
        return {str(row[0]): row[1] for row in rows}

    by_category = await _count_by(ExtractedRequirement.category)
    by_priority = await _count_by(ExtractedRequirement.priority)
    by_vtype = await _count_by(ExtractedRequirement.verification_type)

    review_result = await db.execute(
        select(func.count()).where(base_filter, ExtractedRequirement.needs_human_review == True)  # noqa: E712
    )
    review_count = review_result.scalar() or 0

    return RequirementListResponse(
        requirements=[RequirementResponse.model_validate(r) for r in reqs],
        total=total,
        by_category=by_category,
        by_priority=by_priority,
        by_verification_type=by_vtype,
        needs_review_count=review_count,
    )


@router.put("/projects/{project_id}/requirements/{req_id}", response_model=RequirementResponse)
async def update_requirement(
    project_id: uuid.UUID,
    req_id: uuid.UUID,
    body: RequirementUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Edit a requirement (human review)."""
    req = await db.get(ExtractedRequirement, req_id)
    if not req or req.project_id != project_id:
        raise HTTPException(404, "Requirement not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(req, field, value)

    await db.commit()
    await db.refresh(req)
    return RequirementResponse.model_validate(req)


@router.delete("/projects/{project_id}/requirements/{req_id}", status_code=204)
async def delete_requirement(
    project_id: uuid.UUID,
    req_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single requirement."""
    req = await db.get(ExtractedRequirement, req_id)
    if not req or req.project_id != project_id:
        raise HTTPException(404, "Requirement not found")

    await db.delete(req)
    await db.commit()


@router.post("/projects/{project_id}/requirements/validate")
async def validate_requirements(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Mark requirements as validated — enables evaluation (FIX 17 checkpoint)."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if project.status not in ("requirements_extracted",):
        raise HTTPException(
            400,
            f"Project status is '{project.status}'. Requirements must be extracted first.",
        )

    # Check that at least some requirements exist
    count_result = await db.execute(
        select(func.count()).where(ExtractedRequirement.project_id == project_id)
    )
    count = count_result.scalar() or 0
    if count == 0:
        raise HTTPException(400, "No requirements extracted. Cannot validate.")

    project.status = "requirements_validated"
    await db.commit()

    logger.info("Requirements validated: project=%s count=%d", project_id, count)
    return {"message": f"{count} requirements validated", "status": "requirements_validated"}
