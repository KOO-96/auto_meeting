from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.exceptions import not_found
from app.db.session import get_db
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate


router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRead])
def list_projects(db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return list(db.scalars(select(Project).order_by(Project.created_at.desc())))


@router.post("", response_model=ProjectRead)
def create_project(
    payload: ProjectCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    project = Project(name=payload.name, description=payload.description, created_by=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    project = db.get(Project, project_id)
    if not project:
        raise not_found("Project not found.")
    return project


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    project = db.get(Project, project_id)
    if not project:
        raise not_found("Project not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    project = db.get(Project, project_id)
    if not project:
        raise not_found("Project not found.")
    db.delete(project)
    db.commit()
    return {"message": "project deleted"}

