from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth_session import AuthSession


class AuthSessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_active_by_hash(self, token_hash: str) -> AuthSession | None:
        now = datetime.now(timezone.utc)
        return self.db.scalar(
            select(AuthSession).where(
                AuthSession.refresh_token_hash == token_hash,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now,
            )
        )

    def revoke(self, session: AuthSession) -> None:
        session.revoked_at = datetime.now(timezone.utc)

