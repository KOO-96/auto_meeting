import logging

from rq import Worker

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.observability import init_sentry
from app.queue.redis import get_redis

logger = logging.getLogger(__name__)


def main() -> None:
    configure_logging()
    init_sentry()
    settings = get_settings()
    logger.info("Starting RQ worker on queue '%s'", settings.rq_queue_name)
    worker = Worker([settings.rq_queue_name], connection=get_redis())
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
