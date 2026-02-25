"""Proviant — Hemförrådshantering."""

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .database import get_db, init_db
from .models import Item, StorageType
from .schemas import ItemCreate, ItemResponse, ItemSummary, ItemUpdate, QuantityUpdate


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Proviant",
    description="Hemförrådshantering — frys, kyl, skafferi",
    version="0.2.0",
    lifespan=lifespan,
)


# --- API Routes ---


@app.get("/api/items", response_model=list[ItemResponse])
def list_items(
    storage_type: Optional[StorageType] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    out_of_stock: Optional[bool] = Query(None),
    low_stock: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    """List all items, optionally filtered."""
    q = db.query(Item)
    if storage_type:
        q = q.filter(Item.storage_type == storage_type)
    if category:
        q = q.filter(Item.category == category)
    if search:
        q = q.filter(Item.name.ilike(f"%{search}%"))
    if out_of_stock:
        q = q.filter(Item.quantity == 0)
    if low_stock:
        q = q.filter(Item.quantity > 0, Item.quantity < 1)
    return q.order_by(Item.category.asc(), Item.name.asc()).all()


@app.get("/api/items/{item_id}", response_model=ItemResponse)
def get_item(item_id: int, db: Session = Depends(get_db)):
    """Get a single item by ID."""
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@app.post("/api/items", response_model=ItemResponse, status_code=201)
def create_item(item: ItemCreate, db: Session = Depends(get_db)):
    """Create a new item."""
    db_item = Item(
        name=item.name,
        storage_type=item.storage_type,
        quantity=item.quantity,
        unit=item.unit,
        category=item.category,
        note=item.note,
        expiry_date=item.expiry_date,
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@app.put("/api/items/{item_id}", response_model=ItemResponse)
def update_item(item_id: int, item: ItemUpdate, db: Session = Depends(get_db)):
    """Update an existing item."""
    db_item = db.query(Item).filter(Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    update_data = item.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)

    db.commit()
    db.refresh(db_item)
    return db_item


@app.patch("/api/items/{item_id}/quantity", response_model=ItemResponse)
def update_quantity(item_id: int, data: QuantityUpdate, db: Session = Depends(get_db)):
    """Quick update of item quantity."""
    db_item = db.query(Item).filter(Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    db_item.quantity = data.quantity
    db.commit()
    db.refresh(db_item)
    return db_item


@app.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    """Delete an item."""
    db_item = db.query(Item).filter(Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(db_item)
    db.commit()


@app.get("/api/summary", response_model=list[ItemSummary])
def get_summary(db: Session = Depends(get_db)):
    """Get summary statistics per storage type."""
    results = []
    for st in StorageType:
        items = db.query(Item).filter(Item.storage_type == st).all()
        categories = sorted(set(i.category for i in items if i.category))
        oos = sum(1 for i in items if i.quantity == 0)
        results.append(ItemSummary(
            storage_type=st,
            total_items=len(items),
            out_of_stock=oos,
            categories=categories,
        ))
    return results


@app.get("/api/categories")
def list_categories(
    storage_type: Optional[StorageType] = Query(None),
    db: Session = Depends(get_db),
):
    """List all unique categories."""
    q = db.query(Item.category).filter(Item.category.isnot(None))
    if storage_type:
        q = q.filter(Item.storage_type == storage_type)
    categories = sorted(set(c[0] for c in q.distinct().all()))
    return categories


# --- Static files (frontend) ---

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
