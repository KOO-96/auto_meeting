from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.processing import ProcessingJobRead
from app.services.processing_service import ProcessingService


router = APIRouter(prefix="/processing", tags=["processing"])


@router.get("/jobs", response_model=list[ProcessingJobRead])
def list_processing_jobs(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    return ProcessingService(db).list_recent_jobs()
