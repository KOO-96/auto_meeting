from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class TimelineMemoCreate(BaseModel):
    timestamp_ms: int
    audio_elapsed_ms: int | None = None
    screen_elapsed_ms: int | None = None
    memo: str
    created_at: datetime | None = None
    created_by: int | None = None


class TimelineMemoUpdate(BaseModel):
    timestamp_ms: int | None = None
    audio_elapsed_ms: int | None = None
    screen_elapsed_ms: int | None = None
    memo: str | None = None


class TimelineMemoRead(ORMModel):
    id: int
    meeting_id: int
    author_id: int
    timestamp_ms: int
    audio_elapsed_ms: int | None = None
    screen_elapsed_ms: int | None = None
    memo: str
    created_at: datetime
    updated_at: datetime

