"""Pydantic schemas for Proviant API."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .models import StorageType


class ItemCreate(BaseModel):
    """Schema for creating a new item."""
    name: str = Field(..., min_length=1, max_length=255)
    storage_type: StorageType = StorageType.FREEZER
    quantity: float = 1.0
    unit: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None
    added_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None


class ItemUpdate(BaseModel):
    """Schema for updating an item."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    storage_type: Optional[StorageType] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None
    added_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None


class ItemResponse(BaseModel):
    """Schema for item responses."""
    id: int
    name: str
    storage_type: StorageType
    quantity: float
    unit: Optional[str]
    category: Optional[str]
    note: Optional[str]
    added_date: datetime
    expiry_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ItemSummary(BaseModel):
    """Summary statistics for a storage type."""
    storage_type: StorageType
    total_items: int
    categories: list[str]
