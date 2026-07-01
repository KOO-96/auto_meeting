from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.meeting import (
    MeetingCreate,
    MeetingCreatedResponse,
    MeetingFinishRequest,
    MeetingRead,
    MeetingStatusResponse,
    MeetingUpdate,
)
from app.schemas.meeting_analysis import MeetingResultRead
from app.schemas.processing import ProcessResponse
from app.services.meeting_service import MeetingService
from app.services.processing_service import ProcessingService


router = APIRouter(prefix="/meetings", tags=["meetings"])


def status_message(step: int) -> str:
    labels = {
        0: "queued",
        1: "업로드 확인 완료",
        2: "음성 전사 중",
        3: "화면 / 첨부 분석 중",
        4: "회의록 생성 중",
        5: "결과 검증 중",
    }
    return labels.get(step, "processing")


@router.post("", response_model=MeetingCreatedResponse)
def create_meeting(
    payload: MeetingCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    meeting = MeetingService(db).create(payload, current_user)
    return MeetingCreatedResponse(meeting_id=meeting.id, status=meeting.status)


@router.get("", response_model=list[MeetingRead])
def list_meetings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return MeetingService(db).list_accessible(current_user)


@router.get("/{meeting_id}", response_model=MeetingRead)
def get_meeting(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return MeetingService(db).get_accessible(meeting_id, current_user)


@router.patch("/{meeting_id}", response_model=MeetingRead)
def update_meeting(
    meeting_id: int,
    payload: MeetingUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return MeetingService(db).update(meeting_id, payload, current_user)


@router.delete("/{meeting_id}")
def delete_meeting(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    MeetingService(db).delete(meeting_id, current_user)
    return {"message": "meeting deleted"}


@router.post("/{meeting_id}/start", response_model=MeetingCreatedResponse)
def start_meeting(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    meeting = MeetingService(db).start(meeting_id, current_user)
    return MeetingCreatedResponse(meeting_id=meeting.id, status=meeting.status)


@router.post("/{meeting_id}/finish", response_model=MeetingCreatedResponse)
def finish_meeting(
    meeting_id: int,
    payload: MeetingFinishRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    meeting = MeetingService(db).finish(meeting_id, payload, current_user)
    return MeetingCreatedResponse(meeting_id=meeting.id, status=meeting.status)


@router.post("/{meeting_id}/process", response_model=ProcessResponse)
def process_meeting(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    job = ProcessingService(db).process(meeting_id, current_user)
    return ProcessResponse(
        meeting_id=meeting_id,
        status=job.status.value,
        job_id=job.job_id,
        progress_current=job.progress_current,
        progress_total=job.progress_total,
    )


@router.post("/{meeting_id}/retry", response_model=ProcessResponse)
def retry_meeting(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    job = ProcessingService(db).process(meeting_id, current_user, retry=True)
    return ProcessResponse(
        meeting_id=meeting_id,
        status=job.status.value,
        job_id=job.job_id,
        progress_current=job.progress_current,
        progress_total=job.progress_total,
    )


@router.get("/{meeting_id}/status", response_model=MeetingStatusResponse)
def get_status(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    # Reading status is a good moment to reconcile orphaned/stuck jobs so the
    # UI can surface a failure (and offer retry) instead of spinning forever.
    processing = ProcessingService(db)
    processing.reap_meeting(meeting_id)
    meeting = MeetingService(db).get_accessible(meeting_id, current_user)
    job = processing.latest_job(meeting_id)
    current = job.progress_current if job else meeting.progress_current
    total = job.progress_total if job else meeting.progress_total
    return MeetingStatusResponse(
        meeting_id=meeting.id,
        status=meeting.status,
        current_step=current,
        total_steps=total,
        message=status_message(current),
        error_message=meeting.error_message,
    )


@router.get("/{meeting_id}/result", response_model=MeetingResultRead)
def get_result(
    meeting_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    analysis = MeetingService(db).get_result(meeting_id, current_user)
    return MeetingResultRead.model_validate(analysis)
