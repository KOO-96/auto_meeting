from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.enums import FileType
from app.models.user import User
from app.schemas.meeting_file import MeetingFileRead
from app.services.file_service import FileService


router = APIRouter(prefix="/meetings/{meeting_id}/files", tags=["meeting-files"])


@router.post("", response_model=MeetingFileRead)
async def upload_file(
    meeting_id: int,
    file_type: FileType,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    return await FileService(db).upload(meeting_id, file_type, file, current_user)


@router.get("", response_model=list[MeetingFileRead])
def list_files(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return FileService(db).list_files(meeting_id, current_user)


@router.get("/{file_id}/download")
def download_file(
    meeting_id: int,
    file_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    file = FileService(db).get_download_file(meeting_id, file_id, current_user)
    # Force download (attachment) so a client-supplied MIME type can never be
    # rendered inline in a browser context.
    return FileResponse(
        file.storage_path,
        media_type=file.mime_type or "application/octet-stream",
        filename=file.original_filename or Path(file.storage_path).name,
        content_disposition_type="attachment",
    )


@router.delete("/{file_id}")
def delete_file(
    meeting_id: int,
    file_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    FileService(db).delete(meeting_id, file_id, current_user)
    return {"message": "file deleted"}

