# Backend

FastAPI backend for the Pokémon price tracker MVP.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set a strong `JWT_SECRET_KEY` in `.env` before publishing. Set `ADMIN_EMAIL` to the email address that is allowed to call `/admin/*` endpoints. `MAX_TRACKED_CARDS` controls the sync size and defaults to `500`. `SYNC_PERSIST_BATCH_SIZE` controls how often completed scrape batches are saved to the database.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

The SQLite database is created automatically at startup.

## Useful Endpoints

- `GET /health`
- `GET /cards`
- `GET /cards/{card_id}`
- `POST /auth/register`
- `POST /auth/login`
- `GET /portfolio`
- `POST /portfolio/items`
- `PATCH /portfolio/items/{item_id}`
- `DELETE /portfolio/items/{item_id}`
- `POST /admin/sync-cards`
- `POST /admin/import-cards`

## SNKRDUNK Sync

The sync job targets the public Pokémon trading cards page and the public frontend endpoint used by that page:

`https://snkrdunk.com/en/brands/pokemon/trading-cards?categoryId=25`

`https://snkrdunk.com/en/v1/trading-cards?brandId=pokemon&categoryId=25&order=popular`

It uses `brandId=pokemon`, `categoryId=25`, `order=popular`, and pagination to store up to the **top 500** currently returned cards by default (`MAX_TRACKED_CARDS=500`). It does not use private API keys, bypass authentication, or attempt to defeat protected access. If SNKRDUNK changes its frontend payloads or blocks public extraction, sync exits cleanly and the API continues serving the last stored database state.

### Rate-limit safety

Large syncs run in conservative mode by default:

- `SYNC_FETCH_WORKERS=2` keeps concurrent per-card fetches low.
- `SNKRDUNK_REQUEST_DELAY_SECONDS=0.7` and `SNKRDUNK_REQUEST_JITTER_SECONDS=0.6` add pacing between SNKRDUNK requests across all worker threads.
- `SNKRDUNK_COOLDOWN_SECONDS=1800` stops further SNKRDUNK calls for 30 minutes after a `403` or `429`, preserving the existing database instead of repeatedly retrying blocked endpoints.

These controls do not bypass SNKRDUNK protections; they reduce request pressure and make the sync fail safely when public access is temporarily rate-limited.

### Tracked grades

Per client requirement, only the following grades are stored and rendered: **A, B, C, D, PSA 10**. PSA 10 is shown as the default price on every card. The scraper drops any other grade (PSA 9, BGS *, ARS *, Other Graded) at ingest time, and the startup migration purges any pre-existing rows for those grades.

### Price source: average of last 3 sold

For every (card, grade) the scraper computes the **average of the last 3 sold prices**. There are two data sources, and the scraper prefers the better one when available:

#### Public mode (no login)

Default behaviour. Uses SNKRDUNK's public used-listings endpoint:

`https://snkrdunk.com/en/v1/products/SW---{snkrdunk_id}/used-listings`

This is the same feed that powers the "Listed Items" section on each SNKRDUNK card page. Every entry carries `isSold`, `priceAmount`, and `condition`, so no login is required. The scraper paginates up to 15 pages (≈ 750 listings per card), filters to sold rows in the configured grades (A, B, C, D, PSA 10), sorts by listing id descending (newest listed first), and averages the top 3 per grade. UI label: "Avg of last 3 sold".

The public feed has one limitation: it does not expose sold-at timestamps, so the price chart is built from sync snapshots. Rare grades (e.g. PSA 10 on a popular raw-card) sometimes have zero sold rows publicly visible — in that case the scraper falls back to the lowest active listing and labels it "no recent sales · listing fallback".

#### Authenticated mode (one-time cookie paste, unlocks chart + every sold row)

If you set `SNKRDUNK_BROWSER_CURL` in `backend/.env`, the scraper additionally hits SNKRDUNK's authenticated `/en/v1/products/SW---{id}/sale-prices` endpoint, which returns:

- every recorded sold price (not just the most recent 750 listings)
- a real `soldAt` timestamp on each sale

Those timestamps are stored on `CardSaleEvent.captured_at` and also appended to `PriceHistory`, so the chart on the card detail page becomes a real time-series line — the same chart SNKRDUNK shows on its own card page.

How to enable it (≈ 30 seconds, no automation, no scripts):

1. Open `https://snkrdunk.com/en/trading-cards/729387` in Chrome while logged in.
2. Press **F12** → **Network** tab → reload the page.
3. In the request list, find any row whose URL starts with `/en/v1/...` (e.g. `min-prices-by-conditions` or `used-listings`). Right-click that row → **Copy** → **Copy as cURL (bash)**.
4. Paste the entire cURL string into `backend/.env` as the value of `SNKRDUNK_BROWSER_CURL='...'` (one line, single-quoted).
5. Restart the backend and run a sync. The Trading History panel and chart will populate from the authenticated feed.

When the cookie eventually expires (typically after a few weeks of inactivity, sooner if you log out), `/sale-prices` returns `401`. The scraper logs that and transparently falls back to the public used-listings feed — sync still succeeds, just with the public-mode caveats above. To refresh, repeat steps 1–5.

No private API key, login automation, CAPTCHA bypass, or paywall circumvention is used; the scraper only reuses your own browser's already-authorized cookies.

### Manual Sync

Register or log in with the email configured as `ADMIN_EMAIL`, then call:

```bash
TOKEN="paste-admin-jwt-here"
curl -X POST http://localhost:8000/admin/sync-cards \
  -H "Authorization: Bearer $TOKEN"
```

Admins can also open `/admin` in the frontend after logging in. That page provides browser controls for running the sync and importing fallback JSON.

### JSON Fallback Import

If live extraction is blocked, seed cards with:

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

### Current Limitations

SNKRDUNK can change endpoint names, response shapes, or public bot handling. The app now uses the discovered public endpoint first, logs every fallback path, and preserves the last stored SQLite data if a live sync fails.
