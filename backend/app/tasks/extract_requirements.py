"""Celery task: extract requirements from CS/FDA documents.

Pipeline: load CS/FDA chunks → LLM extraction per chunk → dedup → cross-ref resolution.
"""

import uuid as uuid_mod

from celery.utils.log import get_task_logger
from sqlalchemy import select, delete

from app.tasks.celery_app import celery_app
from app.database import SyncSessionLocal
from app.models.document import Document
from app.models.project import Project
from app.models.requirement import ExtractedRequirement
from app.services.extraction_service import extract_requirements_from_chunks

logger = get_task_logger(__name__)


@celery_app.task(
    bind=True,
    name="app.tasks.extract_requirements.extract_requirements_task",
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=1800,  # 30 min
    time_limit=1860,
)
def extract_requirements_task(self, project_id: str):
    """Extract atomic requirements from all CS/FDA documents in a project."""
    with SyncSessionLocal() as db:
        pid = uuid_mod.UUID(project_id)
        project = db.get(Project, pid)
        if not project:
            logger.error("Project not found: %s", project_id)
            return

        logger.info("Starting requirement extraction for project %s", project_id)

        try:
            project.status = "processing"
            db.commit()

            # Get all CS/FDA documents that are ready
            cs_fda_docs = db.execute(
                select(Document).where(
                    Document.project_id == pid,
                    Document.doc_type.in_(["caiet_de_sarcini", "fisa_de_date"]),
                    Document.processing_status == "ready",
                )
            ).scalars().all()

            if not cs_fda_docs:
                logger.warning("No CS/FDA documents ready for project %s", project_id)
                project.status = "documents_ready"
                db.commit()
                return

            # Delete existing requirements (idempotent on re-extraction)
            db.execute(delete(ExtractedRequirement).where(
                ExtractedRequirement.project_id == pid
            ))
            db.commit()

            # Extract requirements
            requirements = extract_requirements_from_chunks(db, pid, cs_fda_docs)

            # Update project status
            project.status = "requirements_extracted"
            db.commit()

            logger.info(
                "Extraction complete: project=%s requirements=%d",
                project_id, len(requirements),
            )

        except self.SoftTimeLimitExceeded:
            project.status = "documents_ready"
            db.commit()
            logger.error("Extraction timeout for project %s", project_id)

        except (FileNotFoundError, PermissionError) as e:
            # Truly permanent failures (file system issues)
            logger.error("Extraction permanent error: project=%s error=%s", project_id, e)
            project.status = "documents_ready"
            db.commit()

        except Exception as e:
            # All other failures (LLM errors, network, validation) — retry
            try:
                project.status = "documents_ready"
                db.commit()
            except Exception:
                db.rollback()
            logger.error("Extraction error (retry %d/%d): project=%s error=%s",
                         self.request.retries, self.max_retries, project_id, e)
            raise self.retry(exc=e)
