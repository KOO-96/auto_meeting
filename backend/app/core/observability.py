import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def init_sentry() -> bool:
    """Initialize Sentry if a DSN is configured and sentry-sdk is installed.

    Returns True when initialized. sentry-sdk is an optional dependency, so a
    missing package is a no-op rather than an error.
    """
    settings = get_settings()
    if not settings.sentry_dsn:
        return False

    try:
        import sentry_sdk
    except ImportError:
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed; skipping.")
        return False

    sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.app_env)
    logger.info("Sentry initialized (env=%s)", settings.app_env)
    return True
