from app.core.exceptions import forbidden
from app.models.enums import UserRole
from app.models.meeting import Meeting
from app.models.user import User
from app.repositories.meeting_repository import MeetingRepository


class PermissionService:
    def __init__(self, meeting_repository: MeetingRepository):
        self.meetings = meeting_repository

    def can_access_meeting(self, meeting: Meeting, user: User) -> bool:
        if user.role == UserRole.admin:
            return True
        if meeting.owner_id == user.id:
            return True
        if not meeting.participants_only:
            return True
        return self.meetings.user_is_participant(meeting.id, user.id)

    def require_meeting_access(self, meeting: Meeting, user: User) -> None:
        if not self.can_access_meeting(meeting, user):
            raise forbidden("Meeting access denied.")

    def require_admin(self, user: User) -> None:
        if user.role != UserRole.admin:
            raise forbidden("Admin permission is required.")

