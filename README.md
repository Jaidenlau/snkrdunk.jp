# Pokemon Price Tracker

A clean MVP for tracking Pokemon card prices from public SNKRDUNK data and managing a basic collection portfolio.

## Stack

- Backend: FastAPI, SQLAlchemy, SQLite, JWT auth, APScheduler
- Frontend: Next.js, TypeScript, Tailwind CSS
- Data source: public SNKRDUNK Pokemon trading card page and public frontend/network-style responses

## Run Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

Manual data sync:

```bash
TOKEN="paste-admin-jwt-here"
curl -X POST http://localhost:8000/admin/sync-cards \
  -H "Authorization: Bearer $TOKEN"
```

Admin endpoints require a logged-in user whose email matches `ADMIN_EMAIL` in `backend/.env`.

## Run Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## SNKRDUNK Extraction Reliability

The scraper uses only public pages and the public frontend request used by SNKRDUNK's trading-card page:

`https://snkrdunk.com/en/brands/pokemon/trading-cards?categoryId=25`

`https://snkrdunk.com/en/v1/trading-cards?brandId=pokemon&categoryId=25&order=popular`

SNKRDUNK can change page structure, endpoint names, or anti-bot handling at any time. When extraction fails, the sync logs the reason, returns safely, and the app continues to serve whatever is already in SQLite. No private API key, paid API, CAPTCHA bypass, or authenticated access is used.

If live extraction is blocked, import fallback JSON:

```bash
TOKEN="paste-admin-jwt-here"
curl -X POST http://localhost:8000/admin/import-cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "name": "Sample Pikachu",
      "product_url": "https://snkrdunk.com/en/trading-cards/sample",
      "image_url": "https://example.com/pikachu.png",
      "current_price": 25,
      "currency": "USD",
      "popularity_rank": 1,
      "snkrdunk_id": "sample"
    }
  ]'
```

## Project Structure

```text
pokemon-price-tracker/
  backend/
  frontend/
```
