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
    """Create all tables and run lightweight migrations."""
    os.makedirs(DATA_DIR, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _migrate(engine)


def _migrate(eng):
    """Add missing columns to existing tables (idempotent)."""
    from sqlalchemy import inspect, text
    insp = inspect(eng)
    if "items" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("items")}
        with eng.begin() as conn:
            if "on_shopping_list" not in cols:
                conn.execute(text(
                    "ALTER TABLE items ADD COLUMN on_shopping_list BOOLEAN NOT NULL DEFAULT 0"
                ))
            if "tags" not in cols:
                conn.execute(text(
                    "ALTER TABLE items ADD COLUMN tags VARCHAR(500)"
                ))


def get_db():
    """Dependency for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
