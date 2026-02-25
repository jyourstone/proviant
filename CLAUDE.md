# Proviant

Swedish home pantry management app — track items across freezer (frys), fridge (kyl), and pantry (skafferi). Built for self-hosting on Docker (Unraid, home servers, VPS).

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, Pydantic 2, SQLite
- **Frontend:** Vanilla JS, HTML5, CSS3 — no build step, no framework
- **Infra:** Docker, Docker Compose, GitHub Actions → ghcr.io

## Structure

```
backend/app/
  main.py       # All FastAPI routes
  models.py     # SQLAlchemy ORM (single `items` table)
  schemas.py    # Pydantic request/response schemas
  database.py   # Session management, init_db()
frontend/
  app.js        # All frontend logic (single file)
  style.css     # Mobile-first styles with CSS variables
  index.html
  manifest.json # PWA config
```

## Development

```bash
# Local (hot-reload)
pip install -r requirements.txt
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Docker
docker compose up -d   # runs on :8099
```

No test suite currently. Verify changes manually via the browser UI or `GET /api/summary`.

## Key Patterns

**Backend:** Add a field → update `models.py` → update `schemas.py` → update route in `main.py`. SQLAlchemy auto-creates/migrates tables on startup via `init_db()`.

**Frontend:** All state lives in globals (`currentStorage`, `allItems`, etc.). API calls use `fetch()` then re-render the item list. No build step — edits are immediately live.

**Language:** All UI text is Swedish. Keep new UI strings in Swedish.

## Environment

| Variable       | Default                        | Purpose                   |
|----------------|-------------------------------|---------------------------|
| `DATA_DIR`     | `/app/data`                   | Directory for SQLite file |
| `DATABASE_URL` | `sqlite:///{DATA_DIR}/proviant.db` | SQLAlchemy connection |
