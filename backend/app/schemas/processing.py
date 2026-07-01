from datetime import datetime

from pydantic import BaseModel

from app.models.enums import MeetingStatus, ProcessingJobStatus
from app.schemas.common import ORMModel


class ProcessResponse(BaseModel):
    meeting_id: int
    status: MeetingStatus
    job_id: str
    progress_current: int
    progress_total: int


class ProcessingJobRead(ORMModel):
    id: int
    meeting_id: int
    job_id: str
    status: ProcessingJobStatus
    progress_current: int
    progress_total: int
    error_message: str | None = None
    created_at: datetime

