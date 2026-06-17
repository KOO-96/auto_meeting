from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.meeting import MeetingRead
from app.services.search_service import SearchService


router = APIRouter(prefix="/search", tags=["search"])


@router.get("/meetings", response_model=list[MeetingRead])
def search_meetings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: str | None = None,
    project_id: int | None = None,
    series_id: int | None = None,
    status: str | None = None,
    participant_id: int | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    return SearchService(db).search_meetings(
        user=current_user,
        q=q,
        project_id=project_id,
        series_id=series_id,
        status=status,
        participant_id=participant_id,
        page=page,
        size=size,
    )

