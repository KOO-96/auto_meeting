from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.export_file import ExportFile


class ExportRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_by_meeting(self, meeting_id: int) -> list[ExportFile]:
        return list(
            self.db.scalars(
                select(ExportFile)
                .where(ExportFile.meeting_id == meeting_id)
                .order_by(ExportFile.created_at.desc())
            )
        )

    def get_for_meeting(self, meeting_id: int, export_id: int) -> ExportFile | None:
        return self.db.scalar(
            select(ExportFile).where(
                ExportFile.meeting_id == meeting_id,
                ExportFile.id == export_id,
            )
        )

