from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import MeetingStatus
from app.models.mixins import TimestampMixin


class Meeting(TimestampMixin, Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    meeting_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    series_id: Mapped[int | None] = mapped_column(
        ForeignKey("meeting_series.id", ondelete="SET NULL"),
    )
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    participants_only: Mapped[bool] = mapped_column(default=True, nullable=False)
    status: Mapped[MeetingStatus] = mapped_column(
        Enum(MeetingStatus),
        default=MeetingStatus.draft,
        nullable=False,
        index=True,
    )
    progress_current: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress_total: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    additional_memo: Mapped[str | None] = mapped_column(Text)
    local_base_path: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    participants = relationship(
        "MeetingParticipant",
        back_populates="meeting",
        cascade="all, delete-orphan",
    )
    files = relationship("MeetingFile", back_populates="meeting", cascade="all, delete-orphan")
    memos = relationship("TimelineMemo", back_populates="meeting", cascade="all, delete-orphan")
    analyses = relationship(
        "MeetingAnalysis",
        back_populates="meeting",
        cascade="all, delete-orphan",
    )
    project = relationship("Project")
    series = relationship("MeetingSeries")

    @property
    def project_name(self) -> str | None:
        return self.project.name if self.project else None

    @property
    def meeting_series(self) -> str | None:
        return self.series.title if self.series else None
