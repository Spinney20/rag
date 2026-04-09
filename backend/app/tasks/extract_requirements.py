"""Background task: extract requirements from CS/FDA documents.

Runs in background thread via worker.submit_task().
"""

import time
import uuid as uuid_mod

from sqlalchemy import select, delete

from app.core.logging import get_logger
from app.database import get_sync_session_factory
from app.models.document import Document
from app.models.project import Project
from app.models.requirement import ExtractedRequirement
from app.services.extraction_service import extract_requirements_from_chunks

logger = get_logger(__name__)

MAX_RETRIES = 2


def extract_requirements_sync(project_id: str):
    """Extract requirements from all CS/FDA documents. Runs in background thread."""
    Session = get_sync_session_factory()

    for attempt in range(MAX_RETRIES):
        with Session() as db:
            pid = uuid_mod.UUID(project_id)
            project = db.get(Project, pid)
            if not project:
                logger.error("Project not found: %s", project_id)
                return

            try:
                project.status = "processing"
                db.commit()

                cs_fda_docs = db.execute(
                    select(Document).where(
                        Document.project_id == pid,
                        Document.doc_type.in_(["caiet_de_sarcini", "fisa_de_date"]),
                        Document.processing_status == "ready",
                    )
                ).scalars().all()

                if not cs_fda_docs:
                    project.status = "documents_ready"
                    db.commit()
                    return

                # Delete existing requirements (idempotent on re-extraction)
                db.execute(delete(ExtractedRequirement).where(
                    ExtractedRequirement.project_id == pid
                ))
                db.commit()

                requirements = extract_requirements_from_chunks(db, pid, cs_fda_docs)

                project.status = "requirements_extracted"
                db.commit()
                logger.info("Extraction complete: project=%s reqs=%d", project_id, len(requirements))
                return  # Success

            except (FileNotFoundError, PermissionError) as e:
                project.status = "documents_ready"
                db.commit()
                logger.error("Extraction permanent error: %s: %s", project_id, e)
                return

            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    try:
                        project.status = "documents_ready"
                        db.commit()
                    except Exception:
                        db.rollback()
                    logger.warning("Extraction retry %d: %s: %s", attempt+1, project_id, e)
                    time.sleep(10 * (attempt + 1))
                    continue
                else:
                    try:
                        project.status = "documents_ready"
                        db.commit()
                    except Exception:
                        db.rollback()
                    logger.error("Extraction failed after retries: %s: %s", project_id, e)
                    return
