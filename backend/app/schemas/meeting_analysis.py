from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import MeetingType
from app.schemas.common import ORMModel


class MeetingAnalysisCreate(BaseModel):
    meeting_type: MeetingType = MeetingType.unknown
    one_line_summary: str
    detailed_summary: str
    keywords: list[str] = Field(default_factory=list)
    decisions: list[dict] = Field(default_factory=list)
    action_items: list[dict] = Field(default_factory=list)
    open_questions: list[dict] = Field(default_factory=list)
    risks: list[dict] = Field(default_factory=list)
    next_agenda: list[str] = Field(default_factory=list)
    next_decision_items: list[str] = Field(default_factory=list)
    validation_result: dict = Field(default_factory=dict)


class MeetingResultRead(ORMModel):
    meeting_id: int
    meeting_type: MeetingType
    one_line_summary: str
    detailed_summary: str
    keywords: list[str]
    decisions: list[dict]
    action_items: list[dict]
    open_questions: list[dict]
    risks: list[dict]
    next_agenda: list[str]
    next_decision_items: list[str]
    validation_result: dict
    created_at: datetime
    updated_at: datetime
