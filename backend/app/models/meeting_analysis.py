from sqlalchemy import Enum, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import MeetingType
from app.models.mixins import TimestampMixin


class MeetingAnalysis(TimestampMixin, Base):
    __tablename__ = "meeting_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    meeting_type: Mapped[MeetingType] = mapped_column(
        Enum(MeetingType),
        default=MeetingType.unknown,
        nullable=False,
    )
    one_line_summary: Mapped[str] = mapped_column(Text, nullable=False)
    detailed_summary: Mapped[str] = mapped_column(Text, nullable=False)
    keywords: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    decisions: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    action_items: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    open_questions: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    risks: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    next_agenda: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    next_decision_items: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    validation_result: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    meeting = relationship("Meeting", back_populates="analyses")

