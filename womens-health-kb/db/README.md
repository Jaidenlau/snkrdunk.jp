# Database — the shared spine

Postgres 15+ with the `pgvector` extension. This one database holds **both** the
structured knowledge records and the RAG embeddings, so the Knowledge Base and the
"vector store" are a single system, not two kept in sync.

## Files

| File | What it does |
|---|---|
| `migrations/0001_schema.sql` | Full schema: vocab enums, core tables, cross-links, embeddings + vector index, publish invariants. Implements `../SCHEMA.md`. |
| `migrations/0002_provenance.sql` | Provenance: source `excerpt` + `checked_on`, and a publish rule requiring a recorded quote. |
| `migrations/0003_automated_verification.sql` | Automated verification (no human step): `grounded`, `entailment_confidence`, `corroboration_count`, `claim_relations`; publish requires grounded + entailment ≥ 0.7. See `../VERIFICATION.md`. |
| `seed/0001_pilot_postpartum_confinement.sql` | Pilot data with the automated verification verdict recorded. Requires 0001 + 0002 + 0003 first. |

## Run against Supabase

1. In the Supabase SQL editor (or `psql` to the project), run `migrations/0001_schema.sql`.
2. Then run `seed/0001_pilot_postpartum_confinement.sql`.
   `pgvector` is available on Supabase; the migration enables it with `create extension`.

## Run locally (Postgres 16 + pgvector)

```bash
createdb whkb
psql -d whkb -v ON_ERROR_STOP=1 -f migrations/0001_schema.sql
psql -d whkb -v ON_ERROR_STOP=1 -f migrations/0002_provenance.sql
psql -d whkb -v ON_ERROR_STOP=1 -f migrations/0003_automated_verification.sql
psql -d whkb -v ON_ERROR_STOP=1 -f seed/0001_pilot_postpartum_confinement.sql
```

Both files have been validated end-to-end on Postgres 16 + pgvector 0.6.

## Guarantees baked into the schema

- **Nothing is published without a source and a rating.** A `claims` row with
  `status = 'published'` must have `evidence_level`, `reviewer`, and `review_date`
  set (CHECK constraint) *and* at least one `claim_sources` row (deferred constraint
  trigger). Both are enforced by the database, not by application code.
- **A market-specific fact is its own record.** When markets disagree, each market's
  guidance is a separate `claims` row tagged to its market; `confidence_note`
  cross-references the conflict. We never flatten a conflict into one global answer.
- **Filtered retrieval.** Embedding rows carry `market` / `life_stage` /
  `evidence_level` so the chatbot pre-filters by market, then does vector similarity —
  and every retrieved chunk carries its source + rating back into the answer.

## Embedding dimension

`embeddings.embedding` is `vector(1536)` (OpenAI `text-embedding-3-small`). If you
switch embedding models, change the dimension in the migration and re-embed
(e.g. Voyage `voyage-3` = 1024).

## Next

The ingestion/embedding pipeline (embed on publish) and the Next.js app that reads
this schema are the next build steps — see `../PLAN.md` Phase 0 → Phase 3.
