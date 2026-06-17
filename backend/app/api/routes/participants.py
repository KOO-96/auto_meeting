from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.exceptions import bad_request, not_found
from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.permission_service import PermissionService
from app.repositories.meeting_repository import MeetingRepository


router = APIRouter(prefix="/participants", tags=["participants"])


@router.get("", response_model=list[UserRead])
def list_participants(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    return UserRepository(db).list_active()


@router.get("/search", response_model=list[UserRead])
def search_participants(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
    q: str | None = None,
    department: str | None = None,
):
    return UserRepository(db).search(q, department)


@router.post("", response_model=UserRead)
def create_participant(
    payload: UserCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    PermissionService(MeetingRepository(db)).require_admin(current_user)
    users = UserRepository(db)
    if users.get_by_email(payload.email):
        raise bad_request("Email already exists.")

    user = User(
        name=payload.name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        department=payload.department,
        position=payload.position,
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{participant_id}", response_model=UserRead)
def get_participant(
    participant_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    user = UserRepository(db).get(participant_id)
    if not user:
        raise not_found("Participant not found.")
    return user


@router.patch("/{participant_id}", response_model=UserRead)
def update_participant(
    participant_id: int,
    payload: UserUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    PermissionService(MeetingRepository(db)).require_admin(current_user)
    user = UserRepository(db).get(participant_id)
    if not user:
        raise not_found("Participant not found.")

    for key, value in payload.model_dump(exclude_unset=True, exclude={"password"}).items():
        setattr(user, key, value)
    if payload.password:
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{participant_id}")
def delete_participant(
    participant_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    PermissionService(MeetingRepository(db)).require_admin(current_user)
    user = UserRepository(db).get(participant_id)
    if not user:
        raise not_found("Participant not found.")

    user.is_active = False
    db.commit()
    return {"message": "participant deactivated"}

