# Master Progress List

**Project:** The Verified Pregnancy & Postpartum Knowledge System (for Bastien)
**Note:** The original proposal is treated as the **bare-minimum** scope. Focus right
now is a **rock-solid, fully-traceable foundation** — not breadth. Everything below
is oriented to that.

Legend: ✅ done · 🟡 partial / in progress · ⬜ to do · 🔑 needs something from client

---

## 1. Foundation & planning
- ✅ Proposal digested, scope + decisions locked
- ✅ `PLAN.md` — roadmap, architecture, vertical-slice strategy
- ✅ `SCHEMA.md` — data model
- ✅ `EVIDENCE-RUBRIC.md` — 3-level rating method
- ✅ `VERIFICATION.md` — verification process + two-level trust model
- 🟡 Per-market trusted-source registry (started in rubric; needs a real curated list per market)

## 2. Database spine (`db/`)
- ✅ Full schema (enums, tables, cross-links, vector layer) — validated on PG16 + pgvector
- ✅ Publish invariant: no publish without source + rating + reviewer (DB-enforced, tested)
- ✅ Provenance columns: source `excerpt` + `checked_on`; `human_confirmed` flag
- ✅ Strengthened rule: no publish without a recorded verifying **quote** (tested)

## 3. Verification & accuracy — THE differentiator (fully automated, no human step)
- ✅ Four-gate automated pipeline: Retrievable → Grounded (verbatim) → Entailed (adversarial) → Corroborated
- ✅ Deterministic grounding gate (`lib/grounding.mjs`) — makes fabrication mechanically impossible
- ✅ Grounding **unit-tested** (`scripts/test-grounding.mjs`): accepts real quotes, rejects fabricated + wrong ones
- ✅ Adversarial entailment via a separate verifier model (`lib/verify.mjs`); runs on deploy with keys
- ✅ Gates enforced by the database (no publish unless grounded + entailment ≥ 0.7) — tested
- ✅ Pilot verified against REAL sources (ACOG, CDC, NHS, PMC) — real URLs, verbatim quotes, dates
- ✅ Pipeline caught a fabricated "quote" and a wrong threshold; AU claim held back as hidden draft
- ✅ Automated **audit view** (`/review`) + `npm run verify` runner + per-claim re-verify
- 🔑 Live re-verification runs on deploy (needs network + ANTHROPIC_API_KEY on Railway/Vercel)
- ⬜ Source + verify the AU postnatal-depression claim (RANZCOG / COPE) so it can pass the gates

## 4. Web app (`app/`)
- ✅ Single shared-password gate (HMAC cookie, edge middleware)
- ✅ Dashboard: stat tiles, market filter, cross-market divergence view, journey cards
- ✅ Stage detail with full provenance (quote, date, source link, verification badge)
- ✅ Competitor landscape (their claims vs our evidence check)
- ✅ Chatbot: RAG, cited, market-aware — with keyword/extractive fallback
- ✅ Verification audit view (`/review`) — automated gate results, re-verify
- ⬜ Dashboard **semantic search bar** (proposal feature; chatbot covers querying for now)
- ⬜ UI cross-linking click-through (stage → needs → competitor); data links already exist
- ⬜ Turn on **real RAG** (needs keys) + run embed pipeline so chatbot uses vector search + Claude 🔑

## 5. Content — the pilot (depth-first)
- ✅ Pilot topic (postpartum confinement) live across US/EU/CN/AU, source-verified pass
- 🟡 Pilot depth: 4 published claims — target ~10–15 **human-confirmed** for the sign-off gate
- 🟡 Competitor profiles: 2, illustrative + flagged — need real, source-verified research
- 🟡 Needs-to-solutions map: 2 illustrative entries — need real ones per stage/market
- ⬜ **You + your wife react** to the pilot (product/direction feedback — not verification; the pipeline handles accuracy)

## 6. Scale (after the gate — the bulk content work)
- ⬜ Full trimester-by-trimester pregnancy map (all 4 markets)
- ⬜ Broad-stage postpartum overview (early recovery → first year)
- ⬜ Full needs-to-solutions map across stages/markets
- ⬜ Full competitor landscape across US/EU/CN/AU

## 7. Deployment & handoff
- ⬜ Provision Supabase + Vercel, connect GitHub auto-deploy → private URL (parked until you say go) 🔑
- ⬜ Plug in your OpenAI + Anthropic keys (swap to client's on handoff) 🔑
- ⬜ "What we need from Bastien" onboarding checklist
- ⬜ Deploy runbook

---

## What's genuinely usable today
The whole system runs locally against a seeded Postgres: dashboard, chatbot,
competitor view, and the reviewer cockpit — all real. What it is **not** yet:
deployed to a URL you can open, and not yet human-confirmed content. Those two are
the immediate next steps.
