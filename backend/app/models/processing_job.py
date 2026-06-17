from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ProcessingJobStatus
from app.models.mixins import TimestampMixin


class ProcessingJob(TimestampMixin, Base):
    __tablename__ = "processing_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    status: Mapped[ProcessingJobStatus] = mapped_column(
        Enum(ProcessingJobStatus),
        default=ProcessingJobStatus.queued,
        nullable=False,
        index=True,
    )
    progress_current: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress_total: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

