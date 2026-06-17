from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LogoutRequest, RefreshRequest, TokenResponse
from app.schemas.user import UserRead
from app.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Annotated[Session, Depends(get_db)]):
    user, access_token, refresh_token = AuthService(db).login(
        payload.email,
        payload.password,
        request,
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=user)


@router.get("/me", response_model=UserRead)
def me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user


@router.post("/logout")
def logout(payload: LogoutRequest, db: Annotated[Session, Depends(get_db)]):
    AuthService(db).logout(payload.refresh_token)
    return {"message": "logged out"}


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, request: Request, db: Annotated[Session, Depends(get_db)]):
    user, access_token, refresh_token = AuthService(db).refresh(payload.refresh_token, request)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=user)

