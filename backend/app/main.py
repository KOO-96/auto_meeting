import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from fastapi.responses import PlainTextResponse

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging, request_id_var
from app.core.observability import init_sentry
from app.db.session import SessionLocal
from app.queue.redis import get_redis

logger = logging.getLogger("company_brain")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.export_dir.mkdir(parents=True, exist_ok=True)
    yield


def _check_database() -> bool:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001 - health probe must not raise.
        logger.exception("Database health check failed")
        return False


def _check_redis() -> bool:
    try:
        return bool(get_redis().ping())
    except Exception:  # noqa: BLE001 - health probe must not raise.
        logger.exception("Redis health check failed")
        return False


def create_app() -> FastAPI:
    configure_logging()
    init_sentry()
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid4().hex
        token = request_id_var.set(request_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "%s %s -> %s (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        response.headers["X-Request-ID"] = request_id
        return response

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error.",
                "request_id": request_id_var.get() or "-",
            },
        )

    @app.get("/health/live")
    def liveness() -> dict[str, str]:
        # Liveness: the process is up. Does not touch dependencies.
        return {"status": "ok"}

    def _readiness() -> tuple[bool, dict[str, str]]:
        settings = get_settings()
        db_ok = _check_database()
        redis_ok = _check_redis()
        # Redis is only required when the async worker is enabled.
        healthy = db_ok and (redis_ok or not settings.ai_worker_enabled)
        checks = {
            "database": "ok" if db_ok else "down",
            "redis": "ok" if redis_ok else "down",
        }
        return healthy, checks

    def _readiness_response() -> JSONResponse:
        healthy, checks = _readiness()
        return JSONResponse(
            status_code=200 if healthy else 503,
            content={"status": "ok" if healthy else "degraded", "checks": checks},
        )

    @app.get("/health")
    def health() -> JSONResponse:
        return _readiness_response()

    @app.get("/health/ready")
    def readiness() -> JSONResponse:
        # Readiness: dependencies reachable. Same deep check as /health.
        return _readiness_response()

    @app.get("/metrics")
    def metrics() -> PlainTextResponse:
        # Minimal Prometheus text exposition (no extra dependency).
        healthy, checks = _readiness()
        lines = [
            "# HELP app_up Application liveness (always 1 while serving).",
            "# TYPE app_up gauge",
            "app_up 1",
            "# HELP app_ready Application readiness (dependencies reachable).",
            "# TYPE app_ready gauge",
            f"app_ready {1 if healthy else 0}",
            "# HELP app_dependency_up Per-dependency health (1=ok, 0=down).",
            "# TYPE app_dependency_up gauge",
            f'app_dependency_up{{dependency="database"}} {1 if checks["database"] == "ok" else 0}',
            f'app_dependency_up{{dependency="redis"}} {1 if checks["redis"] == "ok" else 0}',
        ]
        return PlainTextResponse("\n".join(lines) + "\n")

    app.include_router(api_router)
    return app


app = create_app()
