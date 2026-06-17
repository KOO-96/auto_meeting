from rq import Queue

from app.core.config import get_settings
from app.queue.redis import get_redis


def get_queue() -> Queue:
    settings = get_settings()
    return Queue(settings.rq_queue_name, connection=get_redis())

