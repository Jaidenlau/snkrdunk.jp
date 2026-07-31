# Verification Process — how a claim earns "verified"

**Status:** v1 · This is the discipline that separates this knowledge base from
scraped wellness content. Accuracy is the product. Read this before adding data.

Autoploy is the judgment layer (see `PLAN.md`). That means no claim is trustworthy
because an AI wrote it — it's trustworthy because it was checked against a real
source and that check is on the record. This document is how.

---

## The bar

A claim may be **published** only when all of the following are true:

1. It names a **real, retrievable, authoritative source** appropriate to its market
   (see the source registry in `EVIDENCE-RUBRIC.md`).
2. The **exact supporting quote** from that source is recorded (`claim_sources.excerpt`).
3. The **date it was checked** is recorded (`claim_sources.checked_on`).
4. It carries an **evidence rating** (`strong_evidence` / `traditional_practice` /
   `anecdotal`) and a **reviewer** + **review_date**.

The database **enforces 1–4**: `status = 'published'` is rejected unless a supporting
source with a non-empty excerpt exists (migration `0002_provenance.sql`). You
physically cannot publish a claim with no quote on file.

## Two levels of trust

| State | Meaning | Shown to users? |
|---|---|---|
| `draft` | Not yet checked. | No. |
| `published`, `human_confirmed = false` | Checked against the source in an **automated pass**; excerpt + date on file. | Yes — flagged as "source-checked, pending human confirmation". |
| `published`, `human_confirmed = true` | A **person opened the live source** and confirmed the quote and rating. | Yes — the strongest trust badge. |

**Why the two levels?** Many authoritative medical sites (ACOG, CDC, NHS, PMC)
**block automated retrieval** (HTTP 403). An automated pass can corroborate a claim
via search, but it cannot stand as final proof. A human opening the page is the real
bar. `human_confirmed` records who did that. Until they do, the entry is honest about
its own status rather than pretending.

## The workflow

```
 discover  →  draft  →  source-check (record excerpt + date)  →  published (human_confirmed=false)
                                                                        │
                                                        human opens live page, confirms
                                                                        ▼
                                                             published (human_confirmed=true)
```

- **Unverifiable → stays `draft`.** If a source can't be found or the claim doesn't
  match it, it does not get published. (In the pilot, the AU postnatal-depression
  claim is left as `draft` on purpose to show this.)
- **Conflicts are not resolved, they're recorded.** When markets disagree, each
  market's guidance is its own claim, and a `contradicts` link + `confidence_note`
  cross-reference the other. See the US/EU vs CN divergence in the pilot.
- **Corrections are logged in `confidence_note`.** During the pilot pass we caught a
  real error — an early draft said "one pad per hour" for the bleeding warning sign;
  ACOG's actual emergency threshold is *two* pads an hour for more than an hour or
  two. The correction is recorded on the claim. This is the process catching exactly
  the kind of mistake it exists to catch.

## Pilot verification status (2026-07-31)

| Claim | Market | Rating | Source(s) | State |
|---|---|---|---|---|
| Heavy-bleeding warning sign (corrected threshold) | US | strong | ACOG, CDC HEAR HER | published · human_confirmed=false |
| 6–8 week postnatal check / lochia | EU | strong | NHS | published · human_confirmed=false |
| Zuo yuezi ~30-day prevalence | CN | traditional | PMC peer-reviewed | published · human_confirmed=false |
| Confinement bathing restriction | CN | traditional | PMC peer-reviewed | published · human_confirmed=false |
| Postnatal depression screening | AU | — | (none yet) | **draft — hidden** |
| Competitor profiles | US/CN | — | illustrative | not source-verified (flagged) |

**Next step to reach full trust:** a person opens each live source above and flips
`human_confirmed = true` (or corrects it). That is the last mile the automated pass
deliberately does not claim to have walked.
