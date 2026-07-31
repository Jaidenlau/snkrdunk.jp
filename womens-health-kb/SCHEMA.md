# Data Schema — The Shared Spine

**Status:** Draft v1 · for review before Phase 0 build

This is the single schema every system references. The Dashboard filters it, the Chatbot
retrieves from it, and every piece of research is a tagged, cross-linked record inside it —
not a loose document. Getting this right is where "really good" is won.

Target DB: **Postgres (Supabase)** with the **pgvector** extension.

---

## 1. Controlled vocabularies (the taxonomy)

These are the shared tags everything is filtered and cross-linked by. Stored as enums or small
lookup tables so they stay consistent across the journey map, needs map, and competitor profiles.

**`life_stage`** (hierarchical)
- `preconception` *(future)*
- `pregnancy_t1`, `pregnancy_t2`, `pregnancy_t3`
- `postpartum_early` (0–6 weeks), `postpartum_months_1_3`, `postpartum_months_4_12`
- *extensible up the full women's-health lifecycle later*

**`market`**: `US`, `EU`, `CN`, `AU` *(extensible; EU may later split by country/language)*

**`evidence_level`**: `strong_evidence`, `traditional_practice`, `anecdotal`
*(see `EVIDENCE-RUBRIC.md` for definitions)*

**`topic_domain`**: `physical`, `hormonal`, `nutritional`, `emotional_mental`, `medical_clinical`, `social_support`

**`source_type`**: `clinical_guideline`, `peer_reviewed`, `public_health_body`, `textbook`,
`professional_org`, `community_forum`, `product_review`, `marketing`, `news`

---

## 2. Core tables

### `sources`
Every source is a first-class record so a claim can point at exactly what backs it.
| field | type | notes |
|---|---|---|
| id | uuid pk | |
| title | text | |
| publisher | text | e.g. ACOG, NHS, NHC, RANZCOG |
| url | text | |
| source_type | enum | see vocab |
| markets | market[] | which markets this source authorities for |
| published_date | date | nullable |
| retrieved_date | date | when we verified it |
| credibility_tier | int | 1 (guideline/peer-reviewed) → 4 (anecdotal), supports rating |
| notes | text | |

### `claims`
The atomic unit of the KB: one verified statement, tagged and rated.
| field | type | notes |
|---|---|---|
| id | uuid pk | |
| statement | text | the claim itself, written neutrally |
| life_stage | enum | |
| market | enum | a claim is market-specific; the same fact in two markets = two claims if they differ |
| topic_domain | enum | |
| evidence_level | enum | the rating |
| confidence_note | text | why this rating; edge cases; conflicts |
| status | enum | `draft` / `in_review` / `published` |
| reviewer | text | who signed off (us) |
| review_date | date | |
| created_at / updated_at | timestamptz | |

### `claim_sources` (M:N)
A claim can rest on several sources; a source backs many claims.
| claim_id | uuid fk | |
| source_id | uuid fk | |
| relation | enum | `supports` / `contradicts` / `context` |

### `journey_stages`
The browsable map nodes — one per (life_stage × market).
| field | type | notes |
|---|---|---|
| id | uuid pk | |
| life_stage | enum | |
| market | enum | |
| title | text | |
| overview | text | |
| physical / hormonal / nutritional / emotional | text | domain summaries |
| *(claims attach via `stage_claims`)* | | |

### `needs`
The needs-to-solutions map: for each stage/market, what's needed and where solutions fall short.
| field | type | notes |
|---|---|---|
| id | uuid pk | |
| life_stage | enum | |
| market | enum | |
| need_description | text | |
| existing_solutions | text | |
| gap_analysis | text | where current products genuinely fall short |

### `competitors`
Structured competitor/product profiles.
| field | type | notes |
|---|---|---|
| id | uuid pk | |
| company | text | |
| markets | market[] | |
| categories | text[] | product/service categories |
| positioning | text | |
| branding_notes | text | |
| communication_notes | text | tone, channels, messaging |
| claims_made | text | what *they* claim |
| evidence_check | text | how their claims hold up vs our rated evidence |

### Cross-link tables
- `stage_claims` (journey_stage_id, claim_id)
- `need_solutions` (need_id, competitor_id) — links a gap to who addresses it
- `stage_needs` (journey_stage_id, need_id)

These cross-links are what let the Dashboard jump *stage → what addresses it → who sells it*,
and they're all driven off the shared vocab above.

---

## 3. RAG / vector layer (same database)

### `embeddings`
| field | type | notes |
|---|---|---|
| id | uuid pk | |
| entity_type | enum | `claim` / `journey_stage` / `need` / `competitor` |
| entity_id | uuid | points back to the source record |
| chunk_text | text | the chunk that was embedded |
| embedding | vector(1536) | pgvector; dim depends on embedding model |
| life_stage | enum | denormalized for **metadata-filtered retrieval** |
| market | enum | denormalized |
| evidence_level | enum | denormalized |

**Why denormalize the tags onto the embedding row:** the chatbot can pre-filter by market /
evidence level *and then* do vector similarity — so "postpartum recovery in China" retrieves
only CN-tagged passages, and every retrieved chunk carries its source + rating back to the answer.

---

## 4. Design principles

1. **A market-specific fact is a market-specific record.** If US and China guidance differ, that's
   two `claims`, each tagged to its market. We never flatten a conflict into one global answer —
   surfacing the difference *is* the product.
2. **Nothing is published without a source and a rating.** `status=published` requires at least
   one `claim_sources` row and a non-null `evidence_level` + `reviewer`.
3. **The vocab is the contract.** Journey, needs, and competitor records all reference the same
   enums, which is what makes cross-linking and filtered retrieval work at all.
4. **Built to grow.** `life_stage` and `market` are extensible without reshaping anything — the
   schema is the foundation the whole women's-health ecosystem extends from.
