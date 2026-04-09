"""Background task: process a .docx document.

Pipeline: parse Word → normalize → detect type → chunk → embed.
Runs in a background thread via worker.submit_task().
"""

import time
import uuid as uuid_mod

from sqlalchemy import delete, text

from app.config import settings
from app.core.logging import get_logger
from app.database import get_sync_session_factory
from app.models.document import Document
from app.models.chunk import DocumentChunk
from app.models.project import Project
from app.services.word_parser_service import parse_docx
from app.services.text_normalizer import normalize_text
from app.services.doc_type_detector import detect_doc_type_mismatch
from app.services.chunking_service import chunk_document
from app.services import embedding_service

logger = get_logger(__name__)

MAX_RETRIES = 3


def process_document_sync(document_id: str):
    """Process a single .docx document. Runs in background thread."""
    Session = get_sync_session_factory()

    for attempt in range(MAX_RETRIES):
        with Session() as db:
            doc = db.get(Document, uuid_mod.UUID(document_id))
            if not doc:
                logger.error("Document not found: %s", document_id)
                return

            try:
                # === Parse Word ===
                doc.processing_status = "parsing_in_progress"
                db.commit()

                result = parse_docx(doc.storage_path)
                if result.word_count < 50:
                    raise ValueError(f"Document too short ({result.word_count} words)")

                markdown = normalize_text(result.markdown)

                mismatch = detect_doc_type_mismatch(markdown[:3000], doc.doc_type)
                if mismatch:
                    doc.processing_warning = mismatch

                doc.markdown_content = markdown
                doc.heading_count = result.heading_count
                doc.paragraph_count = result.paragraph_count
                doc.processing_status = "parsing_completed"
                db.commit()

                # === Chunking ===
                doc.processing_status = "chunking_in_progress"
                db.commit()

                db.execute(delete(DocumentChunk).where(
                    DocumentChunk.document_id == uuid_mod.UUID(document_id)
                ))
                db.commit()

                chunks = chunk_document(markdown=markdown, heading_levels=result.heading_levels)

                chunk_records = []
                for chunk in chunks:
                    record = DocumentChunk(
                        document_id=uuid_mod.UUID(document_id),
                        chunk_index=chunk.chunk_index,
                        hierarchy_path=chunk.hierarchy_path,
                        section_id=chunk.section_id,
                        section_title=chunk.section_title,
                        hierarchy_level=chunk.hierarchy_level,
                        content_with_context=chunk.content_with_context,
                        content_raw=chunk.content_raw,
                        start_paragraph=chunk.start_paragraph,
                        end_paragraph=chunk.end_paragraph,
                        chunk_type=chunk.chunk_type,
                        token_count=chunk.token_count,
                        detected_standards=chunk.detected_standards if chunk.detected_standards else [],
                        table_quality_score=chunk.table_quality_score,
                        needs_review=chunk.needs_review,
                    )
                    db.add(record)
                    chunk_records.append(record)
                db.commit()

                # === Embedding ===
                doc.processing_status = "embedding_in_progress"
                db.commit()

                actual_dim = embedding_service.get_dimensions()
                if actual_dim != settings.EMBEDDING_DIMENSIONS:
                    raise ValueError(
                        f"Embedding dim mismatch: model={actual_dim} vs config={settings.EMBEDDING_DIMENSIONS}"
                    )

                # Embed in batches of 100 with intermediate commits
                # If crash occurs, chunks without embeddings are re-embedded on retry
                EMBED_BATCH = 100
                texts = [c.content_with_context for c in chunks]
                for batch_start in range(0, len(texts), EMBED_BATCH):
                    batch_end = min(batch_start + EMBED_BATCH, len(texts))
                    batch_texts = texts[batch_start:batch_end]
                    batch_embeddings = embedding_service.embed_batch(batch_texts)
                    for j, emb in enumerate(batch_embeddings):
                        chunk_records[batch_start + j].embedding = emb
                    db.commit()  # Intermediate commit — partial progress saved
                    logger.info("Embedded batch %d-%d/%d", batch_start+1, batch_end, len(texts))

                # === Done ===
                doc.processing_status = "ready"
                db.commit()

                _check_all_docs_ready(db, doc.project_id)
                logger.info("Document processed: %s (%d chunks)", document_id, len(chunks))
                return  # Success

            except (ValueError, TypeError, KeyError) as e:
                doc.processing_status = "error"
                doc.processing_error = str(e)[:500]
                db.commit()
                logger.error("Document permanent error: %s: %s", document_id, e)
                return  # No retry for permanent errors

            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    try:
                        doc.processing_status = "error"
                        doc.processing_error = f"Transient error (retry {attempt+1}/{MAX_RETRIES}): {str(e)[:400]}"
                        db.commit()
                    except Exception:
                        db.rollback()
                    logger.warning("Document transient error (retry %d): %s: %s", attempt+1, document_id, e)
                    time.sleep(5 * (attempt + 1))
                    continue
                else:
                    try:
                        doc.processing_status = "error"
                        doc.processing_error = f"Failed after {MAX_RETRIES} retries: {str(e)[:400]}"
                        db.commit()
                    except Exception:
                        db.rollback()
                    logger.error("Document failed after retries: %s: %s", document_id, e)
                    return


def _check_all_docs_ready(db, project_id):
    """If all docs ready, update project status."""
    from sqlalchemy import select
    docs = db.execute(select(Document).where(Document.project_id == project_id)).scalars().all()
    if all(d.processing_status == "ready" for d in docs) and docs:
        project = db.get(Project, project_id)
        if project and project.status == "processing":
            project.status = "documents_ready"
            db.commit()
            logger.info("All documents ready: project %s", project_id)
