"""Evaluation API — estimate, run, status, results, review, analytics.

Endpoints:
- POST /projects/{id}/evaluations/estimate  → cost/duration estimate
- POST /projects/{id}/evaluations/run       → trigger evaluation (async)
- GET  /projects/{id}/evaluations/runs      → list runs
- GET  /projects/{id}/evaluations/runs/{run_id}          → run status
- GET  /projects/{id}/evaluations/runs/{run_id}/results  → results list
- GET  /projects/{id}/evaluations/results/{eval_id}      → single result detail
- PUT  /projects/{id}/evaluations/results/{eval_id}/review → human override
- GET  /projects/{id}/analytics             → stats + health warnings
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.config import settings
from app.models.project import Project
from app.models.document import Document
from app.models.requirement import ExtractedRequirement
from app.models.evaluation_run import EvaluationRun
from app.models.evaluation import RequirementEvaluation
from app.schemas.evaluation import (
    EvaluationRunConfig,
    EvaluationRunResponse,
    EvalResultResponse,
    EvalResultListResponse,
    HumanReviewUpdate,
    CostEstimateResponse,
    AnalyticsResponse,
)
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["evaluations"])


# --- Cost Estimation (FIX 15) ---

@router.post("/projects/{project_id}/evaluations/estimate", response_model=CostEstimateResponse)
async def estimate_evaluation(
    project_id: uuid.UUID,
    body: EvaluationRunConfig,
    db: AsyncSession = Depends(get_db),
):
    """Estimate cost and duration before running evaluation."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Count total requirements
    total_count = (await db.execute(
        select(func.count()).where(ExtractedRequirement.project_id == project_id)
    )).scalar() or 0

    # Count filtered requirements
    query = select(func.count()).where(ExtractedRequirement.project_id == project_id)
    if body.only_priorities:
        query = query.where(ExtractedRequirement.priority.in_(body.only_priorities))
    if body.exclude_categories:
        query = query.where(~ExtractedRequirement.category.in_(body.exclude_categories))
    if body.exclude_verification_types:
        query = query.where(~ExtractedRequirement.verification_type.in_(body.exclude_verification_types))

    filtered_count = (await db.execute(query)).scalar() or 0

    # Estimates (sequential execution — ~5s per requirement)
    est_calls = int(filtered_count * 2.3)  # eval + ~30% verification pass + rewrite/rerank
    est_cost = filtered_count * 0.035  # ~$0.035 per requirement with Sonnet
    est_minutes = filtered_count * 5 / 60  # ~5s per req, sequential

    return CostEstimateResponse(
        total_requirements=total_count,
        filtered_requirements=filtered_count,
        estimated_llm_calls=est_calls,
        estimated_cost_usd=round(est_cost, 2),
        estimated_duration_minutes=round(est_minutes, 1),
    )


# --- Trigger Evaluation ---

