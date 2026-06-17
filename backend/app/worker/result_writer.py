from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import (
    ImageType,
    MeetingStatus,
    MeetingType,
    ProcessingJobStatus,
    TranscriptType,
)
from app.models.meeting import Meeting
from app.models.meeting_analysis import MeetingAnalysis
from app.models.meeting_transcript import MeetingTranscript
from app.models.meeting_visual_analysis import MeetingVisualAnalysis
from app.models.processing_job import ProcessingJob


class ResultWriter:
    def __init__(self, db: Session):
        self.db = db

    def update_progress(
        self,
        meeting: Meeting,
        job: ProcessingJob,
        status: ProcessingJobStatus,
        step: int,
    ) -> None:
        job.status = status
        job.progress_current = step
        meeting.status = MeetingStatus(status.value)
        meeting.progress_current = step
        meeting.progress_total = 5
        if status == ProcessingJobStatus.processing and not job.started_at:
            job.started_at = datetime.now(timezone.utc)
        self.db.commit()

    def save_transcript(self, meeting_id: int, content: str, segments: list[dict]) -> None:
        self.db.add(
            MeetingTranscript(
                meeting_id=meeting_id,
                transcript_type=TranscriptType.merged,
                content=content,
                segments=segments,
            )
        )

    def save_visual_analysis(
        self,
        meeting_id: int,
        payload: dict,
        source_file_id: int | None = None,
        image_path: str | None = None,
    ) -> None:
        try:
            image_type = ImageType(payload.get("image_type", ImageType.unknown))
        except ValueError:
            image_type = ImageType.unknown

        self.db.add(
            MeetingVisualAnalysis(
                meeting_id=meeting_id,
                source_file_id=source_file_id,
                image_path=image_path,
                image_type=image_type,
                summary=payload.get("summary"),
                detected_text=payload.get("detected_text") or [],
                keywords=payload.get("keywords") or [],
            )
        )

    def save_analysis(self, meeting_id: int, payload: dict) -> None:
        existing = self.db.scalar(
            select(MeetingAnalysis)
            .where(MeetingAnalysis.meeting_id == meeting_id)
            .order_by(MeetingAnalysis.created_at.desc())
        )
        if existing:
            self.db.delete(existing)
            self.db.flush()

        self.db.add(
            MeetingAnalysis(
                meeting_id=meeting_id,
                meeting_type=MeetingType.general_meeting,
                **payload,
            )
        )

    def complete(self, meeting: Meeting, job: ProcessingJob) -> None:
        now = datetime.now(timezone.utc)
        meeting.status = MeetingStatus.completed
        meeting.progress_current = 5
        meeting.progress_total = 5
        meeting.error_message = None
        job.status = ProcessingJobStatus.completed
        job.progress_current = 5
        job.finished_at = now
        self.db.commit()

    def fail(self, meeting: Meeting, job: ProcessingJob, message: str) -> None:
        now = datetime.now(timezone.utc)
        meeting.status = MeetingStatus.failed
        meeting.error_message = message
        job.status = ProcessingJobStatus.failed
        job.error_message = message
        job.finished_at = now
        self.db.commit()
