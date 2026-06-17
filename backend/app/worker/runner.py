from rq import Worker

from app.core.config import get_settings
from app.queue.redis import get_redis


def main() -> None:
    settings = get_settings()
    worker = Worker([settings.rq_queue_name], connection=get_redis())
    worker.work()


if __name__ == "__main__":
    main()

