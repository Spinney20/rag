"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-07
"""
from typing import Sequence, Union

import os

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from pgvector.sqlalchemy import Vector

EMBEDDING_DIMENSIONS = int(os.environ.get("EMBEDDING_DIMENSIONS", "384"))

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extensions
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "vector"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')

    # Users
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("email", sa.Text, unique=True, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("full_name", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Projects
    op.create_table(
        "projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default="created"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('created','processing','documents_ready','requirements_extracted',"
            "'requirements_validated','evaluated','completed')",
            name="ck_project_status",
        ),
    )

    # Documents
    op.create_table(
        "documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("doc_type", sa.Text, nullable=False),
        sa.Column("original_filename", sa.Text, nullable=False),
        sa.Column("storage_path", sa.Text, nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger),
        sa.Column("file_hash", sa.Text),
        sa.Column("heading_count", sa.Integer),
        sa.Column("paragraph_count", sa.Integer),
        sa.Column("markdown_content", sa.Text),
        sa.Column("processing_status", sa.Text, nullable=False, server_default="uploaded"),
        sa.Column("processing_error", sa.Text),
        sa.Column("processing_warning", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "doc_type IN ('caiet_de_sarcini','fisa_de_date','propunere_tehnica')",
            name="ck_doc_type",
        ),
        sa.CheckConstraint(
            "processing_status IN ('uploaded','parsing_in_progress','parsing_completed',"
            "'chunking_in_progress','chunking_completed','embedding_in_progress','ready','error')",
            name="ck_processing_status",
        ),
    )
    op.create_index("idx_documents_project", "documents", ["project_id"])
    op.create_index("idx_documents_hash", "documents", ["file_hash"])

    # Document Chunks
    op.create_table(
        "document_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("hierarchy_path", sa.Text, nullable=False),
        sa.Column("section_id", sa.Text),
        sa.Column("section_title", sa.Text),
        sa.Column("hierarchy_level", sa.Integer, nullable=False, server_default="0"),
        sa.Column("content_with_context", sa.Text, nullable=False),
        sa.Column("content_raw", sa.Text, nullable=False),
        sa.Column("start_paragraph", sa.Integer, nullable=False),
        sa.Column("end_paragraph", sa.Integer, nullable=False),
        sa.Column("chunk_type", sa.Text, nullable=False, server_default="text"),
        sa.Column("token_count", sa.Integer),
        sa.Column("detected_standards", ARRAY(sa.Text)),
        sa.Column("table_quality_score", sa.Float),
        sa.Column("needs_review", sa.Boolean, server_default=sa.text("false")),
        sa.Column("embedding", Vector(EMBEDDING_DIMENSIONS)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "chunk_type IN ('text','table','list','header','mixed')",
            name="ck_chunk_type",
        ),
    )
    op.create_index("idx_chunks_document", "document_chunks", ["document_id"])
    op.create_index("idx_chunks_section", "document_chunks", ["section_id"])

    # HNSW vector index
    op.execute(
        "CREATE INDEX idx_chunks_embedding ON document_chunks "
        "USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)"
    )
    # Full-text search index
    op.execute(
        "CREATE INDEX idx_chunks_fts ON document_chunks "
        "USING gin (to_tsvector('simple', content_with_context))"
    )
    # Trigram index for fuzzy quote verification
    op.execute(
        "CREATE INDEX idx_chunks_trgm ON document_chunks "
        "USING gin (content_raw gin_trgm_ops)"
    )

    # Extracted Requirements
    op.create_table(
        "extracted_requirements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_chunk_id", UUID(as_uuid=True), sa.ForeignKey("document_chunks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requirement_text", sa.Text, nullable=False),
        sa.Column("original_text", sa.Text, nullable=False),
        sa.Column("section_reference", sa.Text),
        sa.Column("hierarchy_path", sa.Text),
        sa.Column("category", sa.Text, nullable=False, server_default="tehnic"),
        sa.Column("priority", sa.Text, nullable=False, server_default="obligatoriu"),
        sa.Column("verification_type", sa.Text, nullable=False, server_default="match_description"),
        sa.Column("is_compound", sa.Boolean, server_default=sa.text("false")),
        sa.Column("parent_requirement_id", UUID(as_uuid=True), sa.ForeignKey("extracted_requirements.id")),
        sa.Column("referenced_standards", ARRAY(sa.Text)),
        sa.Column("cross_references", ARRAY(sa.Text)),
        sa.Column("cross_reference_context", sa.Text),
        sa.Column("extraction_confidence", sa.Float),
        sa.Column("needs_human_review", sa.Boolean, server_default=sa.text("false")),
        sa.Column("human_review_note", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("category IN ('tehnic','administrativ','calitate','termene','personal','echipamente','materiale')", name="ck_req_category"),
        sa.CheckConstraint("priority IN ('obligatoriu','recomandat','optional','informativ')", name="ck_req_priority"),
        sa.CheckConstraint("verification_type IN ('match_value','match_reference','match_description','unverifiable')", name="ck_req_verification_type"),
    )
    op.create_index("idx_reqs_project", "extracted_requirements", ["project_id"])
    op.create_index("idx_reqs_source_chunk", "extracted_requirements", ["source_chunk_id"])
    op.create_index("idx_reqs_source_doc", "extracted_requirements", ["source_document_id"])
    op.create_index("idx_reqs_category", "extracted_requirements", ["category"])

    # Evaluation Runs
    op.create_table(
        "evaluation_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="pending"),
        sa.Column("total_requirements", sa.Integer, server_default="0"),
        sa.Column("evaluated_count", sa.Integer, server_default="0"),
        sa.Column("conform_count", sa.Integer, server_default="0"),
        sa.Column("neconform_count", sa.Integer, server_default="0"),
        sa.Column("partial_count", sa.Integer, server_default="0"),
        sa.Column("insufficient_count", sa.Integer, server_default="0"),
        sa.Column("needs_review_count", sa.Integer, server_default="0"),
        sa.Column("error_count", sa.Integer, server_default="0"),
        sa.Column("total_input_tokens", sa.Integer, server_default="0"),
        sa.Column("total_output_tokens", sa.Integer, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Numeric(10, 4), server_default="0"),
        sa.Column("run_config", JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("previous_run_id", UUID(as_uuid=True), sa.ForeignKey("evaluation_runs.id")),
        sa.Column("celery_task_id", sa.Text),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending','running','completed','failed')", name="ck_run_status"),
    )
    op.create_index("idx_runs_project", "evaluation_runs", ["project_id"])
    # Prevent concurrent active runs for same project (FIX 13 DB-level enforcement)
    op.execute(
        "CREATE UNIQUE INDEX uq_runs_active_per_project ON evaluation_runs (project_id) "
        "WHERE status IN ('pending', 'running')"
    )

    # Requirement Evaluations
    op.create_table(
        "requirement_evaluations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("evaluation_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requirement_id", UUID(as_uuid=True), sa.ForeignKey("extracted_requirements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("verdict", sa.Text, nullable=False),
        sa.Column("confidence_score", sa.Float, nullable=False),
        sa.Column("reasoning", sa.Text, nullable=False),
        sa.Column("proposal_quotes", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("covered_aspects", JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("missing_aspects", JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("retrieved_chunk_ids", ARRAY(UUID(as_uuid=True))),
        sa.Column("retrieval_scores", JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("all_quotes_verified", sa.Boolean, server_default=sa.text("false")),
        sa.Column("verification_retries", sa.Integer, server_default="0"),
        sa.Column("needs_human_review", sa.Boolean, server_default=sa.text("false")),
        sa.Column("human_verdict", sa.Text),
        sa.Column("human_note", sa.Text),
        sa.Column("reviewed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("llm_model", sa.Text),
        sa.Column("llm_prompt_version", sa.Text),
        sa.Column("llm_tokens_used", sa.Integer),
        sa.Column("llm_latency_ms", sa.Integer),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("verdict IN ('CONFORM','NECONFORM','PARTIAL','INSUFFICIENT_DATA')", name="ck_eval_verdict"),
        sa.UniqueConstraint("run_id", "requirement_id", name="uq_eval_run_requirement"),
    )
    op.create_index("idx_evals_run", "requirement_evaluations", ["run_id"])
    op.create_index("idx_evals_requirement", "requirement_evaluations", ["requirement_id"])
    op.create_index("idx_evals_project", "requirement_evaluations", ["project_id"])
    op.create_index("idx_evals_verdict", "requirement_evaluations", ["verdict"])
    op.execute(
        "CREATE INDEX idx_evals_review ON requirement_evaluations (needs_human_review) "
        "WHERE needs_human_review = true"
    )


def downgrade() -> None:
    op.drop_table("requirement_evaluations")
    op.drop_table("evaluation_runs")
    op.drop_table("extracted_requirements")
    op.drop_table("document_chunks")
    op.drop_table("documents")
    op.drop_table("projects")
    op.drop_table("users")
    op.execute('DROP EXTENSION IF EXISTS "pg_trgm"')
    op.execute('DROP EXTENSION IF EXISTS "vector"')
    op.execute('DROP EXTENSION IF EXISTS "uuid-ossp"')
