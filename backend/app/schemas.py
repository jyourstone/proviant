"""Pydantic schemas for Proviant API."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .models import StorageType


class ItemCreate(BaseModel):
    """Schema for creating a new item."""
    name: str = Field(..., min_length=1, max_length=255)
    storage_type: StorageType = StorageType.FREEZER
    quantity: float = Field(default=1.0, ge=0)
    unit: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    note: Optional[str] = None
    expiry_date: Optional[datetime] = None


class ItemUpdate(BaseModel):
    """Schema for updating an item."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    storage_type: Optional[StorageType] = None
    quantity: Optional[float] = Field(None, ge=0)
    unit: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    note: Optional[str] = None
    expiry_date: Optional[datetime] = None


class QuantityUpdate(BaseModel):
    """Schema for quick quantity update."""
    quantity: float = Field(..., ge=0)


class ItemResponse(BaseModel):
    """Schema for item responses."""
    id: int
    name: str
    storage_type: StorageType
    quantity: float
    unit: Optional[str]
    category: Optional[str]
    tags: Optional[str]
    note: Optional[str]
    expiry_date: Optional[datetime]
    on_shopping_list: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ItemSummary(BaseModel):
    """Summary statistics for a storage type."""
    storage_type: StorageType
    total_items: int
    out_of_stock: int
    categories: list[str]
