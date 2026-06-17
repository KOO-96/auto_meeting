from uuid import uuid4

from redis.exceptions import RedisError
from rq.exceptions import NoSuchJobError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import conflict, not_found
from app.models.enums import MeetingStatus, ProcessingJobStatus
from app.models.processing_job import ProcessingJob
from app.models.user import User
from app.queue.jobs import process_meeting_job
from app.queue.rq import get_queue
from app.repositories.meeting_repository import MeetingRepository
from app.services.meeting_service import MeetingService
from app.services.permission_service import PermissionService


IN_PROGRESS_STATUSES = {
    MeetingStatus.queued,
    MeetingStatus.processing,
    MeetingStatus.validating,
}


class ProcessingService:
    def __init__(self, db: Session):
        self.db = db
        self.meetings = MeetingRepository(db)
        self.permissions = PermissionService(self.meetings)
        self.meeting_service = MeetingService(db)

    def process(self, meeting_id: int, user: User, retry: bool = False) -> ProcessingJob:
        meeting = self.meetings.get(meeting_id)
        if not meeting:
            raise not_found("Meeting not found.")
        self.permissions.require_meeting_access(meeting, user)

        if meeting.status in IN_PROGRESS_STATUSES:
            existing = self.current_job(meeting_id)
            raise conflict(
                f"Meeting is already being processed. job_id={existing.job_id if existing else None}"
            )

        if retry and meeting.status != MeetingStatus.failed:
            # Reprocessing completed/metadata_saved meetings is useful during MVP, so only
            # actively reject in-progress states above.
            pass

        self.meeting_service.ensure_processable_input(meeting)

        settings = get_settings()
        if settings.ai_worker_enabled:
            try:
                rq_job = get_queue().enqueue(process_meeting_job, meeting_id)
                job_id = rq_job.id
            except (RedisError, NoSuchJobError, OSError) as error:
                raise conflict(f"Failed to enqueue AI job: {error}") from error
        else:
            job_id = f"local-{uuid4().hex}"

        processing_job = ProcessingJob(
            meeting_id=meeting_id,
            job_id=job_id,
            status=ProcessingJobStatus.queued,
            progress_current=0,
            progress_total=5,
        )
        meeting.status = MeetingStatus.queued
        meeting.progress_current = 0
        meeting.progress_total = 5
        meeting.error_message = None
        self.db.add(processing_job)
        self.db.commit()
        self.db.refresh(processing_job)
        return processing_job

    def current_job(self, meeting_id: int) -> ProcessingJob | None:
        return self.db.scalar(
            select(ProcessingJob)
            .where(
                ProcessingJob.meeting_id == meeting_id,
                ProcessingJob.status.in_(
                    [
                        ProcessingJobStatus.queued,
                        ProcessingJobStatus.processing,
                        ProcessingJobStatus.validating,
                    ]
                ),
            )
            .order_by(ProcessingJob.created_at.desc())
        )

