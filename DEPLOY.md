# Deploying (getting the site live again)

The app is two pieces that deploy separately:

| Piece      | Folder     | Host (recommended) | What it is                    |
| ---------- | ---------- | ------------------ | ----------------------------- |
| Frontend   | `frontend` | **Vercel**         | Next.js website you visit     |
| Backend    | `backend`  | **Render**         | FastAPI + SQLite data/API     |

Deploy the **backend first** (you need its URL for the frontend), then the frontend.

---

## 1. Backend on Render (~5 min)

This repo ships a `render.yaml` blueprint, so Render sets almost everything up for you.

1. Push this repo to GitHub (see bottom of this file).
2. Go to <https://render.com> → sign up / log in with GitHub.
3. **New +** → **Blueprint** → select this repository. Render reads `render.yaml`
   and creates the `snkrdunk-backend` web service.
4. When prompted, fill in the two values it asks for:
   - `ADMIN_EMAIL` — the email you'll register with to unlock the `/admin` page.
   - `FRONTEND_ORIGIN` — leave blank for now; you'll set it after Vercel gives you a URL.
5. Click **Apply**. Wait for the build to go green.
6. Test it: open `https://<your-backend>.onrender.com/health` — you should see
   `{"status":"ok"}`. Copy this base URL; you need it next.

> **Free-tier notes:** the service sleeps after ~15 min idle (first request after
> that takes ~30s to wake up), and the SQLite database resets on redeploy / cold
> start. That's fine for testing. To keep data permanently, upgrade the plan and
> add a Disk, or switch to a hosted Postgres (set `DATABASE_URL`).

*(Prefer Railway instead? It works too — point it at the `backend` folder and it
will use the included `Procfile`. Set the same env vars manually.)*

---

## 2. Frontend on Vercel (~3 min)

1. Go to <https://vercel.com> → log in with GitHub → **Add New… → Project** →
   import this repository.
2. **Important:** set **Root Directory** to `frontend` (the framework auto-detects
   as Next.js).
3. Add one Environment Variable:
   - `NEXT_PUBLIC_API_URL` = your Render backend URL from step 1
     (e.g. `https://snkrdunk-backend.onrender.com`, no trailing slash).
4. **Deploy.** Vercel gives you a URL like `https://your-app.vercel.app`.

Any `*.vercel.app` URL is already allowed by the backend's CORS. If you later add
your custom domain **snkrdunk.jp**, go back to Render and set `FRONTEND_ORIGIN` to
`https://snkrdunk.jp,https://www.snkrdunk.jp`.

---

## 3. Point snkrdunk.jp at it (optional, when ready)

- In Vercel → Project → **Settings → Domains** → add `snkrdunk.jp` and
  `www.snkrdunk.jp`. Vercel shows the exact DNS records (an `A` record and/or a
  `CNAME`) to add at your domain registrar.
- After DNS propagates, set `FRONTEND_ORIGIN` on Render as noted above and redeploy.

---

## 4. Get some cards to show up

A fresh backend starts with an empty database. Two ways to populate it:

- **Automatic sync:** register your `ADMIN_EMAIL` account in the app, open
  `/admin`, and run a sync. This pulls public SNKRDUNK data — it may be rate-limited
  or blocked from a datacenter IP, in which case it fails safely and shows nothing.
- **Manual import (always works):** use the admin import endpoint to seed cards.
  After logging in as the admin, from `/admin` paste JSON, or via curl:

  ```bash
  TOKEN="paste-admin-jwt"
  curl -X POST https://<your-backend>.onrender.com/admin/import-cards \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '[{"name":"Sample Pikachu","product_url":"https://snkrdunk.com/en/trading-cards/sample","image_url":"https://example.com/pikachu.png","current_price":25000,"currency":"JPY","popularity_rank":1,"snkrdunk_id":"sample"}]'
  ```

---

## Pushing this repo to GitHub

If it isn't on GitHub yet:

```bash
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
