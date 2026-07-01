import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from redis.exceptions import RedisError
from rq.exceptions import NoSuchJobError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import conflict, not_found, service_unavailable
from app.models.enums import MeetingStatus, ProcessingJobStatus
from app.models.processing_job import ProcessingJob
from app.models.user import User
from app.queue.jobs import process_meeting_job
from app.queue.rq import default_enqueue_kwargs, get_queue
from app.repositories.meeting_repository import MeetingRepository
from app.services.meeting_service import MeetingService
from app.services.permission_service import PermissionService

logger = logging.getLogger(__name__)


IN_PROGRESS_STATUSES = {
    MeetingStatus.queued,
    MeetingStatus.processing,
    MeetingStatus.validating,
}

ACTIVE_JOB_STATUSES = [
    ProcessingJobStatus.queued,
    ProcessingJobStatus.processing,
    ProcessingJobStatus.validating,
]


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

        # Release any orphaned job before deciding whether a run is in progress,
        # so a crashed worker cannot permanently block reprocessing.
        self._reap_stuck_job(meeting)

        if meeting.status in IN_PROGRESS_STATUSES:
            existing = self.current_job(meeting_id)
            raise conflict(
                f"Meeting is already being processed. job_id={existing.job_id if existing else None}"
            )

        # A normal process request will not silently redo a finished meeting;
        # reprocessing a completed meeting must go through the retry endpoint.
        if not retry and meeting.status == MeetingStatus.completed:
            raise conflict("Meeting is already processed. Use retry to reprocess.")

        self.meeting_service.ensure_processable_input(meeting)

        settings = get_settings()
        job_id = f"local-{uuid4().hex}" if not settings.ai_worker_enabled else uuid4().hex

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
        # Commit the row *before* enqueuing so the worker can never dequeue and
        # look up a ProcessingJob that has not been persisted yet.
        self.db.commit()
        self.db.refresh(processing_job)

        if settings.ai_worker_enabled:
            try:
                get_queue().enqueue(
                    process_meeting_job,
                    meeting_id,
                    job_id=job_id,
                    **default_enqueue_kwargs(),
                )
            except (RedisError, NoSuchJobError, OSError) as error:
                logger.exception("Failed to enqueue AI job for meeting %s", meeting_id)
                # The queued row is already committed; mark it failed so the
                # meeting is retryable rather than stuck in "queued" forever.
                processing_job.status = ProcessingJobStatus.failed
                processing_job.error_message = f"enqueue failed: {error}"
                processing_job.finished_at = datetime.now(timezone.utc)
                meeting.status = MeetingStatus.failed
                meeting.error_message = "AI 작업 큐에 등록하지 못했습니다. 잠시 후 다시 시도하세요."
                self.db.commit()
                raise service_unavailable(f"Failed to enqueue AI job: {error}") from error

        logger.info("Enqueued processing job %s for meeting %s", job_id, meeting_id)
        return processing_job

    def current_job(self, meeting_id: int) -> ProcessingJob | None:
        return self.db.scalar(
            select(ProcessingJob)
            .where(
                ProcessingJob.meeting_id == meeting_id,
                ProcessingJob.status.in_(ACTIVE_JOB_STATUSES),
            )
            .order_by(ProcessingJob.created_at.desc())
        )

    def latest_job(self, meeting_id: int) -> ProcessingJob | None:
        return self.db.scalar(
            select(ProcessingJob)
            .where(ProcessingJob.meeting_id == meeting_id)
            .order_by(ProcessingJob.created_at.desc())
        )

    def list_recent_jobs(self, limit: int = 100) -> list[ProcessingJob]:
        return list(
            self.db.scalars(
                select(ProcessingJob).order_by(ProcessingJob.created_at.desc()).limit(limit)
            )
        )

    def _reap_stuck_job(self, meeting) -> bool:
        """Fail an active job (and its meeting) that has exceeded the timeout.

        This reconciles state when a worker dies mid-run: RQ kills the process
        so ``ResultWriter.fail`` never runs, leaving the row active forever.
        """
        job = self.current_job(meeting.id)
        if not job:
            return False

        settings = get_settings()
        reference = job.started_at or job.created_at
        if reference is None:
            return False
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)

        age = datetime.now(timezone.utc) - reference
        if age <= timedelta(seconds=settings.stuck_job_timeout_seconds):
            return False

        now = datetime.now(timezone.utc)
        message = (
            f"작업이 시간 초과(>{settings.stuck_job_timeout_seconds}s)로 중단된 것으로 "
            "판단되어 실패 처리했습니다."
        )
        job.status = ProcessingJobStatus.failed
        job.error_message = message
        job.finished_at = now
        meeting.status = MeetingStatus.failed
        meeting.error_message = message
        self.db.commit()
        logger.warning(
            "Reaped stuck job %s for meeting %s (age=%ss)",
            job.job_id,
            meeting.id,
            int(age.total_seconds()),
        )
        return True

    def reap_meeting(self, meeting_id: int) -> None:
        """Public entry point used by status reads to release orphaned jobs."""
        meeting = self.meetings.get(meeting_id)
        if meeting:
            self._reap_stuck_job(meeting)
