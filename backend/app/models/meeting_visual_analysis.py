from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ImageType
from app.models.mixins import utc_now


class MeetingVisualAnalysis(Base):
    __tablename__ = "meeting_visual_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    source_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("meeting_files.id", ondelete="SET NULL"),
    )
    frame_time_ms: Mapped[int | None] = mapped_column(Integer)
    image_path: Mapped[str | None] = mapped_column(Text)
    image_type: Mapped[ImageType] = mapped_column(
        Enum(ImageType),
        default=ImageType.unknown,
        nullable=False,
    )
    summary: Mapped[str | None] = mapped_column(Text)
    detected_text: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    keywords: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
