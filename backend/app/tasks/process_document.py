"""Celery task: process a .docx document through the pipeline.

Pipeline: parse Word → normalize text → detect doc type → update DB.
Chunking + embedding are in Faza 3.
"""

from celery import shared_task
from celery.utils.log import get_task_logger
from sqlalchemy import select

from app.tasks.celery_app import celery_app
from app.database import SyncSessionLocal
from app.models.document import Document
from app.models.project import Project
from app.services.word_parser_service import parse_docx
from app.services.text_normalizer import normalize_text
from app.services.doc_type_detector import detect_doc_type_mismatch

import uuid as uuid_mod

logger = get_task_logger(__name__)


@celery_app.task(
    bind=True,
    name="app.tasks.process_document.process_document_task",
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=600,   # 10 min soft limit
    time_limit=660,        # 11 min hard limit
)
def process_document_task(self, document_id: str):
    """Process a single .docx document: parse → normalize → detect type → save."""
    with SyncSessionLocal() as db:
        doc = db.get(Document, uuid_mod.UUID(document_id))
        if not doc:
            logger.error("Document not found: %s", document_id)
            return

        logger.info("Processing document %s: %s", document_id, doc.original_filename)

        try:
            # === ETAPA 1: Parse Word ===
            doc.processing_status = "parsing_in_progress"
            db.commit()

            result = parse_docx(doc.storage_path)

            if result.word_count < 50:
                raise ValueError(
                    f"Document too short ({result.word_count} words). "
                    "Check if the .docx conversion was successful."
                )

            # === ETAPA 2: Normalize text ===
            markdown = normalize_text(result.markdown)

            # === ETAPA 3: Detect doc type mismatch ===
            mismatch = detect_doc_type_mismatch(markdown[:3000], doc.doc_type)
            if mismatch:
                doc.processing_warning = mismatch
                logger.warning("Doc type mismatch: doc=%s warning=%s", document_id, mismatch)

            # === Save results ===
            doc.markdown_content = markdown
            doc.heading_count = result.heading_count
            doc.paragraph_count = result.paragraph_count
            doc.processing_status = "parsing_completed"
            db.commit()

            logger.info(
                "Document parsed: doc=%s headings=%d paragraphs=%d words=%d",
                document_id, result.heading_count, result.paragraph_count, result.word_count,
            )

            # TODO Faza 3: chunking + embedding steps will go here
            # For now, mark as ready (will change when chunking is added)
            doc.processing_status = "ready"
            db.commit()

            # Check if all project documents are ready
            _check_all_docs_ready(db, doc.project_id)

        except self.SoftTimeLimitExceeded:
            doc.processing_status = "error"
            doc.processing_error = "Timeout: processing exceeded 10 minute limit"
            db.commit()
            logger.error("Document processing timeout: %s", document_id)

        except (ValueError, TypeError, KeyError) as e:
            # Permanent failures — do NOT retry (bad file, wrong format, etc.)
            doc.processing_status = "error"
            doc.processing_error = str(e)[:500]
            db.commit()
            logger.error("Document permanent error: doc=%s error=%s", document_id, str(e))

        except Exception as e:
            # Transient failures — retry (DB connection, IO error, etc.)
            try:
                doc.processing_status = "error"
                doc.processing_error = f"Transient error (retry {self.request.retries}/{self.max_retries}): {str(e)[:400]}"
                db.commit()
            except Exception:
                db.rollback()
            logger.error("Document transient error: doc=%s error=%s retries=%d", document_id, str(e), self.request.retries)
            raise self.retry(exc=e)


def _check_all_docs_ready(db, project_id):
    """If all documents in a project are ready, update project status."""
    docs = db.execute(
        select(Document).where(Document.project_id == project_id)
    ).scalars().all()

    all_ready = all(d.processing_status == "ready" for d in docs)
    if all_ready and docs:
        project = db.get(Project, project_id)
        if project and project.status == "processing":
            project.status = "documents_ready"
            db.commit()
            logger.info("All documents ready for project %s", project_id)
