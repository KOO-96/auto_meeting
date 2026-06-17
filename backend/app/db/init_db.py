from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models import *  # noqa: F403 - import all models for metadata registration.
from app.services.auth_service import create_seed_admin


def init_db(create_schema: bool = False) -> None:
    if create_schema:
        Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        create_seed_admin(db)


if __name__ == "__main__":
    init_db(create_schema=False)

