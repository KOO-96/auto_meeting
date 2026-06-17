from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class TimelineMemo(TimestampMixin, Base):
    __tablename__ = "timeline_memos"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    timestamp_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    audio_elapsed_ms: Mapped[int | None] = mapped_column(Integer)
    screen_elapsed_ms: Mapped[int | None] = mapped_column(Integer)
    memo: Mapped[str] = mapped_column(Text, nullable=False)

    meeting = relationship("Meeting", back_populates="memos")
    author = relationship("User")
