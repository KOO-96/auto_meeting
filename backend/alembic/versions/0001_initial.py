"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-16 00:00:00
"""
from typing import Sequence, Union

from alembic import op

from app.db.base import Base
from app.models import *  # noqa: F403 - import all models for metadata registration.


revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())

