# Proviant

Hemforrådshantering — håll koll på vad som finns i frysen, kylen och skafferiet.
Byggd för self-hosting via Docker (Unraid, hemserver, VPS).

## Features

- **Flerlagerstöd** — Frys, kyl och skafferi i separata vyer
- **Kategorier** — Organisera med fria kategorier, automatiska emoji-ikoner (kött, fågel, fisk m.fl.)
- **Bäst före-datum** — Varningar när saker håller på att gå ut
- **Sökfunktion** — Hitta snabbt det du letar efter
- **Filter** — Filtrera på status (slut, lågt, utgående) och kategorier
- **Swipe-to-delete** — Svep för att radera, med haptisk feedback
- **ICA-integration** — Lägg till varor på ICA-inköpslistan via n8n-webhook, med tvåvägssynk
- **PWA** — Installera som app på mobilen (standalone-läge)
- **REST API** — Fullt API för integrationer

## Kör med Docker

```bash
docker compose up -d
```

Öppna http://localhost:8099

## Kör lokalt (utveckling)

```bash
pip install -r requirements.txt
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

## Miljövariabler

| Variabel               | Default                              | Syfte                          |
|------------------------|--------------------------------------|--------------------------------|
| `DATA_DIR`             | `/app/data`                          | Katalog för SQLite-filen       |
| `DATABASE_URL`         | `sqlite:///{DATA_DIR}/proviant.db`   | SQLAlchemy-anslutning          |
| `SHOPPING_WEBHOOK_URL` | (ingen)                              | n8n-webhook för ICA-tillägg    |
| `SHOPPING_WEBHOOK_KEY` | (ingen)                              | API-nyckel för webhook-auth    |
| `SYNC_API_KEY`         | faller tillbaka på `SHOPPING_WEBHOOK_KEY` | API-nyckel för ICA-synk   |

Se `.env.example` för mall.

## API

| Metod  | Endpoint                    | Beskrivning                    |
|--------|-----------------------------|--------------------------------|
| GET    | /api/items                  | Lista alla saker               |
| POST   | /api/items                  | Lägg till ny sak               |
| GET    | /api/items/{id}             | Hämta en sak                   |
| PUT    | /api/items/{id}             | Uppdatera en sak               |
| PATCH  | /api/items/{id}/quantity    | Snabbuppdatera antal           |
| DELETE | /api/items/{id}             | Ta bort en sak                 |
| GET    | /api/summary                | Sammanfattning per lagertyp    |
| GET    | /api/categories             | Lista kategorier               |
| POST   | /api/shopping-list          | Lägg till på ICA-inköpslistan  |
| POST   | /api/ica-sync               | Ta emot ICA-lista från n8n     |
| GET    | /api/version                | Appversion                     |

### Filtrering

`GET /api/items?storage_type=freezer&category=Kött&search=kyckling&out_of_stock=true&low_stock=true`

## Roadmap

- [ ] Mealie-integration (receptingredienser)
- [ ] Historik / förbrukningsstatistik
- [ ] Streckkodsskanning
