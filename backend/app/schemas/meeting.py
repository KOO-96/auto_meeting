from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import MeetingStatus, RoleInMeeting
from app.schemas.meeting_file import MeetingFileRead
from app.schemas.common import ORMModel


class MeetingCreate(BaseModel):
    title: str
    meeting_date: date
    project_id: int | None = None
    series_id: int | None = None
    project_name: str | None = None
    meeting_series: str | None = None
    participant_ids: list[int] = Field(default_factory=list)
    participants_only: bool = True
    additional_memo: str | None = None


class MeetingUpdate(BaseModel):
    title: str | None = None
    meeting_date: date | None = None
    project_id: int | None = None
    series_id: int | None = None
    participants_only: bool | None = None
    additional_memo: str | None = None
    participant_ids: list[int] | None = None


class MeetingFinishRequest(BaseModel):
    local_base_path: str
    screen_file_path: str | None = None
    audio_file_path: str | None = None
    memo_file_path: str | None = None
    metadata_file_path: str | None = None
    attachment_paths: list[str] = Field(default_factory=list)
    finished_at: datetime | None = None


class MeetingCreatedResponse(BaseModel):
    meeting_id: int
    status: MeetingStatus


class MeetingStatusResponse(BaseModel):
    meeting_id: int
    status: MeetingStatus
    current_step: int
    total_steps: int
    message: str
    error_message: str | None = None


class MeetingParticipantRead(ORMModel):
    id: int
    meeting_id: int
    user_id: int
    role_in_meeting: RoleInMeeting
    created_at: datetime


class MeetingRead(ORMModel):
    id: int
    title: str
    meeting_date: date
    project_id: int | None = None
    series_id: int | None = None
    owner_id: int
    participants_only: bool
    status: MeetingStatus
    progress_current: int
    progress_total: int
    error_message: str | None = None
    additional_memo: str | None = None
    local_base_path: str | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    participants: list[MeetingParticipantRead] = Field(default_factory=list)
    files: list[MeetingFileRead] = Field(default_factory=list)
