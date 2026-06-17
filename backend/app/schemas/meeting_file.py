from datetime import datetime

from pydantic import BaseModel

from app.models.enums import FileType
from app.schemas.common import ORMModel


class LocalFileMetadata(BaseModel):
    file_type: FileType
    local_source_path: str
    original_filename: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    duration_ms: int | None = None


class MeetingFileRead(ORMModel):
    id: int
    meeting_id: int
    file_type: FileType
    original_filename: str | None = None
    stored_filename: str | None = None
    storage_path: str | None = None
    local_source_path: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    duration_ms: int | None = None
    uploaded_by: int | None = None
    created_at: datetime

