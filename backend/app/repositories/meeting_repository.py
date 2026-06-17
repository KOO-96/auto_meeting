from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.meeting import Meeting
from app.models.meeting_participant import MeetingParticipant


class MeetingRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, meeting_id: int) -> Meeting | None:
        return self.db.scalar(
            select(Meeting)
            .where(Meeting.id == meeting_id)
            .options(
                selectinload(Meeting.participants),
                selectinload(Meeting.files),
                selectinload(Meeting.memos),
                selectinload(Meeting.project),
                selectinload(Meeting.series),
            )
        )

    def list_all(self) -> list[Meeting]:
        return list(
            self.db.scalars(
                select(Meeting)
                .options(
                    selectinload(Meeting.participants),
                    selectinload(Meeting.files),
                    selectinload(Meeting.project),
                    selectinload(Meeting.series),
                )
                .order_by(Meeting.created_at.desc())
            )
        )

    def user_is_participant(self, meeting_id: int, user_id: int) -> bool:
        return (
            self.db.scalar(
                select(MeetingParticipant.id).where(
                    MeetingParticipant.meeting_id == meeting_id,
                    MeetingParticipant.user_id == user_id,
                )
            )
            is not None
        )
