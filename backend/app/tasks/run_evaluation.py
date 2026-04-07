"""Celery task: run evaluation of requirements against PT documents.

Implements the full evaluation pipeline from PLAN.md Section 9.3:
- Sequential evaluation (sync — each requirement gets its own DB transaction)
- Atomic counter updates (FIX 39)
- Idempotent on retry (FIX 40)
- Finally block for status (FIX 41)
- Category/priority filtering (FIX 30)
- Incremental re-evaluation (FIX 36)

NOTE: Parallelism deferred to post-MVP. Current approach is sequential but correct.
Each requirement evaluation is isolated — failure in one doesn't affect others.
For a 200-requirement project at ~5s per requirement, total ~17 minutes.
"""

import uuid as uuid_mod
from datetime import datetime, timezone

from celery.exceptions import Retry
from celery.utils.log import get_task_logger
from sqlalchemy import select, text

from app.tasks.celery_app import celery_app
from app.config import settings
from app.database import SyncSessionLocal
from app.models.project import Project
from app.models.document import Document
from app.models.requirement import ExtractedRequirement
from app.models.evaluation_run import EvaluationRun
from app.models.evaluation import RequirementEvaluation
from app.services.evaluation_service import evaluate_requirement, evaluate_with_verification_pass

logger = get_task_logger(__name__)


@celery_app.task(
    bind=True,
    name="app.tasks.run_evaluation.run_evaluation_task",
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=3600,  # 60 min
    time_limit=3660,
)
def run_evaluation_task(self, project_id: str, run_id: str, config: dict):
    """Run evaluation — fully synchronous, one requirement at a time."""
    pid = uuid_mod.UUID(project_id)
    rid = uuid_mod.UUID(run_id)
    is_retrying = False

    with SyncSessionLocal() as db:
        run = db.get(EvaluationRun, rid)
        if not run:
            logger.error("Evaluation run not found: %s", run_id)
            return

        project = db.get(Project, pid)
        if not project:
            logger.error("Project not found: %s", project_id)
            return

        try:
            run.status = "running"
            run.started_at = datetime.now(timezone.utc)
            db.commit()

            # Get PT documents
            pt_docs = db.execute(
                select(Document).where(
                    Document.project_id == pid,
                    Document.doc_type == "propunere_tehnica",
                    Document.processing_status == "ready",
                )
            ).scalars().all()
            pt_doc_ids = [d.id for d in pt_docs]

            if not pt_doc_ids:
                raise ValueError("No PT documents ready for evaluation")

            # Filter requirements (FIX 30)
            query = select(ExtractedRequirement).where(
                ExtractedRequirement.project_id == pid,
            )
            only_priorities = config.get("only_priorities", ["obligatoriu", "recomandat"])
            exclude_categories = config.get("exclude_categories", [])
            exclude_vtypes = config.get("exclude_verification_types", ["unverifiable"])

            if only_priorities:
                query = query.where(ExtractedRequirement.priority.in_(only_priorities))
            if exclude_categories:
                query = query.where(~ExtractedRequirement.category.in_(exclude_categories))
            if exclude_vtypes:
                query = query.where(~ExtractedRequirement.verification_type.in_(exclude_vtypes))

            # Incremental re-evaluation (FIX 36)
            previous_run_id = config.get("previous_run_id")
            if previous_run_id:
                prev_rid = uuid_mod.UUID(previous_run_id)
                failed_ids = db.execute(
                    select(RequirementEvaluation.requirement_id).where(
                        RequirementEvaluation.run_id == prev_rid,
                        RequirementEvaluation.verdict != "CONFORM",
                    )
                ).scalars().all()
                if failed_ids:
                    query = query.where(ExtractedRequirement.id.in_(failed_ids))

            requirements = db.execute(query).scalars().all()

            # Idempotent: skip already-evaluated (FIX 40)
            already_done = set(
                db.execute(
                    select(RequirementEvaluation.requirement_id).where(
                        RequirementEvaluation.run_id == rid
                    )
                ).scalars().all()
            )
            requirements = [r for r in requirements if r.id not in already_done]

            # Update totals
            run.total_requirements = len(requirements) + len(already_done)
            run.run_config = config
            db.commit()

            if not requirements:
                run.status = "completed"
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
                logger.info("Evaluation run %s: all requirements already done", run_id)
                return

            logger.info(
                "Starting evaluation: run=%s requirements=%d (skipped %d already done)",
                run_id, len(requirements), len(already_done),
            )

            # Evaluate each requirement sequentially
            for i, req in enumerate(requirements):
                _evaluate_single(db, req, pt_doc_ids, rid, pid)
                if (i + 1) % 10 == 0:
                    logger.info("Evaluation progress: %d/%d", i + 1, len(requirements))

            run.status = "completed"
            logger.info("Evaluation complete: run=%s", run_id)

        except self.SoftTimeLimitExceeded:
            run.status = "failed"
            run.error_message = "Timeout: evaluation exceeded 60 minute limit"
            logger.error("Evaluation timeout: run=%s", run_id)

        except Retry:
            # Celery retry — don't mark as failed, let it retry
            is_retrying = True
            raise

        except Exception as e:
            run.status = "failed"
            run.error_message = str(e)[:500]
            logger.error("Evaluation error: run=%s error=%s", run_id, e)
            is_retrying = True
            raise self.retry(exc=e)

        finally:
            if not is_retrying:
                # Only write final status when NOT retrying (FIX: Bug 2 from review)
                db.execute(text("""
                    UPDATE evaluation_runs
                    SET status = :status,
                        completed_at = :completed_at,
                        error_message = :error_msg
                    WHERE id = :run_id
                """), {
                    "run_id": str(rid),
                    "status": run.status,
                    "completed_at": datetime.now(timezone.utc),
                    "error_msg": getattr(run, "error_message", None),
                })
                db.commit()

                # Update project status
                eval_count = db.execute(text(
                    "SELECT count(*) FROM requirement_evaluations WHERE run_id = :rid"
                ), {"rid": str(rid)}).scalar()
                if eval_count and eval_count > 0:
                    db.execute(text(
                        "UPDATE projects SET status = 'evaluated', updated_at = now() WHERE id = :pid"
                    ), {"pid": str(pid)})
                    db.commit()


