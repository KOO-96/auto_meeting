from datetime import datetime

from pydantic import BaseModel

from app.models.enums import UserRole
from app.schemas.common import ORMModel


class UserCreate(BaseModel):
    name: str
    email: str
    password: str = "password"
    department: str | None = None
    position: str | None = None
    role: UserRole = UserRole.member


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None
    department: str | None = None
    position: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserRead(ORMModel):
    id: int
    name: str
    email: str
    department: str | None = None
    position: str | None = None
    role: UserRole
    is_active: bool
    must_change_password: bool = False
    created_at: datetime
    updated_at: datetime
