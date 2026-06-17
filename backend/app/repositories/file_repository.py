from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.meeting_file import MeetingFile


class FileRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_by_meeting(self, meeting_id: int) -> list[MeetingFile]:
        return list(
            self.db.scalars(
                select(MeetingFile)
                .where(MeetingFile.meeting_id == meeting_id)
                .order_by(MeetingFile.created_at.desc())
            )
        )

    def get_for_meeting(self, meeting_id: int, file_id: int) -> MeetingFile | None:
        return self.db.scalar(
            select(MeetingFile).where(
                MeetingFile.meeting_id == meeting_id,
                MeetingFile.id == file_id,
            )
        )

