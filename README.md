# 🧊 Proviant

Hemförrådshantering — håll koll på vad som finns i frysen, kylen och skafferiet.

## Features

- **Flerlagerstöd** — Frys, kyl och skafferi i separata vyer
- **Kategorier** — Organisera med fria kategorier (kött, grönsaker, bröd etc.)
- **Bäst före-datum** — Varningar när saker håller på att gå ut
- **Sökfunktion** — Hitta snabbt det du letar efter
- **API** — REST API för integrationer

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

## API

| Metod  | Endpoint              | Beskrivning          |
|--------|-----------------------|----------------------|
| GET    | /api/items            | Lista alla saker     |
| POST   | /api/items            | Lägg till ny sak     |
| GET    | /api/items/{id}       | Hämta en sak         |
| PUT    | /api/items/{id}       | Uppdatera en sak     |
| DELETE | /api/items/{id}       | Ta bort en sak       |
| GET    | /api/summary          | Sammanfattning       |
| GET    | /api/categories       | Lista kategorier     |

### Filtrering

`GET /api/items?storage_type=freezer&category=Kött&search=kyckling`

## Roadmap

- [ ] Mealie-integration (receptingredienser)
- [ ] ICA-inköpslistekoppling
- [ ] Historik / förbrukningsstatistik
- [ ] Streckkodsskanning
