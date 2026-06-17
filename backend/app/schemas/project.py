from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectRead(ORMModel):
    id: int
    name: str
    description: str | None = None
    created_by: int
    created_at: datetime
    updated_at: datetime