@router.post("/projects/{project_id}/evaluations/run", response_model=EvaluationRunResponse, status_code=202)
async def trigger_evaluation(
    project_id: uuid.UUID,
    body: EvaluationRunConfig,
    db: AsyncSession = Depends(get_db),
):
    """Trigger an evaluation run (async Celery task)."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # FIX 17 + FIX 38: Check project status
    if body.mode == "thorough" and project.status != "requirements_validated":
        raise HTTPException(400, "Requirements must be validated first (or use mode='quick')")
    if body.mode == "quick" and project.status not in ("requirements_extracted", "requirements_validated"):
        raise HTTPException(400, "Requirements must be extracted first")

    # FIX 13: Concurrent run prevention
    existing_run = (await db.execute(
        select(EvaluationRun).where(
            EvaluationRun.project_id == project_id,
            EvaluationRun.status.in_(["pending", "running"]),
        )
    )).scalar_one_or_none()
    if existing_run:
        raise HTTPException(409, f"Evaluation already running (run_id={existing_run.id})")

    # Validate PT documents exist
    pt_count = (await db.execute(
        select(func.count()).where(
            Document.project_id == project_id,
            Document.doc_type == "propunere_tehnica",
            Document.processing_status == "ready",
        )
    )).scalar() or 0
    if pt_count == 0:
        raise HTTPException(400, "No PT documents ready. Upload a Propunere Tehnica first.")

    # Create run record
    run = EvaluationRun(
        project_id=project_id,
        status="pending",
        run_config=body.model_dump(),
        previous_run_id=uuid.UUID(body.previous_run_id) if body.previous_run_id else None,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # Dispatch Celery task AFTER commit
    from app.tasks.run_evaluation import run_evaluation_task
    task = run_evaluation_task.delay(str(project_id), str(run.id), body.model_dump())

    run.celery_task_id = task.id
    await db.commit()

    logger.info("Evaluation triggered: project=%s run=%s", project_id, run.id)
    return EvaluationRunResponse.model_validate(run)


# --- Run Status ---

@router.get("/projects/{project_id}/evaluations/runs", response_model=list[EvaluationRunResponse])
async def list_runs(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EvaluationRun)
        .where(EvaluationRun.project_id == project_id)
        .order_by(EvaluationRun.created_at.desc())
    )
    return [EvaluationRunResponse.model_validate(r) for r in result.scalars().all()]


@router.get("/projects/{project_id}/evaluations/runs/{run_id}", response_model=EvaluationRunResponse)
async def get_run(project_id: uuid.UUID, run_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    run = await db.get(EvaluationRun, run_id)
    if not run or run.project_id != project_id:
        raise HTTPException(404, "Evaluation run not found")
    return EvaluationRunResponse.model_validate(run)


# --- Results ---

@router.get("/projects/{project_id}/evaluations/runs/{run_id}/results", response_model=EvalResultListResponse)
async def list_results(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    verdict: str | None = Query(None),
    needs_review: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(RequirementEvaluation).where(
        RequirementEvaluation.run_id == run_id,
        RequirementEvaluation.project_id == project_id,
    )
    if verdict:
        query = query.where(RequirementEvaluation.verdict == verdict)
    if needs_review is not None:
        query = query.where(RequirementEvaluation.needs_human_review == needs_review)

    total = (await db.execute(
        select(func.count()).select_from(query.subquery())
    )).scalar() or 0

    query = query.order_by(RequirementEvaluation.created_at).limit(limit).offset(offset)
    results = (await db.execute(query)).scalars().all()

    return EvalResultListResponse(
        results=[EvalResultResponse.model_validate(r) for r in results],
        total=total,
    )


@router.get("/projects/{project_id}/evaluations/results/{eval_id}", response_model=EvalResultResponse)
async def get_result(project_id: uuid.UUID, eval_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.get(RequirementEvaluation, eval_id)
    if not result or result.project_id != project_id:
        raise HTTPException(404, "Evaluation result not found")
    return EvalResultResponse.model_validate(result)


# --- Human Review Override ---

@router.put("/projects/{project_id}/evaluations/results/{eval_id}/review", response_model=EvalResultResponse)
async def review_result(
    project_id: uuid.UUID,
    eval_id: uuid.UUID,
    body: HumanReviewUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.get(RequirementEvaluation, eval_id)
    if not result or result.project_id != project_id:
        raise HTTPException(404, "Evaluation result not found")

    result.human_verdict = body.human_verdict
    result.human_note = body.human_note
    result.reviewed_at = datetime.now(timezone.utc)
    result.needs_human_review = False
    # TODO: set reviewed_by from authenticated user when auth is implemented
    if body.reviewer_id:
        result.reviewed_by = uuid.UUID(body.reviewer_id)

    await db.commit()
    await db.refresh(result)
    return EvalResultResponse.model_validate(result)


# --- Analytics (FIX 19) ---

@router.get("/projects/{project_id}/analytics", response_model=AnalyticsResponse)
async def get_analytics(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get evaluation statistics and health warnings."""
    # Get latest completed run
    latest_run = (await db.execute(
        select(EvaluationRun).where(
            EvaluationRun.project_id == project_id,
            EvaluationRun.status == "completed",
        ).order_by(EvaluationRun.created_at.desc()).limit(1)
    )).scalar_one_or_none()

    if not latest_run:
        raise HTTPException(404, "No completed evaluation runs")

    # Verdict distribution
    verdict_rows = (await db.execute(
        select(RequirementEvaluation.verdict, func.count()).where(
            RequirementEvaluation.run_id == latest_run.id
        ).group_by(RequirementEvaluation.verdict)
    )).all()
    verdict_dist = {row[0]: row[1] for row in verdict_rows}

    # Aggregates
    total = sum(verdict_dist.values())
    avg_conf = (await db.execute(
        select(func.avg(RequirementEvaluation.confidence_score)).where(
            RequirementEvaluation.run_id == latest_run.id
        )
    )).scalar() or 0.0

    verified_count = (await db.execute(
        select(func.count()).where(
            RequirementEvaluation.run_id == latest_run.id,
            RequirementEvaluation.all_quotes_verified == True,  # noqa: E712
        )
    )).scalar() or 0

    review_count = (await db.execute(
        select(func.count()).where(
            RequirementEvaluation.run_id == latest_run.id,
            RequirementEvaluation.needs_human_review == True,  # noqa: E712
        )
    )).scalar() or 0

    quote_rate = verified_count / max(total, 1)

    # Health warnings
    warnings = []
    insuf_rate = verdict_dist.get("INSUFFICIENT_DATA", 0) / max(total, 1)
    if insuf_rate > 0.15:
        warnings.append(f"INSUFFICIENT_DATA rate={insuf_rate:.0%} (>15%) — retrieval may be inefficient")
    if quote_rate < 0.85:
        warnings.append(f"Quote verification rate={quote_rate:.0%} (<85%) — possible conversion quality issues")
    if latest_run.error_count and latest_run.error_count > total * 0.05:
        warnings.append(f"{latest_run.error_count} evaluation errors — check LLM connectivity")

    return AnalyticsResponse(
        verdict_distribution=verdict_dist,
        avg_confidence=round(float(avg_conf), 3),
        quote_verification_rate=round(quote_rate, 3),
        needs_review_count=review_count,
        error_count=latest_run.error_count or 0,
        total_evaluated=total,
        health_warnings=warnings,
    )
