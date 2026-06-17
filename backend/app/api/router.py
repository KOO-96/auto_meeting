from fastapi import APIRouter

from app.api.routes import (
    auth,
    exports,
    meeting_files,
    meeting_series,
    meetings,
    participants,
    processing,
    projects,
    search,
    timeline_memos,
)


api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(participants.router)
api_router.include_router(projects.router)
api_router.include_router(meeting_series.router)
api_router.include_router(meetings.router)
api_router.include_router(meeting_files.router)
api_router.include_router(timeline_memos.router)
api_router.include_router(processing.router)
api_router.include_router(exports.router)
api_router.include_router(search.router)

