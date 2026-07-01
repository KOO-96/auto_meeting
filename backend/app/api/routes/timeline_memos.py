import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.exceptions import bad_request, not_found
from app.db.session import get_db
from app.models.timeline_memo import TimelineMemo
from app.models.user import User
from app.schemas.timeline_memo import TimelineMemoCreate, TimelineMemoRead, TimelineMemoUpdate
from app.services.meeting_service import MeetingService


router = APIRouter(prefix="/meetings/{meeting_id}/memos", tags=["timeline-memos"])


@router.get("", response_model=list[TimelineMemoRead])
def list_memos(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    MeetingService(db).get_accessible(meeting_id, current_user)
    return list(
        db.scalars(
            select(TimelineMemo)
            .where(TimelineMemo.meeting_id == meeting_id)
            .order_by(TimelineMemo.timestamp_ms)
        )
    )


@router.post("", response_model=TimelineMemoRead)
def create_memo(
    meeting_id: int,
    payload: TimelineMemoCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    MeetingService(db).get_accessible(meeting_id, current_user)
    memo = TimelineMemo(
        meeting_id=meeting_id,
        # Author is always the authenticated caller — never trust a client-supplied id.
        author_id=current_user.id,
        timestamp_ms=payload.timestamp_ms,
        audio_elapsed_ms=payload.audio_elapsed_ms,
        screen_elapsed_ms=payload.screen_elapsed_ms,
        memo=payload.memo,
    )
    if payload.created_at:
        memo.created_at = payload.created_at
    db.add(memo)
    db.commit()
    db.refresh(memo)
    return memo


@router.patch("/{memo_id}", response_model=TimelineMemoRead)
def update_memo(
    meeting_id: int,
    memo_id: int,
    payload: TimelineMemoUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    MeetingService(db).get_accessible(meeting_id, current_user)
    memo = db.get(TimelineMemo, memo_id)
    if not memo or memo.meeting_id != meeting_id:
        raise not_found("Memo not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(memo, key, value)
    db.commit()
    db.refresh(memo)
    return memo


@router.delete("/{memo_id}")
def delete_memo(
    meeting_id: int,
    memo_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    MeetingService(db).get_accessible(meeting_id, current_user)
    memo = db.get(TimelineMemo, memo_id)
    if not memo or memo.meeting_id != meeting_id:
        raise not_found("Memo not found.")
    db.delete(memo)
    db.commit()
    return {"message": "memo deleted"}


@router.post("/import", response_model=list[TimelineMemoRead])
async def import_memos(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    MeetingService(db).get_accessible(meeting_id, current_user)
    try:
        payload = json.loads((await file.read()).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise bad_request("Invalid memo_json file.") from error

    if not isinstance(payload, list):
        raise bad_request("memo_json must be an array.")

    imported: list[TimelineMemo] = []
    for item in payload:
        memo = TimelineMemo(
            meeting_id=meeting_id,
            author_id=current_user.id,
            timestamp_ms=item["timestamp_ms"],
            audio_elapsed_ms=item.get("audio_elapsed_ms"),
            screen_elapsed_ms=item.get("screen_elapsed_ms"),
            memo=item["memo"],
        )
        db.add(memo)
        imported.append(memo)

    db.commit()
    for memo in imported:
        db.refresh(memo)
    return imported

