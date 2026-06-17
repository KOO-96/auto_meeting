from pathlib import Path
from uuid import uuid4

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import bad_request, not_found
from app.models.enums import ExportType
from app.models.export_file import ExportFile
from app.models.meeting_analysis import MeetingAnalysis
from app.models.user import User
from app.repositories.export_repository import ExportRepository
from app.repositories.meeting_repository import MeetingRepository
from app.services.permission_service import PermissionService


class ExportService:
    def __init__(self, db: Session):
        self.db = db
        self.exports = ExportRepository(db)
        self.meetings = MeetingRepository(db)
        self.permissions = PermissionService(self.meetings)

    def create(self, meeting_id: int, export_type: ExportType, user: User) -> ExportFile:
        meeting = self.meetings.get(meeting_id)
        if not meeting:
            raise not_found("Meeting not found.")
        self.permissions.require_meeting_access(meeting, user)

        analysis = self.db.scalar(
            select(MeetingAnalysis)
            .where(MeetingAnalysis.meeting_id == meeting_id)
            .order_by(MeetingAnalysis.created_at.desc())
        )
        if not analysis:
            raise bad_request("Meeting analysis result is not available.")

        settings = get_settings()
        target_dir = settings.export_dir / "meetings" / str(meeting_id) / "exports"
        target_dir.mkdir(parents=True, exist_ok=True)

        if export_type == ExportType.markdown:
            filename = f"{uuid4().hex}.md"
            target_path = target_dir / filename
            target_path.write_text(self._markdown(meeting.title, analysis), encoding="utf-8")
        elif export_type == ExportType.pdf:
            filename = f"{uuid4().hex}.pdf"
            target_path = target_dir / filename
            self._pdf(target_path, meeting.title, analysis)
        else:
            raise bad_request("Unsupported export type.")

        record = ExportFile(
            meeting_id=meeting_id,
            export_type=export_type,
            stored_filename=filename,
            storage_path=str(target_path),
            created_by=user.id,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def list(self, meeting_id: int, user: User) -> list[ExportFile]:
        meeting = self.meetings.get(meeting_id)
        if not meeting:
            raise not_found("Meeting not found.")
        self.permissions.require_meeting_access(meeting, user)
        return self.exports.list_by_meeting(meeting_id)

    def get_download(self, meeting_id: int, export_id: int, user: User) -> ExportFile:
        meeting = self.meetings.get(meeting_id)
        if not meeting:
            raise not_found("Meeting not found.")
        self.permissions.require_meeting_access(meeting, user)
        export = self.exports.get_for_meeting(meeting_id, export_id)
        if not export:
            raise not_found("Export not found.")
        return export

    def _markdown(self, title: str, analysis: MeetingAnalysis) -> str:
        return f"""# {title}

## 한 줄 요약
{analysis.one_line_summary}

## 상세 요약
{analysis.detailed_summary}

## 키워드
{chr(10).join(f"- {keyword}" for keyword in analysis.keywords)}

## 결정사항
{chr(10).join(f"- {item.get('content', item)}" for item in analysis.decisions)}

## 액션아이템
{chr(10).join(f"- {item.get('task', item.get('content', item))}" for item in analysis.action_items)}

## 미결정 안건
{chr(10).join(f"- {item.get('question', item)}" for item in analysis.open_questions)}
"""

    def _pdf(self, target_path: Path, title: str, analysis: MeetingAnalysis) -> None:
        pdf = canvas.Canvas(str(target_path), pagesize=A4)
        width, height = A4
        y = height - 56
        lines = self._markdown(title, analysis).splitlines()
        pdf.setFont("Helvetica", 11)
        for line in lines:
            if y < 56:
                pdf.showPage()
                pdf.setFont("Helvetica", 11)
                y = height - 56
            pdf.drawString(48, y, line[:100])
            y -= 16
        pdf.save()

