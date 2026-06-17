from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import bad_request, conflict, not_found
from app.models.enums import FileType, MeetingStatus, RoleInMeeting
from app.models.meeting import Meeting
from app.models.meeting_file import MeetingFile
from app.models.meeting_participant import MeetingParticipant
from app.models.user import User
from app.repositories.meeting_repository import MeetingRepository
from app.schemas.meeting import MeetingCreate, MeetingFinishRequest, MeetingUpdate
from app.services.permission_service import PermissionService


class MeetingService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = MeetingRepository(db)
        self.permissions = PermissionService(self.repository)

    def get_accessible(self, meeting_id: int, user: User) -> Meeting:
        meeting = self.repository.get(meeting_id)
        if not meeting:
            raise not_found("Meeting not found.")
        self.permissions.require_meeting_access(meeting, user)
        return meeting

    def list_accessible(self, user: User) -> list[Meeting]:
        meetings = self.repository.list_all()
        return [meeting for meeting in meetings if self.permissions.can_access_meeting(meeting, user)]

    def create(self, payload: MeetingCreate, user: User) -> Meeting:
        meeting = Meeting(
            title=payload.title,
            meeting_date=payload.meeting_date,
            project_id=payload.project_id,
            series_id=payload.series_id,
            owner_id=user.id,
            participants_only=payload.participants_only,
            status=MeetingStatus.draft,
            additional_memo=payload.additional_memo,
        )
        self.db.add(meeting)
        self.db.flush()

        participant_ids = list(dict.fromkeys([user.id, *payload.participant_ids]))
        for participant_id in participant_ids:
            self.db.add(
                MeetingParticipant(
                    meeting_id=meeting.id,
                    user_id=participant_id,
                    role_in_meeting=(
                        RoleInMeeting.host if participant_id == user.id else RoleInMeeting.participant
                    ),
                )
            )

        self.db.commit()
        return self.repository.get(meeting.id) or meeting

    def update(self, meeting_id: int, payload: MeetingUpdate, user: User) -> Meeting:
        meeting = self.get_accessible(meeting_id, user)

        for key, value in payload.model_dump(exclude_unset=True, exclude={"participant_ids"}).items():
            setattr(meeting, key, value)

        if payload.participant_ids is not None:
            meeting.participants.clear()
            self.db.flush()
            ids = list(dict.fromkeys([meeting.owner_id, *payload.participant_ids]))
            for participant_id in ids:
                self.db.add(
                    MeetingParticipant(
                        meeting_id=meeting.id,
                        user_id=participant_id,
                        role_in_meeting=(
                            RoleInMeeting.host
                            if participant_id == meeting.owner_id
                            else RoleInMeeting.participant
                        ),
                    )
                )

        self.db.commit()
        return self.repository.get(meeting.id) or meeting

    def delete(self, meeting_id: int, user: User) -> None:
        meeting = self.get_accessible(meeting_id, user)
        self.db.delete(meeting)
        self.db.commit()

    def start(self, meeting_id: int, user: User) -> Meeting:
        meeting = self.get_accessible(meeting_id, user)

        if meeting.status not in {MeetingStatus.draft, MeetingStatus.metadata_saved}:
            raise conflict(f"Cannot start meeting from status {meeting.status}.")

        meeting.status = MeetingStatus.recording
        meeting.started_at = datetime.now(timezone.utc)
        self.db.commit()
        return self.repository.get(meeting.id) or meeting

    def finish(self, meeting_id: int, payload: MeetingFinishRequest, user: User) -> Meeting:
        meeting = self.get_accessible(meeting_id, user)

        if meeting.status not in {MeetingStatus.draft, MeetingStatus.recording}:
            raise conflict(f"Cannot finish meeting from status {meeting.status}.")

        meeting.local_base_path = payload.local_base_path
        meeting.finished_at = payload.finished_at or datetime.now(timezone.utc)
        meeting.status = MeetingStatus.metadata_saved
        meeting.error_message = None

        self._upsert_local_file(
            meeting.id,
            FileType.screen_recording,
            payload.screen_file_path,
            "screen.webm",
        )
        self._upsert_local_file(meeting.id, FileType.audio, payload.audio_file_path, "audio.webm")
        self._upsert_local_file(
            meeting.id,
            FileType.memo_json,
            payload.memo_file_path,
            "timeline_memos.json",
        )
        self._upsert_local_file(
            meeting.id,
            FileType.metadata_json,
            payload.metadata_file_path,
            "meeting_session.json",
        )

        for attachment_path in payload.attachment_paths:
            self.db.add(
                MeetingFile(
                    meeting_id=meeting.id,
                    file_type=FileType.attachment,
                    original_filename=attachment_path.rsplit("/", 1)[-1],
                    local_source_path=attachment_path,
                )
            )

        self.db.commit()
        return self.repository.get(meeting.id) or meeting

    def _upsert_local_file(
        self,
        meeting_id: int,
        file_type: FileType,
        local_path: str | None,
        filename: str,
    ) -> None:
        if not local_path:
            return

        existing = next(
            (
                file
                for file in self.repository.get(meeting_id).files
                if file.file_type == file_type and file.storage_path is None
            ),
            None,
        )

        if existing:
            existing.local_source_path = local_path
            existing.original_filename = filename
            return

        self.db.add(
            MeetingFile(
                meeting_id=meeting_id,
                file_type=file_type,
                original_filename=filename,
                local_source_path=local_path,
                storage_path=None,
            )
        )

    def ensure_processable_input(self, meeting: Meeting) -> None:
        processable = {
            FileType.audio,
            FileType.screen_recording,
            FileType.memo_json,
            FileType.image,
            FileType.document,
            FileType.attachment,
        }
        if not any(file.file_type in processable for file in meeting.files):
            raise bad_request("No processable meeting input is available.")

