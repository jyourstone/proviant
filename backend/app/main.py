"""Proviant — Hemförrådshantering."""

import os
import re
import unicodedata
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
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


# --- Text normalisation helpers ---


def normalize_text(text: str) -> str:
    """Lowercase, strip whitespace, and remove accents/diacritics."""
    text = text.strip().lower()
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.category(c).startswith("M"))


def word_boundary_match(needle: str, haystack: str) -> bool:
    """True if *needle* appears as whole word(s) inside *haystack*.

    Both strings must already be normalised.
    """
    return bool(re.search(r"\b" + re.escape(needle) + r"\b", haystack))


def items_match(name_a: str, name_b: str) -> bool:
    """Bidirectional word-boundary match after normalisation.

    Returns True when either name contains the other as whole words.
    E.g. "köttbullar" ↔ "köttbullar fryst" both match.
    """
    a = normalize_text(name_a)
    b = normalize_text(name_b)
    if a == b:
        return True
    return word_boundary_match(a, b) or word_boundary_match(b, a)


# --- Shopping list proxy ---

SHOPPING_WEBHOOK_URL = os.environ.get("SHOPPING_WEBHOOK_URL", "")
SHOPPING_WEBHOOK_KEY = os.environ.get("SHOPPING_WEBHOOK_KEY", "")


class ShoppingListRequest(BaseModel):
    name: str


class IcaSyncRequest(BaseModel):
    """Payload from n8n with current ICA shopping list items."""
    items: list[str]  # List of item names currently on ICA list (not struck through)


@app.post("/api/shopping-list")
async def add_to_shopping_list(req: ShoppingListRequest, db: Session = Depends(get_db)):
    """Proxy to n8n webhook for ICA shopping list, and mark item locally."""
    if not SHOPPING_WEBHOOK_URL:
        raise HTTPException(status_code=501, detail="Shopping list not configured")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            SHOPPING_WEBHOOK_URL,
            json={"name": req.name},
            headers={"X-Api-Key": SHOPPING_WEBHOOK_KEY},
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="ICA request failed")

    # Mark matching Proviant items as on_shopping_list
    all_items = db.query(Item).all()
    for item in all_items:
        if items_match(item.name, req.name):
            item.on_shopping_list = True
    db.commit()

    return resp.json()


SYNC_API_KEY = os.environ.get("SYNC_API_KEY", SHOPPING_WEBHOOK_KEY)


@app.post("/api/ica-sync")
def ica_sync(
    req: IcaSyncRequest,
    db: Session = Depends(get_db),
    x_api_key: Optional[str] = Header(None),
):
    """Receive the current ICA shopping list from n8n and sync flags.

    Uses normalised word-boundary matching (accent- and case-insensitive)
    so "Köttbullar" in Proviant matches "Köttbullar fryst" in ICA.
    """
    if not SYNC_API_KEY or x_api_key != SYNC_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    ica_names = [name.strip() for name in req.items]

    all_items = db.query(Item).all()
    matched = 0
    for item in all_items:
        should_be_on = any(items_match(item.name, ica) for ica in ica_names)
        if item.on_shopping_list != should_be_on:
            item.on_shopping_list = should_be_on
            if should_be_on:
                matched += 1

    db.commit()
    return {"synced": True, "ica_items": len(ica_names), "matched": matched}


# --- Static files (frontend) ---

APP_VERSION = app.version


@app.get("/api/version")
def get_version():
    """Return current app version."""
    return {"version": APP_VERSION}


@app.get("/", response_class=HTMLResponse)
def serve_index():
    """Serve index.html with cache-busting version parameter."""
    html_path = Path("frontend/index.html")
    html = html_path.read_text(encoding="utf-8")
    html = html.replace('href="/style.css"', f'href="/style.css?v={APP_VERSION}"')
    html = html.replace('src="/app.js"', f'src="/app.js?v={APP_VERSION}"')
    return HTMLResponse(content=html, headers={"Cache-Control": "no-cache"})


app.mount("/", StaticFiles(directory="frontend"), name="frontend")
