# Evidence-Rating Rubric

**Status:** Draft v1 · for review before Phase 1

Because Autoploy is the human judgment layer, every rating has to stand on a written method,
not a feeling. This rubric is that method. It's what makes the whole base *trustworthy* rather
than just comprehensive-looking — and it's what we can show Bastien to prove the rigor.

Every `claim` gets exactly one `evidence_level`. The `confidence_note` field records *why*.

---

## The three levels

### 🟢 `strong_evidence`
Backed by high-quality, authoritative sources.
- **Qualifies when:** supported by a current clinical guideline (ACOG, NHS, NHC, RANZCOG, EMA),
  a systematic review / meta-analysis, or consistent peer-reviewed research — *and* not
  contradicted by an equally authoritative source in that market.
- **Source tiers:** credibility tier 1–2.
- **Example:** "Heavy postpartum bleeding soaking more than one pad per hour is a warning sign
  requiring urgent medical review." (ACOG / RANZCOG aligned.)

### 🟡 `traditional_practice`
A practice that is culturally established and widely followed, but not established by clinical
evidence — and not dismissed as mere anecdote either.
- **Qualifies when:** documented as standard practice within a market's mainstream care culture
  (e.g. TCM postpartum confinement / 坐月子 in China), whether or not clinical trials support it.
- **Source tiers:** may be tier 1–3 (a national body may *describe* the practice even if evidence
  is limited).
- **Example:** "In China, postpartum confinement (zuò yuè zi) prescribes ~30 days of rest and
  dietary restriction." — mainstream everyday guidance in CN, *not* standard ACOG advice in US.

### 🔴 `anecdotal`
Individual experience or community wisdom, not established practice or clinical evidence.
- **Qualifies when:** sourced from forums, reviews, or communities — how women describe their
  lived experience, valuable for capturing real language and gaps, but explicitly unverified.
- **Source tiers:** tier 4.
- **Example:** "Many mothers on forums report that a warm compress helped with engorgement."

---

## Rating procedure

1. **Find the best available source** for the claim in that market; attach it (`claim_sources`).
2. **Assign the level** by the definitions above — driven by *source authority*, not how true it
   feels.
3. **Record the reasoning** in `confidence_note`, especially any conflict or edge case.
4. **Human review** before `status → published`. The reviewer is named; nothing self-publishes.

---

## Cross-market conflict rule

When markets disagree, **we do not pick a winner and we do not average.**
- Each market's guidance becomes its **own** market-tagged claim, rated on its own merits.
- The `confidence_note` cross-references the conflicting claim so the Dashboard and Chatbot can
  surface *"US says X (strong), China says Y (traditional practice)"* side by side.
- Surfacing the difference honestly is the moat. Flattening it is what competitors do.

---

## Edge cases to decide together

- **Emerging evidence** (promising but not yet guideline-backed): do we need a 4th level like
  `emerging_evidence`, or does it sit as `strong_evidence` with a cautious `confidence_note`?
- **Expert consensus without formal trials**: `strong_evidence` or its own tag?
- **A traditional practice with*some* clinical support**: how do we tag the overlap?

Recommendation: **start with the three levels**, add a level only if the pilot slice proves we
genuinely can't classify something cleanly. Simpler is more trustworthy.
