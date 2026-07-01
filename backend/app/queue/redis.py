from functools import lru_cache

from redis import Redis

from app.core.config import get_settings


@lru_cache
def get_redis() -> Redis:
    settings = get_settings()
    # Bounded timeouts so a Redis outage fails fast (health checks, rate
    # limiter, enqueue) instead of hanging a request or worker.
    return Redis.from_url(
        settings.redis_url,
        socket_connect_timeout=3,
        socket_timeout=5,
        health_check_interval=30,
    )
