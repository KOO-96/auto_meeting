from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.processing_job import ProcessingJob
from app.models.user import User


router = APIRouter(prefix="/processing", tags=["processing"])


@router.get("/jobs")
def list_processing_jobs(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    jobs = db.scalars(select(ProcessingJob).order_by(ProcessingJob.created_at.desc()).limit(100))
    return [
        {
            "id": job.id,
            "meeting_id": job.meeting_id,
            "job_id": job.job_id,
            "status": job.status,
            "progress_current": job.progress_current,
            "progress_total": job.progress_total,
            "error_message": job.error_message,
            "created_at": job.created_at,
        }
        for job in jobs
    ]

