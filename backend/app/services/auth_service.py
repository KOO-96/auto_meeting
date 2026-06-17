from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.exceptions import bad_request
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.auth_session import AuthSession
from app.models.user import User
from app.repositories.auth_session_repository import AuthSessionRepository
from app.repositories.user_repository import UserRepository
from app.core.config import get_settings


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)
        self.sessions = AuthSessionRepository(db)

    def login(self, email: str, password: str, request: Request) -> tuple[User, str, str]:
        user = self.users.get_by_email(email)

        if not user or not user.is_active or not verify_password(password, user.password_hash):
            raise bad_request("Invalid email or password.")

        return self._issue_tokens(user, request)

    def refresh(self, refresh_token: str, request: Request) -> tuple[User, str, str]:
        session = self.sessions.get_active_by_hash(hash_token(refresh_token))

        if not session or not session.user.is_active:
            raise bad_request("Invalid refresh token.")

        self.sessions.revoke(session)
        return self._issue_tokens(session.user, request)

    def logout(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return

        session = self.sessions.get_active_by_hash(hash_token(refresh_token))
        if session:
            self.sessions.revoke(session)
            self.db.commit()

    def _issue_tokens(self, user: User, request: Request) -> tuple[User, str, str]:
        settings = get_settings()
        access_token = create_access_token(user.id)
        refresh_token = create_refresh_token()
        auth_session = AuthSession(
            user_id=user.id,
            refresh_token_hash=hash_token(refresh_token),
            user_agent=request.headers.get("user-agent"),
            ip_address=request.client.host if request.client else None,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
        )

        self.db.add(auth_session)
        self.db.commit()
        self.db.refresh(user)

        return user, access_token, refresh_token


def create_seed_admin(db: Session) -> None:
    users = UserRepository(db)
    if users.get_by_email("admin@company.local"):
        return

    db.add(
        User(
            name="관리자",
            email="admin@company.local",
            password_hash=hash_password("password"),
            department="경영지원",
            position="관리자",
            role="admin",
            is_active=True,
        )
    )
    db.commit()

