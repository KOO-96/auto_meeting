from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, user_id: int) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email.lower()))

    def list_active(self) -> list[User]:
        return list(self.db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.name)))

    def search(self, q: str | None = None, department: str | None = None) -> list[User]:
        statement = select(User).where(User.is_active.is_(True))

        if q:
            pattern = f"%{q.lower()}%"
            statement = statement.where(
                User.name.ilike(pattern) | User.email.ilike(pattern) | User.department.ilike(pattern)
            )

        if department:
            statement = statement.where(User.department == department)

        return list(self.db.scalars(statement.order_by(User.name)))

