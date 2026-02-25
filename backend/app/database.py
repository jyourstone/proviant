"""Database connection and session management."""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .models import Base

# Data directory — mount as volume in Docker (e.g. /appdata/proviant on Unraid)
DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DATA_DIR}/proviant.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Create all tables."""
    os.makedirs(DATA_DIR, exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
