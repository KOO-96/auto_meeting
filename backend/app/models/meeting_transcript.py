from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import TranscriptType
from app.models.mixins import utc_now


class MeetingTranscript(Base):
    __tablename__ = "meeting_transcripts"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    source_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("meeting_files.id", ondelete="SET NULL"),
    )
    transcript_type: Mapped[TranscriptType] = mapped_column(Enum(TranscriptType), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    segments: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

