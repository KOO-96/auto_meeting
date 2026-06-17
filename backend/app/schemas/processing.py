from pydantic import BaseModel

from app.models.enums import MeetingStatus


class ProcessResponse(BaseModel):
    meeting_id: int
    status: MeetingStatus
    job_id: str
    progress_current: int
    progress_total: int

