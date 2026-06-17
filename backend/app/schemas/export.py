from datetime import datetime

from pydantic import BaseModel

from app.models.enums import ExportType
from app.schemas.common import ORMModel


class ExportCreate(BaseModel):
    export_type: ExportType


class ExportCreateResponse(BaseModel):
    export_id: int
    export_type: ExportType
    download_url: str


class ExportFileRead(ORMModel):
    id: int
    meeting_id: int
    export_type: ExportType
    stored_filename: str
    storage_path: str
    created_by: int
    created_at: datetime

