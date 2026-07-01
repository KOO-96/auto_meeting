import logging
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request
from redis.exceptions import RedisError

from app.core.config import get_settings
from app.core.exceptions import too_many_requests
from app.queue.redis import get_redis

logger = logging.getLogger(__name__)


class FixedWindowRateLimiter:
    """Fixed-window rate limiter.

    Uses Redis (INCR + EXPIRE) so the limit is shared across processes; falls
    back to a per-process in-memory window if Redis is unavailable, so a Redis
    outage degrades protection rather than breaking login entirely.
    """

    def __init__(self) -> None:
        self._local: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        try:
            redis = get_redis()
            redis_key = f"ratelimit:{key}"
            count = redis.incr(redis_key)
            if count == 1:
                redis.expire(redis_key, window_seconds)
            return count <= max_attempts
        except (RedisError, OSError) as error:
            logger.warning("Rate limiter falling back to in-memory: %s", error)
            return self._allow_local(key, max_attempts, window_seconds)

    def _allow_local(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        now = time.monotonic()
        with self._lock:
            window = self._local[key]
            cutoff = now - window_seconds
            while window and window[0] <= cutoff:
                window.popleft()
            if len(window) >= max_attempts:
                return False
            window.append(now)
            return True


_limiter = FixedWindowRateLimiter()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def login_rate_limit(request: Request) -> None:
    """FastAPI dependency: throttle login attempts per client IP."""
    settings = get_settings()
    key = f"login:{_client_ip(request)}"
    if not _limiter.allow(
        key,
        settings.login_rate_limit_max_attempts,
        settings.login_rate_limit_window_seconds,
    ):
        logger.warning("Login rate limit exceeded for %s", key)
        raise too_many_requests("Too many login attempts. Please try again later.")
