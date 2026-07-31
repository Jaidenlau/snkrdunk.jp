# Web App — Dashboard + Chatbot

Next.js (App Router) app that reads the shared spine (`../db`) and serves two
windows onto it: the **Dashboard** (browse/filter/cross-link) and the **Chatbot**
(RAG, cited, market-aware). Private, behind a single shared-password gate.

## Setup

```bash
cd app
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

### Environment (`.env.local`)

| Var | What |
|---|---|
| `DATABASE_URL` | Postgres (Supabase) connection string — the DB from `../db`. |
| `SITE_PASSWORD` | The single shared password to enter the app. |
| `AUTH_SECRET` | Long random string; signs the auth cookie. |
| `OPENAI_API_KEY` | Embeddings (`text-embedding-3-small`). Autoploy's key during build; client's on handoff. |
| `ANTHROPIC_API_KEY` | Chatbot answer generation. |

The app runs **without** the AI keys too: the chatbot falls back to keyword
retrieval + an extractive answer straight from the verified claims, so the flow
is demoable before keys are in. Add the keys to switch on vector search and
Claude-synthesized, market-aware answers.

## Populate the vector layer

After publishing claims, embed them for the chatbot:

```bash
npm run embed     # embeds published claims that don't have an embedding yet
```

## What's here

```
app/
  app/            routes: / (dashboard), /stage/[id], /competitors, /chat, /login
  components/     Nav, MarketFilter, EvidenceBadge, MarketTag, ClaimCard, ChatUI
  lib/            db (pg pool), data (dashboard queries), rag (retrieval + answer), auth, types
  scripts/        embed.mjs — embed-on-publish pipeline
  middleware.ts   single-password gate (Edge)
```

## Auth

`middleware.ts` protects every route except `/login`. On correct password the
`/api/login` route sets an HMAC-signed cookie (no user data, unforgeable without
`AUTH_SECRET`). Swap `SITE_PASSWORD` any time.

## Deploy

Vercel + Supabase. Set the same env vars in the Vercel project. On client handoff,
swap `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` to the client's and transfer the
Supabase/Vercel projects — no code changes needed.
