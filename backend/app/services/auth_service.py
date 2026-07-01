import logging
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
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

logger = logging.getLogger(__name__)

# Environments where a well-known seed admin may be auto-created for convenience.
_SEED_ADMIN_ENVIRONMENTS = {"local", "development", "dev", "test"}


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)
        self.sessions = AuthSessionRepository(db)

    def login(self, email: str, password: str, request: Request) -> tuple[User, str, str]:
        user = self.users.get_by_email(email)

        if not user or not user.is_active or not verify_password(password, user.password_hash):
            client = request.client.host if request.client else "unknown"
            logger.warning("Failed login attempt for email=%s from %s", email, client)
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

    def change_password(self, user: User, current_password: str, new_password: str) -> User:
        if not verify_password(current_password, user.password_hash):
            raise bad_request("Current password is incorrect.")
        if len(new_password) < 8:
            raise bad_request("New password must be at least 8 characters.")
        if new_password == current_password:
            raise bad_request("New password must differ from the current password.")

        user.password_hash = hash_password(new_password)
        user.must_change_password = False
        # Invalidate all existing sessions so old refresh tokens cannot be reused.
        for session in self.sessions.list_active_for_user(user.id):
            self.sessions.revoke(session)
        self.db.commit()
        self.db.refresh(user)
        return user

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
    settings = get_settings()
    if settings.app_env.strip().lower() not in _SEED_ADMIN_ENVIRONMENTS:
        # Never auto-create a well-known admin outside dev/test environments.
        logger.info("Skipping seed admin creation for app_env=%s", settings.app_env)
        return

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
            # Force rotation of the well-known seed password on first login.
            must_change_password=True,
        )
    )
    db.commit()
    logger.warning(
        "Seed admin admin@company.local created with a default password. "
        "It must be changed on first login (must_change_password=True)."
    )