def _evaluate_single(
    db,
    requirement: ExtractedRequirement,
    pt_doc_ids: list[uuid_mod.UUID],
    run_id: uuid_mod.UUID,
    project_id: uuid_mod.UUID,
):
    """Evaluate a single requirement. Each call is an isolated DB transaction."""
    try:
        result, chunks, all_verified = evaluate_requirement(db, requirement, pt_doc_ids)

        # Verification pass for NECONFORM/INSUFFICIENT_DATA
        if result.verdict in ("NECONFORM", "INSUFFICIENT_DATA"):
            result, chunks, all_verified = evaluate_with_verification_pass(
                db, requirement, pt_doc_ids, result, chunks,
            )

        # Confidence-based routing
        needs_review = (
            result.confidence_score < 0.6
            or result.verdict == "INSUFFICIENT_DATA"
            or not all_verified
        )

        # Save evaluation
        evaluation = RequirementEvaluation(
            run_id=run_id,
            requirement_id=requirement.id,
            project_id=project_id,
            verdict=result.verdict,
            confidence_score=result.confidence_score,
            reasoning=result.step_by_step_reasoning,
            proposal_quotes=[q.model_dump() for q in result.exact_quotes_from_pt],
            covered_aspects=result.covered_aspects,
            missing_aspects=result.missing_aspects,
            retrieved_chunk_ids=[c.id for c in chunks],
            retrieval_scores={str(c.id): {"rrf": round(c.rrf_score, 4), "rerank": round(c.rerank_score, 2)} for c in chunks},
            all_quotes_verified=all_verified,
            needs_human_review=needs_review,
            llm_model=settings.LLM_MODEL,
            llm_prompt_version=f"eval_{settings.LLM_PROVIDER}",
        )
        db.add(evaluation)
        db.commit()

        # Atomic counter update (FIX 39)
        db.execute(text("""
            UPDATE evaluation_runs SET
                evaluated_count = evaluated_count + 1,
                conform_count = conform_count + CASE WHEN :v = 'CONFORM' THEN 1 ELSE 0 END,
                neconform_count = neconform_count + CASE WHEN :v = 'NECONFORM' THEN 1 ELSE 0 END,
                partial_count = partial_count + CASE WHEN :v = 'PARTIAL' THEN 1 ELSE 0 END,
                insufficient_count = insufficient_count + CASE WHEN :v = 'INSUFFICIENT_DATA' THEN 1 ELSE 0 END,
                needs_review_count = needs_review_count + CASE WHEN :nr THEN 1 ELSE 0 END
            WHERE id = :run_id
        """), {"run_id": str(run_id), "v": result.verdict, "nr": needs_review})
        db.commit()

    except Exception as e:
        # Skip failed requirement, continue with others (FIX 10)
        db.rollback()
        logger.error("Evaluation failed for requirement %s: %s", requirement.id, e)
        try:
            error_eval = RequirementEvaluation(
                run_id=run_id,
                requirement_id=requirement.id,
                project_id=project_id,
                verdict="INSUFFICIENT_DATA",
                confidence_score=0.0,
                reasoning=f"Evaluation error: {str(e)[:300]}",
                proposal_quotes=[],
                needs_human_review=True,
            )
            db.add(error_eval)
            db.commit()

            db.execute(text("""
                UPDATE evaluation_runs SET
                    evaluated_count = evaluated_count + 1,
                    insufficient_count = insufficient_count + 1,
                    needs_review_count = needs_review_count + 1,
                    error_count = error_count + 1
                WHERE id = :run_id
            """), {"run_id": str(run_id)})
            db.commit()
        except Exception:
            db.rollback()
