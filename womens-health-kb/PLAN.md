# The Verified Pregnancy & Postpartum Knowledge System — Build Plan

**Client:** Bastien · **Delivered by:** Autoploy · **Status:** Planning (draft v1)

This is the working plan for the three-system foundation described in the proposal:
a **verified Knowledge Base**, a **Dashboard** to browse it, and a **Chatbot** to query it —
all on one shared data architecture across four markets (US, Europe, China, Australia).

> These are drafts. Everything here is meant to be reacted to and edited, not signed in blood.

---

## 1. Decisions locked (kickoff)

| Decision | Choice | Implication for the build |
|---|---|---|
| **Verification authority** | An **automated verification pipeline** — no human-confirm step. The AI may only surface a claim whose supporting quote is verbatim-grounded in a real source and survives adversarial entailment. | See `VERIFICATION.md`: four machine-checked gates, enforced by the database. Accuracy scales without a person in the loop. |
| **Access posture** | Private, login-gated web app. One URL, invite-only. | Auth from day one. Keeps the asset hidden — that secrecy *is* part of the moat. Public exposure is a later, deliberate choice. |
| **AI API keys** | Autoploy's keys during build; swap to client's keys on handoff. | All model/provider config lives in env vars. Handoff = swap keys, no code change. |
| **Content strategy** | Depth-first. Small, excellent slice → sign-off → scale. | We build **one narrow vertical slice through the entire stack first**, prove quality, then mass-produce. |

---

## 2. Positioning guardrail (bake in from entry #1)

We are not licensed clinicians, and we are the rating authority. So the product is framed as
**evidence-strength curation, not medical advice.**

- Every chatbot answer carries a clear "not medical advice — verify with your clinician" disclaimer.
- We rate *how strong the evidence is*; we never tell a user what to do.
- This is honest, it's rigorous, and it protects both Bastien and Autoploy. It also *strengthens*
  the pitch — it's exactly the discipline competitors skip.

---

## 3. Architecture

One shared data spine, two windows onto it.

```
                    ┌─────────────────────────────────────────┐
                    │   Supabase (Postgres + pgvector)         │
                    │   • structured records (the KB)          │
                    │   • vector embeddings (same DB)          │
                    │   → KB and "vector store" are ONE system │
                    └───────────────┬─────────────────────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                      │
        ┌────────▼─────────┐                  ┌─────────▼────────┐
        │   Dashboard      │                  │    Chatbot       │
        │ (browse/filter/  │                  │ (RAG, cited,     │
        │  cross-link)     │                  │  market-aware)   │
        └──────────────────┘                  └──────────────────┘
                 │                                      │
                 └──────────── Next.js app ─────────────┘
                        (Vercel, login-gated)
```

- **Database:** Supabase Postgres with the `pgvector` extension. Structured KB records *and*
  their embeddings live in the same database — this is literally the proposal's "one shared
  data architecture," not two systems kept in sync.
- **App:** Next.js on Vercel. Dashboard and Chatbot are two views inside one login-gated app.
- **Content pipeline:** AI agents draft & extract → **automated verification (retrieve → verbatim-ground → adversarial entailment)** →
  publish → auto-embed for retrieval.
- **RAG:** KB chunks are embedded with metadata (life_stage, market, evidence_level) so the
  chatbot can retrieve *market-filtered, evidence-tagged* passages and cite them — not generate
  from general training knowledge.
- **Keys/config:** all provider keys in env vars → clean handoff swap.

See `SCHEMA.md` for the data model and `EVIDENCE-RUBRIC.md` for the rating method.

---

## 4. The pilot slice (the quality bar)

We do **one narrow topic all the way through the stack** before building anything wide.

**Proposed pilot topic: postpartum early recovery — confinement & rest practices.**

Why this one:
- It's the topic where the four markets *genuinely disagree* — US (ACOG) rest/activity guidance
  vs China's TCM confinement (坐月子) traditions vs NHS vs RANZCOG. Reconciling that conflict
  is the single hardest thing in the proposal, so proving it here proves everything.
- It naturally spans all three evidence levels: **strong evidence** (e.g. postpartum hemorrhage
  warning signs), **traditional practice** (confinement customs), **anecdotal** (forum wisdom).
- It's small enough to finish and polish, big enough to be a real demo.

**Pilot deliverable (~10–15 verified claims + a few linked competitor profiles):**
- Schema populated for this slice across all 4 markets
- Every entry sourced, dated, evidence-rated, human-reviewed
- Dashboard renders the slice (filter by market + evidence level)
- Chatbot correctly answers *"How does postpartum recovery guidance differ, US vs China?"* —
  with citations, dates, evidence tags, and the disclaimer

**The gate:** you and your wife look at the pilot and say *"yes, this is the quality we want."*
Nothing scales until that sign-off. (Open to a different pilot topic — this is a recommendation.)

---

## 5. Roadmap

Ordered by dependency, not by the three deliverables. The spine comes before any content.

### Phase 0 — The spine
- Finalize the schema / taxonomy (`SCHEMA.md`)
- Stand up Supabase (Postgres + pgvector), migrations for the schema
- Next.js app shell with login-gated auth, empty Dashboard + Chatbot routes
- Env-var config for all keys (build keys now, handoff later)

### Phase 1 — Source registry + rating method
- Curated trusted-source list per market (ACOG / NHS+EMA / China NHC / RANZCOG + peer-reviewed + reputable public-health bodies)
- The evidence-rating rubric, written and agreed (`EVIDENCE-RUBRIC.md`)
- The review workflow: how a claim goes draft → in-review → published

### Phase 2 — Pilot slice
- Populate the pilot topic end-to-end across 4 markets, human-reviewed
- Your + wife's sign-off on quality **← gate**

### Phase 3 — Dashboard + Chatbot on the pilot
- Dashboard: journey view, market filter, evidence indicators, cross-links, semantic search
- Chatbot: RAG grounded in the pilot data, cited, market-aware, disclaimer
- Prove both windows on real data

### Phase 4 — Scale
- With schema + rubric + quality bar locked, run the AI-assisted pipeline to mass-produce:
  trimester-by-trimester pregnancy map, broad-stage postpartum, needs-to-solutions map,
  full competitor landscape — always reviewed against the known-good standard.

---

## 6. What we'll need from Bastien (to be formalized)

A proper branded "what we need from your side" checklist will be generated separately. Early list:
- The two users' emails for login access
- Any sources they *already* trust or want prioritized (proposal's kickoff item)
- Any existing brand assets (name, logo, colors) if the app should be branded
- On handoff: their own AI provider account (Anthropic/OpenAI) + Supabase/Vercel ownership transfer

---

## 7. Open items for next working session

1. Confirm or swap the **pilot slice topic** (§4).
2. Confirm the **tech stack** (Supabase + Next.js/Vercel) — or flag any client preference.
3. Confirm the **markets list** stays US / EU / CN / AU for v1.
4. Lock the **schema** (`SCHEMA.md`) so Phase 0 can start.
5. Lock the **evidence rubric** (`EVIDENCE-RUBRIC.md`).
