from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.meeting import Meeting
from app.models.meeting_analysis import MeetingAnalysis
from app.models.meeting_participant import MeetingParticipant
from app.models.timeline_memo import TimelineMemo
from app.models.user import User
from app.repositories.meeting_repository import MeetingRepository
from app.services.permission_service import PermissionService


class SearchService:
    def __init__(self, db: Session):
        self.db = db
        self.meetings = MeetingRepository(db)
        self.permissions = PermissionService(self.meetings)

    def search_meetings(
        self,
        user: User,
        q: str | None = None,
        status: str | None = None,
        project_id: int | None = None,
        series_id: int | None = None,
        participant_id: int | None = None,
        page: int = 1,
        size: int = 20,
    ) -> list[Meeting]:
        statement = select(Meeting).options(selectinload(Meeting.participants), selectinload(Meeting.files))

        if status:
            statement = statement.where(Meeting.status == status)
        if project_id:
            statement = statement.where(Meeting.project_id == project_id)
        if series_id:
            statement = statement.where(Meeting.series_id == series_id)

        if q:
            pattern = f"%{q}%"
            memo_meeting_ids = select(TimelineMemo.meeting_id).where(TimelineMemo.memo.ilike(pattern))
            analysis_meeting_ids = select(MeetingAnalysis.meeting_id).where(
                or_(
                    MeetingAnalysis.one_line_summary.ilike(pattern),
                    MeetingAnalysis.detailed_summary.ilike(pattern),
                )
            )
            statement = statement.where(
                or_(
                    Meeting.title.ilike(pattern),
                    Meeting.additional_memo.ilike(pattern),
                    Meeting.id.in_(memo_meeting_ids),
                    Meeting.id.in_(analysis_meeting_ids),
                )
            )

        if participant_id:
            statement = statement.join(MeetingParticipant).where(
                MeetingParticipant.user_id == participant_id
            )

        statement = statement.order_by(Meeting.created_at.desc()).offset((page - 1) * size).limit(size)
        meetings = list(self.db.scalars(statement))
        return [meeting for meeting in meetings if self.permissions.can_access_meeting(meeting, user)]
