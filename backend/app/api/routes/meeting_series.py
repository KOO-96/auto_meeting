from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_admin
from app.core.exceptions import not_found
from app.db.session import get_db
from app.models.meeting_series import MeetingSeries
from app.models.user import User
from app.schemas.meeting_series import MeetingSeriesCreate, MeetingSeriesRead, MeetingSeriesUpdate


router = APIRouter(prefix="/meeting-series", tags=["meeting-series"])


@router.get("", response_model=list[MeetingSeriesRead])
def list_series(db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return list(db.scalars(select(MeetingSeries).order_by(MeetingSeries.created_at.desc())))


@router.post("", response_model=MeetingSeriesRead)
def create_series(
    payload: MeetingSeriesCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_admin)],
):
    series = MeetingSeries(
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        created_by=current_user.id,
    )
    db.add(series)
    db.commit()
    db.refresh(series)
    return series


@router.get("/{series_id}", response_model=MeetingSeriesRead)
def get_series(series_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    series = db.get(MeetingSeries, series_id)
    if not series:
        raise not_found("Meeting series not found.")
    return series


@router.patch("/{series_id}", response_model=MeetingSeriesRead)
def update_series(
    series_id: int,
    payload: MeetingSeriesUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
):
    series = db.get(MeetingSeries, series_id)
    if not series:
        raise not_found("Meeting series not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(series, key, value)
    db.commit()
    db.refresh(series)
    return series


@router.delete("/{series_id}")
def delete_series(series_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    series = db.get(MeetingSeries, series_id)
    if not series:
        raise not_found("Meeting series not found.")
    db.delete(series)
    db.commit()
    return {"message": "meeting series deleted"}

