"""Thread-based background task runner — replaces Celery + Redis.

Each task runs in its own thread with its own DB session.
ThreadPoolExecutor limits concurrency to 2 (prevents OOM on laptops).
Progress tracked via DB status fields (same as before with Celery).
"""

import threading
import uuid
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from app.core.logging import get_logger

logger = get_logger(__name__)

MAX_WORKERS = 2  # Max concurrent background tasks


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TaskInfo:
    id: str
    name: str
    status: TaskStatus = TaskStatus.PENDING
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None


# In-memory task registry
_tasks: dict[str, TaskInfo] = {}
_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="ragchecker-task")


def submit_task(name: str, target, args=(), kwargs=None) -> str:
    """Submit a background task. Returns task ID.

    Tasks run in a thread pool (max 2 concurrent). Extra tasks queue.
    """
    task_id = str(uuid.uuid4())

    with _lock:
        _tasks[task_id] = TaskInfo(id=task_id, name=name)

    def _run():
        with _lock:
            _tasks[task_id].status = TaskStatus.RUNNING
            _tasks[task_id].started_at = datetime.utcnow()
        try:
            target(*args, **(kwargs or {}))
            with _lock:
                _tasks[task_id].status = TaskStatus.COMPLETED
                _tasks[task_id].completed_at = datetime.utcnow()
            logger.info("Task completed: %s (%s)", task_id[:8], name)
        except Exception as e:
            logger.error("Task failed: %s (%s): %s", task_id[:8], name, e)
            with _lock:
                _tasks[task_id].status = TaskStatus.FAILED
                _tasks[task_id].error = str(e)[:500]
                _tasks[task_id].completed_at = datetime.utcnow()

    _executor.submit(_run)
    logger.info("Task submitted: %s (%s)", task_id[:8], name)
    return task_id


def get_task_info(task_id: str) -> TaskInfo | None:
    """Get info about a submitted task."""
    with _lock:
        return _tasks.get(task_id)


def _prune_old_tasks():
    """Remove completed tasks older than 1 hour. Called periodically."""
    with _lock:
        cutoff = datetime.utcnow()
        to_remove = [
            tid for tid, info in _tasks.items()
            if info.status in (TaskStatus.COMPLETED, TaskStatus.FAILED)
            and info.completed_at
            and (cutoff - info.completed_at).total_seconds() > 3600
        ]
        for tid in to_remove:
            del _tasks[tid]
