import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class BaseModel(Base, TimestampMixin):
    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


def _sql_in_check(column: str, values: list[str]) -> str:
    """Build a SQL IN check constraint string. ONLY for hardcoded values — never user input.
    NOTE: If you add a new value to any status list, you MUST create a new Alembic migration
    to update the corresponding CHECK constraint in the database."""
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"
