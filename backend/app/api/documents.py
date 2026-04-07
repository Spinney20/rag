import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.project import Project
from app.models.document import Document, DOC_TYPES
from app.models.chunk import DocumentChunk
from app.schemas.document import DocumentResponse, DocumentDetailResponse, DocumentListResponse, DocumentDeleteResponse
from pathlib import Path

from app.core.storage import save_upload, compute_file_hash
from app.core.logging import get_logger

logger = get_logger(__name__)

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

router = APIRouter(tags=["documents"])


@router.get("/projects/{project_id}/documents", response_model=DocumentListResponse)
async def list_documents(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    result = await db.execute(
        select(Document)
        .where(Document.project_id == project_id)
        .order_by(Document.created_at)
    )
    docs = result.scalars().all()
    return DocumentListResponse(documents=[DocumentResponse.model_validate(d) for d in docs])


@router.post("/projects/{project_id}/documents", response_model=DocumentResponse, status_code=201)
async def upload_document(
    project_id: uuid.UUID,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    # Validate project exists
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Validate doc_type
    if doc_type not in DOC_TYPES:
        raise HTTPException(400, f"doc_type must be one of: {DOC_TYPES}")

    # Validate file extension
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(400, "Only .docx files are accepted")

    # Read file content in chunks to prevent OOM on large files
    chunks = []
    total_size = 0
    while True:
        chunk = await file.read(1024 * 1024)  # 1MB chunks
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE:
            raise HTTPException(413, f"File too large. Maximum: {MAX_FILE_SIZE // (1024*1024)}MB")
        chunks.append(chunk)
    content = b"".join(chunks)

    # Validate it's actually a ZIP (docx = ZIP archive)
    if not content[:4] == b"PK\x03\x04":
        raise HTTPException(400, "Invalid .docx file (not a valid ZIP archive)")

    # Check for duplicate file in this project
    file_hash = compute_file_hash(content)
    result = await db.execute(
        select(Document).where(
            Document.project_id == project_id,
            Document.file_hash == file_hash,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            409,
            f"Identical file already uploaded as '{existing.doc_type}' ({existing.original_filename})",
        )

    # Save file to disk
    storage_path = save_upload(str(project_id), file.filename, content)

    # Create document record
    doc = Document(
        project_id=project_id,
        doc_type=doc_type,
        original_filename=file.filename,
        storage_path=storage_path,
        file_size_bytes=len(content),
        file_hash=file_hash,
    )
    db.add(doc)

    # Single commit for doc + project status (no race condition window)
    if project.status == "created":
        project.status = "processing"
    await db.commit()
    await db.refresh(doc)

    logger.info(
        "Document uploaded: project=%s doc=%s type=%s size=%d",
        project_id, doc.id, doc_type, len(content),
    )

    # Trigger async processing AFTER commit
    from app.tasks.process_document import process_document_task
    process_document_task.delay(str(doc.id))

    return DocumentResponse.model_validate(doc)


@router.get("/projects/{project_id}/documents/{doc_id}", response_model=DocumentDetailResponse)
async def get_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, doc_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(404, "Document not found")
    return DocumentDetailResponse.model_validate(doc)


@router.delete("/projects/{project_id}/documents/{doc_id}", response_model=DocumentDeleteResponse)
async def delete_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, doc_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(404, "Document not found")

    # Count chunks that will be deleted (cascade)
    chunk_count_result = await db.execute(
        select(func.count()).where(DocumentChunk.document_id == doc_id)
    )
    chunk_count = chunk_count_result.scalar() or 0

    # Delete file from disk
    try:
        file_path = Path(doc.storage_path)
        if file_path.exists():
            file_path.unlink()
    except OSError as e:
        logger.warning("Failed to delete file from disk: %s — %s", doc.storage_path, e)

    await db.delete(doc)

    # Recalculate project status based on remaining docs
    # NOTE: doc is marked for delete but not committed yet — filter by id != doc_id explicitly
    project = await db.get(Project, project_id)
    if project:
        remaining_docs = await db.execute(
            select(Document).where(
                Document.project_id == project_id,
                Document.id != doc_id,
            )
        )
        remaining = remaining_docs.scalars().all()
        if not remaining:
            project.status = "created"
        elif all(d.processing_status == "ready" for d in remaining):
            project.status = "documents_ready"
        else:
            project.status = "processing"
        db.add(project)

    await db.commit()

    logger.info("Document deleted: project=%s doc=%s chunks_deleted=%d", project_id, doc_id, chunk_count)

    return DocumentDeleteResponse(
        deleted_chunks=chunk_count,
        message=f"Document deleted with {chunk_count} chunks",
    )
