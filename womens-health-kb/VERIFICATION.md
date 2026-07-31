# Verification Process — automated, no human in the loop

**Status:** v2 · This is the discipline that separates this knowledge base from
scraped wellness content. Accuracy is the product, and it is achieved by a
machine-checkable pipeline — **not** by a person clicking "confirm".

The core principle: **the AI is never allowed to assert a fact from its own
memory.** It can only surface a claim if a real retrieved source *literally
contains a quote* that supports it, and that support survives adversarial checking.

---

## The four gates

Every claim must clear all four. Gates 1, 2, 4 are deterministic; gate 3 is an
adversarial model check. The results are stored on the claim and enforced by the
database — a claim that fails a gate cannot be `published`.

### Gate 1 — Retrievable
The source URL must actually return readable text. The fetcher is multi-strategy
(browser-style request → reader proxy) so bot-blocks don't stop it. If a source
can't be retrieved, it cannot be a basis. → `claim_sources.grounded` starts false.

### Gate 2 — Grounded (verbatim, deterministic)
The stored quote must appear **character-for-character** (after conservative
unicode/whitespace normalization) in the retrieved text. This is a string match,
implemented in `app/lib/grounding.mjs` — **not** a model opinion. A quote the
source does not contain **cannot** pass, however plausible it sounds. Proven by
`app/scripts/test-grounding.mjs`, which accepts the real quotes and rejects both a
fabricated sentence and a plausible-but-wrong "one pad per hour" threshold.

### Gate 3 — Entailed (adversarial)
A **separate** verifier model receives **only the grounded quotes** (never its own
memory) and is told to *try to refute* that they support the claim. The claim
passes only if it can't, at confidence ≥ 0.7. Different model/prompt than the
drafter, so there's no self-agreement. → `claims.entailment_confidence`.

### Gate 4 — Corroborated
`strong_evidence` should rest on ≥ 2 independent grounded sources. Cross-market
conflicts are **recorded** (as `claim_relations`), never averaged away.
→ `claims.corroboration_count`.

## What the database enforces

`status = 'published'` is rejected unless:
- a supporting source with a non-empty **excerpt** exists (migration 0002), and
- `grounded = true` (every supporting quote verbatim-verified), and
- `entailment_confidence >= 0.7` (migration 0003).

Tested: publishing an ungrounded claim, or a grounded one below threshold, throws.

## The pipeline

```
 draft ──▶ retrieve source text ──▶ verbatim-ground each quote ──▶ adversarial entailment
                                          │ (fail)                        │ (fail / low conf)
                                          ▼                               ▼
                                    stays hidden                    stays hidden (in_review/draft)
                                          │ (all pass, conf ≥ 0.7)
                                          ▼
                                      published (with machine verdict recorded)
```

- Code: `app/lib/verify.mjs` (retrieve + entail + orchestrate), `app/lib/grounding.mjs`
  (deterministic grounding).
- Run over the whole base: `npm run verify`. Per-claim, on demand: the **Verification**
  page (`/review`) → "Re-verify".
- On deploy (Railway/Vercel) the pipeline runs against live sources; in a locked-down
  environment it declines to overwrite rather than falsely demote.

## What the pipeline caught (pilot)

- A **fabricated "quote"** used to express a cross-market conflict — rejected by Gate 2.
  Conflicts are now analytic `claim_relations` between two independently-grounded
  claims, not fake source quotes.
- A **plausible but wrong** bleeding threshold ("one pad per hour") — the grounded
  source says *two* pads. Gate 2 rejects the wrong version; the correction is logged.
- The **AU** claim had no retrievable grounded source → held back as `draft`, hidden.

## Honesty about scope

This verifies that *a real source literally says X*, checked adversarially. It is
**evidence-strength curation, not medical advice** — the chatbot always carries that
disclaimer. The pipeline makes fabrication mechanically impossible; it does not turn
the system into a clinician.
