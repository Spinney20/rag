"""Background task: run evaluation of requirements against PT.

Sequential evaluation (one requirement at a time).
Runs in background thread via worker.submit_task().
"""

import uuid as uuid_mod
from datetime import datetime, timezone

from sqlalchemy import select, text

from app.config import settings
from app.core.logging import get_logger
from app.database import get_sync_session_factory
from app.models.project import Project
from app.models.document import Document
from app.models.requirement import ExtractedRequirement
from app.models.evaluation_run import EvaluationRun
from app.models.evaluation import RequirementEvaluation
from app.services.evaluation_service import evaluate_requirement, evaluate_with_verification_pass

logger = get_logger(__name__)


def run_evaluation_sync(project_id: str, run_id: str, config: dict):
    """Run evaluation. Sequential, one requirement at a time."""
    Session = get_sync_session_factory()
    pid = uuid_mod.UUID(project_id)
    rid = uuid_mod.UUID(run_id)

    with Session() as db:
        run = db.get(EvaluationRun, rid)
        if not run:
            logger.error("Run not found: %s", run_id)
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
                raise ValueError("No PT documents ready")

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

            run.total_requirements = len(requirements) + len(already_done)
            run.run_config = config
            db.commit()

            if not requirements:
                run.status = "completed"
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
                return

            logger.info("Starting evaluation: run=%s reqs=%d (skip %d done)",
                        run_id, len(requirements), len(already_done))

            # Evaluate sequentially — each requirement gets its own DB session
            for i, req in enumerate(requirements):
                _evaluate_single(Session, req, pt_doc_ids, rid, pid)
                if (i + 1) % 10 == 0:
                    logger.info("Progress: %d/%d", i + 1, len(requirements))

            run.status = "completed"
            logger.info("Evaluation complete: run=%s", run_id)

        except Exception as e:
            run.status = "failed"
            run.error_message = str(e)[:500]
            logger.error("Evaluation error: run=%s: %s", run_id, e)

        finally:
            # Always finalize the run
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


def _evaluate_single(SessionFactory, requirement, pt_doc_ids, run_id, project_id):
    """Evaluate one requirement. Creates its own fresh DB session (isolated, short-lived)."""
    with SessionFactory() as db:
        try:
            result, chunks, all_verified = evaluate_requirement(db, requirement, pt_doc_ids)

            if result.verdict in ("NECONFORM", "INSUFFICIENT_DATA"):
                result, chunks, all_verified = evaluate_with_verification_pass(
                    db, requirement, pt_doc_ids, result, chunks,
                )

            needs_review = (
                result.confidence_score < 0.6
                or result.verdict == "INSUFFICIENT_DATA"
                or not all_verified
            )

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
            db.rollback()
            logger.error("Eval failed for req %s: %s", requirement.id, e)
            try:
                db.add(RequirementEvaluation(
                    run_id=run_id, requirement_id=requirement.id, project_id=project_id,
                    verdict="INSUFFICIENT_DATA", confidence_score=0.0,
                    reasoning=f"Evaluation error: {str(e)[:300]}",
                    proposal_quotes=[], needs_human_review=True,
                ))
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
