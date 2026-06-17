from redis import Redis

from app.core.config import get_settings


def get_redis() -> Redis:
    settings = get_settings()
    return Redis.from_url(settings.redis_url)

