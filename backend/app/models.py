"""Database models for Proviant."""

from enum import Enum as PyEnum

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Enum, Text, func
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class StorageType(str, PyEnum):
    """Type of storage location."""
    FREEZER = "freezer"
    FRIDGE = "fridge"
    PANTRY = "pantry"


class Item(Base):
    """An item stored in a storage location."""
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, index=True)
    storage_type = Column(Enum(StorageType), nullable=False, default=StorageType.FREEZER)
    quantity = Column(Float, nullable=False, default=1.0)
    unit = Column(String(50), nullable=True)
    category = Column(String(100), nullable=True)
    note = Column(Text, nullable=True)
    expiry_date = Column(DateTime, nullable=True)
    on_shopping_list = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Item {self.name} ({self.storage_type.value})>"
