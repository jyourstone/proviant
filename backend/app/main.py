"""Proviant — Hemförrådshantering."""

import asyncio
import logging
import os
import re
import unicodedata
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import get_db, init_db, SessionLocal
from .models import Item, StorageType
from .schemas import ItemCreate, ItemResponse, ItemSummary, ItemUpdate, QuantityUpdate

logger = logging.getLogger("proviant")

# --- ICA configuration ---

ICA_SESSION_COOKIE = os.environ.get("ICA_SESSION_COOKIE", "")
ICA_LIST_ID = os.environ.get("ICA_LIST_ID", "")
ICA_SYNC_INTERVAL = int(os.environ.get("ICA_SYNC_INTERVAL", "10"))  # minutes

ICA_ENABLED = bool(ICA_SESSION_COOKIE and ICA_LIST_ID)

ICA_USER_INFO_URL = "https://www.ica.se/api/user/information"
ICA_LIST_BASE_URL = "https://apimgw-pub.ica.se/sverige/digx/shopping-list/v1/api/list"


# --- ICA API helpers ---

async def ica_get_token() -> str:
    """Get ICA access token using session cookie."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            ICA_USER_INFO_URL,
            headers={"Cookie": f"thSessionId={ICA_SESSION_COOKIE}"},
        )
        resp.raise_for_status()
        return resp.json()["accessToken"]


async def ica_fetch_list(token: str) -> list[dict]:
    """Fetch the ICA shopping list and return rows."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{ICA_LIST_BASE_URL}/{ICA_LIST_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json().get("rows", [])


async def ica_add_item(token: str, name: str) -> dict:
    """Add an item to the ICA shopping list."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{ICA_LIST_BASE_URL}/{ICA_LIST_ID}/row",
            headers={"Authorization": f"Bearer {token}"},
            json={"text": name, "isStriked": False},
        )
        resp.raise_for_status()
        return resp.json()


def ica_item_exists(rows: list[dict], name: str) -> bool:
    """Check if a non-struck item with matching name exists on the ICA list."""
    needle = name.lower().strip()
    return any(
        r.get("text", "").lower().strip() == needle
        for r in rows
        if not r.get("isStriked", False)
    )


# --- Background ICA sync ---

async def _sync_ica_list():
    """Fetch ICA list and sync on_shopping_list flags in Proviant."""
    try:
        token = await ica_get_token()
        rows = await ica_fetch_list(token)
        ica_names = [r["text"].strip() for r in rows if r.get("text") and not r.get("isStriked", False)]

        db = SessionLocal()
        try:
            all_items = db.query(Item).all()
            matched = 0
            for item in all_items:
                should_be_on = any(items_match(item.name, ica) for ica in ica_names)
                if item.on_shopping_list != should_be_on:
                    item.on_shopping_list = should_be_on
                    if should_be_on:
                        matched += 1
            db.commit()
            logger.info("ICA sync: %d ICA-varor, %d matchade", len(ica_names), matched)
        finally:
            db.close()
    except Exception:
        logger.exception("ICA sync misslyckades")


async def _ica_sync_loop():
    """Background loop that syncs ICA list on interval."""
    while True:
        await _sync_ica_list()
        await asyncio.sleep(ICA_SYNC_INTERVAL * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if ICA_ENABLED:
        task = asyncio.create_task(_ica_sync_loop())
        logger.info("ICA-synk startad (var %d:e minut)", ICA_SYNC_INTERVAL)
    yield
    if ICA_ENABLED:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


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
        tags=item.tags,
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


@app.get("/api/tags")
def list_tags(
    storage_type: Optional[StorageType] = Query(None),
    db: Session = Depends(get_db),
):
    """List all unique tags (split from comma-separated values)."""
    q = db.query(Item.tags).filter(Item.tags.isnot(None), Item.tags != "")
    if storage_type:
        q = q.filter(Item.storage_type == storage_type)
    all_tags = set()
    for (tags_str,) in q.all():
        for tag in tags_str.split(","):
            tag = tag.strip()
            if tag:
                all_tags.add(tag)
    return sorted(all_tags)


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


# --- ICA shopping list ---


class ShoppingListRequest(BaseModel):
    name: str


@app.get("/api/ica-config")
def get_ica_config():
    """Return whether ICA integration is enabled."""
    return {"enabled": ICA_ENABLED}


@app.post("/api/shopping-list")
async def add_to_shopping_list(req: ShoppingListRequest, db: Session = Depends(get_db)):
    """Add item to ICA shopping list and mark it locally."""
    if not ICA_ENABLED:
        raise HTTPException(status_code=503, detail="ICA-integration ej konfigurerad")

    try:
        token = await ica_get_token()
        rows = await ica_fetch_list(token)

        if ica_item_exists(rows, req.name):
            # Mark locally and return early
            all_items = db.query(Item).all()
            for item in all_items:
                if items_match(item.name, req.name):
                    item.on_shopping_list = True
            db.commit()
            return {"ok": True, "alreadyOnList": True, "item": req.name}

        await ica_add_item(token, req.name)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="ICA-anrop misslyckades")

    # Mark matching Proviant items as on_shopping_list
    all_items = db.query(Item).all()
    for item in all_items:
        if items_match(item.name, req.name):
            item.on_shopping_list = True
    db.commit()

    return {"ok": True, "alreadyOnList": False, "item": req.name}


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
