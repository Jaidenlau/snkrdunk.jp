# Deploy Runbook — Railway (database) + Vercel (app)

Goal: the app live at a private URL, auto-deploying on every push. ~20 minutes.
Follow in order. Each step says exactly what to click and what to paste.

The app lives in the repo subfolder **`womens-health-kb/app`** — that detail matters
in two places below (marked ⚠️).

---

## 0. What you need first
- The GitHub repo connected (you have it).
- An **OpenAI API key** (embeddings) and an **Anthropic API key** (chatbot + verifier).
- `psql` on your machine to load the schema (macOS: `brew install libpq` then
  `brew link --force libpq`; or use Railway's built-in **Query** tab instead — noted below).

---

## 1. Database on Railway (Postgres + pgvector)

1. Go to **railway.app → New Project → Deploy PostgreSQL**.
2. Open the Postgres service → **Variables** tab → copy **`DATABASE_URL`** (the public one).
3. Confirm pgvector is available. In the Postgres service → **Data**/**Query** tab, run:
   ```sql
   create extension if not exists vector;
   ```
   - ✅ If it succeeds, continue.
   - ❌ If it errors (`could not open extension control file`), delete this service and
     instead do **New → Deploy from Docker Image → `pgvector/pgvector:pg16`**, set a
     `POSTGRES_PASSWORD` variable, and use that service's connection string. (This image
     ships pgvector.) Then re-run the `create extension` line.

4. Load the schema, verification layer, and pilot data. Either paste each file's contents
   into Railway's **Query** tab **in this order**, or from your machine:
   ```bash
   cd womens-health-kb/db
   export DATABASE_URL="postgresql://…"   # the Railway public URL
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0001_schema.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0002_provenance.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0003_automated_verification.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed/0001_pilot_postpartum_confinement.sql
   ```
   Sanity check: `psql "$DATABASE_URL" -c "select count(*) from claims where status='published';"`
   → should return **4**.

---

## 2. App on Vercel

1. **vercel.com → Add New → Project → import the GitHub repo.**
2. ⚠️ **Set Root Directory to `womens-health-kb/app`** (Edit next to Root Directory during
   import). Framework preset auto-detects **Next.js**. Leave build/output commands default.
3. Add **Environment Variables** (Settings → Environment Variables), for Production:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Railway connection string from step 1 |
   | `SITE_PASSWORD` | the shared password you and your wife will type to enter |
   | `AUTH_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
   | `OPENAI_API_KEY` | your OpenAI key |
   | `ANTHROPIC_API_KEY` | your Anthropic key |
   | `EMBEDDING_MODEL` | `text-embedding-3-small` |
   | `CHAT_MODEL` | `claude-3-5-sonnet-latest` |

4. Click **Deploy**. First build takes ~1–2 min. When it's green, open the URL → you'll
   hit the password gate → enter `SITE_PASSWORD` → you're in.

The build does **not** touch the database (all data pages are server-rendered on demand),
so a missing/locked DB can't fail the build.

---

## 3. Turn on real RAG (embeddings) and live verification

These use the hosted DB + your keys. Run from your machine (or any box with network):

```bash
cd womens-health-kb/app
npm install
# point at the hosted DB + keys (or copy .env.example to .env.local and fill it)
export DATABASE_URL="postgresql://…"       # Railway
export OPENAI_API_KEY="sk-…"
export ANTHROPIC_API_KEY="sk-ant-…"

npm run embed     # embeds published claims -> chatbot & search use vector search
npm run verify    # re-runs the 4-gate pipeline against LIVE sources
```

- After `npm run embed`, the chatbot and the search bar use semantic vector search
  (before it, they fall back to keyword search — still functional).
- `npm run verify` re-grounds every quote against the live pages and re-runs adversarial
  entailment; it only updates a claim when its sources are reachable (never falsely demotes).

---

## 4. Auto-deploy (already on)

Vercel is now connected to the repo. **Every push to the branch auto-builds and deploys** —
no manual step. That's the workflow you wanted: changes go live on push.

---

## Troubleshooting
- **Build fails "No Next.js detected"** → Root Directory isn't `womens-health-kb/app` (step 2.2).
- **App loads but 500 on every page** → `DATABASE_URL` wrong, or the schema wasn't loaded
  (step 1.4). Check the Vercel **Functions** logs.
- **`create extension vector` errors** → use the `pgvector/pgvector` image (step 1.3).
- **Chatbot says "I don't have verified info"** → embeddings not populated; run `npm run embed`.
- **Password page loops** → `AUTH_SECRET` must be identical everywhere and set in Production.
