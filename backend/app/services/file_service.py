from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import bad_request, not_found
from app.models.enums import FileType
from app.models.meeting_file import MeetingFile
from app.models.user import User
from app.repositories.file_repository import FileRepository
from app.repositories.meeting_repository import MeetingRepository
from app.services.permission_service import PermissionService


FILE_DIRS: dict[FileType, str] = {
    FileType.audio: "audio",
    FileType.screen_recording: "screen",
    FileType.memo_json: "memos",
    FileType.metadata_json: "metadata",
    FileType.image: "images",
    FileType.document: "attachments",
    FileType.attachment: "attachments",
}

UPLOAD_CHUNK_BYTES = 1024 * 1024

# Magic-byte validators for extensions that can carry active/mismatched content.
# Extensions not listed here (json/txt/md/office docs) are not byte-sniffed.
_MAGIC_CHECKS = {
    ".png": lambda h: h.startswith(b"\x89PNG\r\n\x1a\n"),
    ".jpg": lambda h: h.startswith(b"\xff\xd8\xff"),
    ".jpeg": lambda h: h.startswith(b"\xff\xd8\xff"),
    ".gif": lambda h: h.startswith((b"GIF87a", b"GIF89a")),
    ".webp": lambda h: h[:4] == b"RIFF" and h[8:12] == b"WEBP",
    ".pdf": lambda h: h.startswith(b"%PDF-"),
    ".webm": lambda h: h.startswith(b"\x1aE\xdf\xa3"),
    ".wav": lambda h: h[:4] == b"RIFF" and h[8:12] == b"WAVE",
    ".mp3": lambda h: h.startswith(b"ID3") or (len(h) >= 2 and h[0] == 0xFF and (h[1] & 0xE0) == 0xE0),
    ".m4a": lambda h: h[4:8] == b"ftyp",
}


def _content_matches_extension(ext: str, head: bytes) -> bool:
    check = _MAGIC_CHECKS.get(ext)
    return check(head) if check else True


ALLOWED_EXTENSIONS = {
    ".webm",
    ".wav",
    ".m4a",
    ".mp3",
    ".json",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".md",
}


class FileService:
    def __init__(self, db: Session):
        self.db = db
        self.files = FileRepository(db)
        self.meetings = MeetingRepository(db)
        self.permissions = PermissionService(self.meetings)

    def list_files(self, meeting_id: int, user: User) -> list[MeetingFile]:
        meeting = self.meetings.get(meeting_id)
        if not meeting:
            raise not_found("Meeting not found.")
        self.permissions.require_meeting_access(meeting, user)
        return self.files.list_by_meeting(meeting_id)

    async def upload(self, meeting_id: int, file_type: FileType, upload: UploadFile, user: User) -> MeetingFile:
        settings = get_settings()
        meeting = self.meetings.get(meeting_id)
        if not meeting:
            raise not_found("Meeting not found.")
        # Anyone with access to the meeting (admin, owner, or participant) may upload.
        self.permissions.require_meeting_access(meeting, user)

        original = upload.filename or "upload.bin"
        ext = Path(original).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise bad_request(f"Unsupported file extension: {ext}")

        stored_filename = f"{uuid4().hex}{ext}"
        target_dir = settings.upload_dir / "meetings" / str(meeting_id) / FILE_DIRS[file_type]
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / stored_filename

        # Stream to disk in chunks, enforcing the size limit up front (never
        # buffer the whole body in memory), and sniff the first bytes so a
        # declared image/pdf/media extension must match its real content.
        size = 0
        first_chunk = await upload.read(UPLOAD_CHUNK_BYTES)
        if not _content_matches_extension(ext, first_chunk):
            raise bad_request("File content does not match its extension.")

        try:
            with target_path.open("wb") as handle:
                chunk = first_chunk
                while chunk:
                    size += len(chunk)
                    if size > settings.max_upload_size_bytes:
                        raise bad_request("File size exceeds MAX_UPLOAD_SIZE_MB.")
                    handle.write(chunk)
                    chunk = await upload.read(UPLOAD_CHUNK_BYTES)
        except Exception:
            # Never leave a partial/oversized file on disk.
            target_path.unlink(missing_ok=True)
            raise

        record = MeetingFile(
            meeting_id=meeting_id,
            file_type=file_type,
            original_filename=original,
            stored_filename=stored_filename,
            storage_path=str(target_path),
            mime_type=upload.content_type,
            size_bytes=size,
            uploaded_by=user.id,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_download_file(self, meeting_id: int, file_id: int, user: User) -> MeetingFile:
        meeting = self.meetings.get(meeting_id)
        if not meeting:
            raise not_found("Meeting not found.")
        self.permissions.require_meeting_access(meeting, user)

        file = self.files.get_for_meeting(meeting_id, file_id)
        if not file or not file.storage_path:
            raise not_found("Uploaded file not found.")
        return file

    def delete(self, meeting_id: int, file_id: int, user: User) -> None:
        meeting = self.meetings.get(meeting_id)
        if not meeting:
            raise not_found("Meeting not found.")
        self.permissions.require_meeting_access(meeting, user)
        file = self.files.get_for_meeting(meeting_id, file_id)
        if not file:
            raise not_found("File not found.")
        self.db.delete(file)
        self.db.commit()

