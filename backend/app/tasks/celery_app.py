from celery import Celery

from app.config import settings
from app.core.logging import setup_logging

# Configure logging for Celery workers (lifespan doesn't run in workers)
setup_logging()

celery_app = Celery(
    "ragcheck",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.autodiscover_tasks(["app.tasks"])

celery_app.conf.update(
    # Task routing: processing vs evaluation queues (FIX 48)
    task_routes={
        "app.tasks.process_document.*": {"queue": "processing"},
        "app.tasks.extract_requirements.*": {"queue": "evaluation"},
        "app.tasks.run_evaluation.*": {"queue": "evaluation"},
    },
    # Reliability (FIX 10)
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="Europe/Bucharest",
    enable_utc=True,
)
