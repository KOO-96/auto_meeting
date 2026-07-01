from typing import Any

from rq import Queue, Retry

from app.core.config import get_settings
from app.queue.redis import get_redis


def get_queue() -> Queue:
    settings = get_settings()
    return Queue(settings.rq_queue_name, connection=get_redis())


def default_enqueue_kwargs() -> dict[str, Any]:
    """RQ enqueue options that bound a job's lifecycle.

    Without an explicit ``job_timeout`` a slow model call can exceed RQ's 180s
    default and be killed mid-run, leaving the DB row stuck. ``failure_ttl``
    keeps failed jobs inspectable, and ``retry`` re-runs transient failures.
    """
    settings = get_settings()
    return {
        "job_timeout": settings.rq_job_timeout_seconds,
        "result_ttl": settings.rq_result_ttl_seconds,
        "failure_ttl": settings.rq_failure_ttl_seconds,
        "retry": Retry(
            max=settings.rq_max_retries,
            interval=settings.rq_retry_interval_seconds,
        ),
    }
