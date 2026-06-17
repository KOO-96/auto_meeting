from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.export import ExportCreate, ExportCreateResponse, ExportFileRead
from app.services.export_service import ExportService


router = APIRouter(prefix="/meetings/{meeting_id}/exports", tags=["exports"])


@router.post("", response_model=ExportCreateResponse)
def create_export(
    meeting_id: int,
    payload: ExportCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    export = ExportService(db).create(meeting_id, payload.export_type, current_user)
    return ExportCreateResponse(
        export_id=export.id,
        export_type=export.export_type,
        download_url=f"/api/meetings/{meeting_id}/exports/{export.id}/download",
    )


@router.get("", response_model=list[ExportFileRead])
def list_exports(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return ExportService(db).list(meeting_id, current_user)


@router.get("/{export_id}/download")
def download_export(
    meeting_id: int,
    export_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    export = ExportService(db).get_download(meeting_id, export_id, current_user)
    return FileResponse(
        export.storage_path,
        filename=Path(export.storage_path).name,
    )

