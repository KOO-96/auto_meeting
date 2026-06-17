from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class MeetingSeriesCreate(BaseModel):
    project_id: int | None = None
    title: str
    description: str | None = None


class MeetingSeriesUpdate(BaseModel):
    project_id: int | None = None
    title: str | None = None
    description: str | None = None


class MeetingSeriesRead(ORMModel):
    id: int
    project_id: int | None = None
    title: str
    description: str | None = None
    created_by: int
    created_at: datetime
    updated_at: datetime

