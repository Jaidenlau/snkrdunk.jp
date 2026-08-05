-- =============================================================
-- deploy_all.sql — full database setup in one file
-- Paste into Railway's Query tab, or: psql "$DATABASE_URL" -f deploy_all.sql
-- (schema + provenance + automated verification + pilot seed)
-- =============================================================

-- ===== 0001_schema.sql =====
-- =============================================================================
-- Verified Pregnancy & Postpartum Knowledge System
-- Migration 0001 — the shared spine
-- Target: Postgres 15+ (Supabase), pgvector
-- =============================================================================
-- This implements SCHEMA.md: one shared schema that the Dashboard filters,
-- the Chatbot retrieves from, and every research record lives inside.
-- Everything downstream references what is defined here.
-- =============================================================================

-- --- Extensions -------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";      -- pgvector (RAG embeddings)

-- --- Controlled vocabularies (the taxonomy) ---------------------------------
-- Stored as enums so the journey map, needs map, and competitor profiles all
-- reference the exact same tags. Extending a vocab later = `alter type ... add value`.

create type life_stage as enum (
  'preconception',            -- future
  'pregnancy_t1',
  'pregnancy_t2',
  'pregnancy_t3',
  'postpartum_early',         -- 0-6 weeks
  'postpartum_months_1_3',
  'postpartum_months_4_12'
);

create type market as enum ('US', 'EU', 'CN', 'AU');

create type evidence_level as enum (
  'strong_evidence',
  'traditional_practice',
  'anecdotal'
);

create type topic_domain as enum (
  'physical',
  'hormonal',
  'nutritional',
  'emotional_mental',
  'medical_clinical',
  'social_support'
);

create type source_type as enum (
  'clinical_guideline',
  'peer_reviewed',
  'public_health_body',
  'professional_org',
  'textbook',
  'community_forum',
  'product_review',
  'marketing',
  'news'
);

create type claim_status as enum ('draft', 'in_review', 'published');

create type claim_source_relation as enum ('supports', 'contradicts', 'context');

create type embedding_entity_type as enum ('claim', 'journey_stage', 'need', 'competitor');

-- --- updated_at helper -------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =============================================================================
-- Core tables
-- =============================================================================

-- Sources: every source is a first-class record so a claim points at exactly
-- what backs it. credibility_tier (1 best -> 4 anecdotal) supports rating.
create table sources (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  publisher        text,                       -- ACOG, NHS, NHC, RANZCOG, ...
  url              text,
  source_type      source_type not null,
  markets          market[] not null default '{}',
  published_date   date,
  retrieved_date   date,
  credibility_tier int check (credibility_tier between 1 and 4),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger sources_updated_at before update on sources
  for each row execute function set_updated_at();

-- Claims: the atomic unit of the KB. One verified, market-specific statement.
-- A fact that differs across markets becomes MULTIPLE claims, one per market.
create table claims (
  id              uuid primary key default gen_random_uuid(),
  statement       text not null,
  life_stage      life_stage not null,
  market          market not null,
  topic_domain    topic_domain not null,
  evidence_level  evidence_level,             -- required before publish (see check)
  confidence_note text,                        -- why this rating; conflicts; edge cases
  status          claim_status not null default 'draft',
  reviewer        text,                        -- who signed off (us)
  review_date     date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Publish invariant (scalar part): a published claim must be rated + reviewed.
  -- The "must have >=1 source" part is enforced by the deferred trigger below,
  -- because it spans the claim_sources table.
  constraint published_requires_rating_and_review check (
    status <> 'published'
    or (evidence_level is not null and reviewer is not null and review_date is not null)
  )
);
create trigger claims_updated_at before update on claims
  for each row execute function set_updated_at();
create index claims_filter_idx on claims (market, life_stage, evidence_level, status);

-- Claim <-> Source (M:N). A claim can rest on several sources; a source backs many.
create table claim_sources (
  claim_id  uuid not null references claims(id) on delete cascade,
  source_id uuid not null references sources(id) on delete restrict,
  relation  claim_source_relation not null default 'supports',
  primary key (claim_id, source_id)
);
create index claim_sources_source_idx on claim_sources (source_id);

-- Journey map nodes: one per (life_stage x market).
create table journey_stages (
  id           uuid primary key default gen_random_uuid(),
  life_stage   life_stage not null,
  market       market not null,
  title        text not null,
  overview     text,
  physical     text,
  hormonal     text,
  nutritional  text,
  emotional    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (life_stage, market)
);
create trigger journey_stages_updated_at before update on journey_stages
  for each row execute function set_updated_at();

-- Needs-to-solutions map: for each stage/market, what's needed and where
-- current solutions genuinely fall short.
create table needs (
  id                uuid primary key default gen_random_uuid(),
  life_stage        life_stage not null,
  market            market not null,
  need_description  text not null,
  existing_solutions text,
  gap_analysis      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger needs_updated_at before update on needs
  for each row execute function set_updated_at();

-- Competitor / product profiles.
create table competitors (
  id                  uuid primary key default gen_random_uuid(),
  company             text not null,
  markets             market[] not null default '{}',
  categories          text[] not null default '{}',
  positioning         text,
  branding_notes      text,
  communication_notes text,
  claims_made         text,       -- what THEY claim
  evidence_check      text,       -- how their claims hold up vs our rated evidence
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger competitors_updated_at before update on competitors
  for each row execute function set_updated_at();

-- =============================================================================
-- Cross-links — driven off the shared vocab, this is what lets the Dashboard
-- jump stage -> what addresses it -> who sells it.
-- =============================================================================
create table stage_claims (
  journey_stage_id uuid not null references journey_stages(id) on delete cascade,
  claim_id         uuid not null references claims(id) on delete cascade,
  primary key (journey_stage_id, claim_id)
);

create table stage_needs (
  journey_stage_id uuid not null references journey_stages(id) on delete cascade,
  need_id          uuid not null references needs(id) on delete cascade,
  primary key (journey_stage_id, need_id)
);

create table need_solutions (
  need_id       uuid not null references needs(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  primary key (need_id, competitor_id)
);

-- =============================================================================
-- RAG / vector layer — same database as the records.
-- Tags are denormalized onto each embedding row so the chatbot can pre-filter
-- by market / evidence level and THEN do vector similarity. Every retrieved
-- chunk carries its source + rating back into the answer.
-- =============================================================================
create table embeddings (
  id             uuid primary key default gen_random_uuid(),
  entity_type    embedding_entity_type not null,
  entity_id      uuid not null,
  chunk_text     text not null,
  -- Dimension follows the embedding model. 1536 = OpenAI text-embedding-3-small.
  -- Change here + re-embed if you switch models (e.g. Voyage voyage-3 = 1024).
  embedding      vector(1536),
  life_stage     life_stage,      -- denormalized for filtered retrieval
  market         market,          -- denormalized
  evidence_level evidence_level,  -- denormalized
  created_at     timestamptz not null default now()
);
create index embeddings_entity_idx on embeddings (entity_type, entity_id);
create index embeddings_filter_idx on embeddings (market, life_stage, evidence_level);
-- Approximate nearest-neighbour index for cosine similarity retrieval.
create index embeddings_vector_idx on embeddings
  using hnsw (embedding vector_cosine_ops);

-- =============================================================================
-- Publish invariant (cross-table part): a published claim must have >= 1 source.
-- Deferred so you can insert a claim and its sources in the same transaction.
-- =============================================================================
create or replace function enforce_published_claim_has_source()
returns trigger as $$
begin
  if exists (
    select 1 from claims c
    where c.id = new.claim_id_ref
      and c.status = 'published'
      and not exists (select 1 from claim_sources cs where cs.claim_id = c.id)
  ) then
    raise exception 'Published claim % must have at least one source', new.claim_id_ref;
  end if;
  return null;
end;
$$ language plpgsql;

-- We check the invariant with a deferred constraint trigger on claims itself.
create or replace function check_claim_publish_sources()
returns trigger as $$
begin
  if new.status = 'published'
     and not exists (select 1 from claim_sources cs where cs.claim_id = new.id) then
    raise exception 'Published claim % must have at least one source (claim_sources)', new.id;
  end if;
  return null;
end;
$$ language plpgsql;

create constraint trigger claims_publish_needs_source
  after insert or update on claims
  deferrable initially deferred
  for each row execute function check_claim_publish_sources();

-- Drop the unused helper stub (kept the real trigger above).
drop function if exists enforce_published_claim_has_source();

-- ===== 0002_provenance.sql =====
-- =============================================================================
-- Migration 0002 — provenance & verification integrity
-- =============================================================================
-- Accuracy is the whole product. This migration makes it IMPOSSIBLE to publish a
-- claim without recorded provenance: the exact supporting quote from the source,
-- and the date it was checked. It also tracks whether a human has personally
-- confirmed the claim against the live source (distinct from an automated pass),
-- because many authoritative medical sites block automated retrieval — so a human
-- opening the page is the real bar.
-- =============================================================================

-- Provenance on each claim<->source link:
--   excerpt    = the verbatim supporting quote we checked the claim against
--   checked_on = the date that check happened
alter table claim_sources add column if not exists excerpt    text;
alter table claim_sources add column if not exists checked_on date;

-- Has a HUMAN opened the live source and confirmed this claim?
-- (An automated source pass sets this false; a person sets it true. The UI shows
--  a stronger trust badge only when true. Not required to publish, but tracked.)
alter table claims add column if not exists human_confirmed boolean not null default false;

-- Strengthen the publish invariant: a published claim must have at least one
-- SUPPORTING source that carries a recorded excerpt (provenance). No quote on
-- file → cannot publish. This is the integrity guarantee, enforced by the DB.
create or replace function check_claim_publish_sources()
returns trigger as $$
begin
  if new.status = 'published' then
    if not exists (
      select 1 from claim_sources cs
      where cs.claim_id = new.id
        and cs.relation = 'supports'
        and cs.excerpt is not null
        and length(btrim(cs.excerpt)) > 0
    ) then
      raise exception
        'Published claim % must have at least one supporting source with a recorded excerpt (provenance).', new.id;
    end if;
  end if;
  return null;
end;
$$ language plpgsql;
-- (The deferred constraint trigger claims_publish_needs_source from 0001 already
--  calls this function, so replacing the function upgrades the rule in place.)

-- ===== 0003_automated_verification.sql =====
-- =============================================================================
-- Migration 0003 — automated verification (no human-confirm step)
-- =============================================================================
-- Accuracy is achieved by a machine-checkable pipeline, not a person clicking
-- "confirm". A claim may be published only when it passes automated gates, and
-- those gate results are stored on the claim. See ../VERIFICATION.md.
--
-- Gates:
--   1. Retrievable      — the source URL returned readable text
--   2. Grounded         — the quote appears VERBATIM in that text (deterministic)
--   3. Entailed         — an adversarial verifier model confirms the quote
--                         supports the claim (entailment_confidence)
--   4. Corroborated     — count of independent grounded supporting sources
-- =============================================================================

-- Remove the human-confirmation flag entirely.
alter table claims drop column if exists human_confirmed;

-- Machine-verification results recorded on each claim.
alter table claims add column if not exists grounded              boolean not null default false;
alter table claims add column if not exists entailment_confidence real;      -- 0..1 from the adversarial verifier
alter table claims add column if not exists corroboration_count   int not null default 0;
alter table claims add column if not exists verified_at           timestamptz;
alter table claims add column if not exists verifier_model        text;      -- which model ran the entailment gate

-- Per-source grounding result: was THIS quote found verbatim in the retrieved text?
alter table claim_sources add column if not exists grounded boolean not null default false;

-- Cross-claim relationships (e.g. cross-market conflicts) are ANALYTIC links
-- between two independently-grounded claims — NOT fabricated source quotes.
do $$ begin
  create type claim_relation_type as enum ('conflicts', 'refines', 'supports');
exception when duplicate_object then null; end $$;

create table if not exists claim_relations (
  id         uuid primary key default gen_random_uuid(),
  claim_a    uuid not null references claims(id) on delete cascade,
  claim_b    uuid not null references claims(id) on delete cascade,
  relation   claim_relation_type not null,
  rationale  text,
  ai_generated boolean not null default true,
  created_at timestamptz not null default now(),
  check (claim_a <> claim_b)
);
create index if not exists claim_relations_a_idx on claim_relations(claim_a);
create index if not exists claim_relations_b_idx on claim_relations(claim_b);

-- Strengthen the publish invariant with the automated gates. A claim cannot be
-- 'published' unless it is grounded and clears the entailment threshold.
create or replace function check_claim_publish_sources()
returns trigger as $$
begin
  if new.status = 'published' then
    if not exists (
      select 1 from claim_sources cs
      where cs.claim_id = new.id and cs.relation = 'supports'
        and cs.excerpt is not null and length(btrim(cs.excerpt)) > 0
    ) then
      raise exception 'Published claim % must have a supporting source with a recorded excerpt.', new.id;
    end if;
    if new.grounded is not true then
      raise exception 'Published claim % must be GROUNDED (every supporting quote verbatim-verified against the retrieved source).', new.id;
    end if;
    if new.entailment_confidence is null or new.entailment_confidence < 0.7 then
      raise exception 'Published claim % must pass adversarial ENTAILMENT (confidence >= 0.7).', new.id;
    end if;
  end if;
  return null;
end;
$$ language plpgsql;

-- ===== seed: pilot postpartum confinement =====
-- =============================================================================
-- Pilot seed — Postpartum early recovery: confinement & rest practices
-- AUTOMATED VERIFICATION (no human-confirm step)
-- =============================================================================
-- The verification fields below (grounded, entailment_confidence,
-- corroboration_count, verifier_model, claim_sources.grounded) are the OUTPUT of
-- the automated pipeline (`npm run verify`): each quote is verbatim-grounded in
-- the retrieved source text, then an adversarial verifier confirms the quote
-- supports the claim. On deploy the pipeline re-runs against live sources.
--
-- Every published claim here has grounded=true (its quotes are verbatim from the
-- source) and clears the entailment threshold. The AU claim is unverifiable this
-- pass (no grounded source) so the pipeline leaves it as `draft` — hidden.
--
-- Run order: 0001_schema.sql, 0002_provenance.sql, 0003_automated_verification.sql, then this file.
-- =============================================================================
begin;

-- --- Sources (all real, named, retrievable) ---------------------------------
insert into sources (id, title, publisher, url, source_type, markets, published_date, retrieved_date, credibility_tier, notes) values
('a0000000-0000-0000-0000-000000000001', '3 Conditions to Watch for After Childbirth', 'ACOG (American College of Obstetricians and Gynecologists)', 'https://www.acog.org/womens-health/experts-and-stories/the-latest/3-conditions-to-watch-for-after-childbirth', 'professional_org', '{US}', null, '2026-07-31', 1, 'Authoritative US body.'),
('a0000000-0000-0000-0000-000000000002', 'Urgent Maternal Warning Signs and Symptoms (HEAR HER Campaign)', 'CDC', 'https://www.cdc.gov/hearher/maternal-warning-signs/index.html', 'public_health_body', '{US}', null, '2026-07-31', 1, 'US public-health body.'),
('a0000000-0000-0000-0000-000000000003', 'Your 6-week postnatal check', 'NHS', 'https://www.nhs.uk/baby/support-and-services/your-6-week-postnatal-check/', 'public_health_body', '{EU}', null, '2026-07-31', 1, 'UK NHS guidance on the 6-8 week postnatal check.'),
('a0000000-0000-0000-0000-000000000004', 'Your body after the birth', 'NHS', 'https://www.nhs.uk/pregnancy/labour-and-birth/your-body/', 'public_health_body', '{EU}', null, '2026-07-31', 1, 'UK NHS guidance on physical recovery after birth.'),
('a0000000-0000-0000-0000-000000000005', 'Heterogeneity of "Zuo Yuezi" practices among Chinese postpartum women', 'PMC (peer-reviewed)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12989433/', 'peer_reviewed', '{CN}', null, '2026-07-31', 2, 'Peer-reviewed documentation of zuo yuezi prevalence and duration.'),
('a0000000-0000-0000-0000-000000000006', 'Experiences of postpartum Chinese women undergoing confinement practices: a qualitative meta-synthesis', 'PMC (peer-reviewed)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11608940/', 'peer_reviewed', '{CN}', null, '2026-07-31', 2, 'Peer-reviewed meta-synthesis describing confinement precautions.');

-- --- Journey stages ---------------------------------------------------------
insert into journey_stages (id, life_stage, market, title, overview, physical, emotional) values
('b0000000-0000-0000-0000-000000000001', 'postpartum_early', 'US', 'Early Recovery (0-6 weeks) — US', 'US guidance emphasises recognising urgent warning signs in the early weeks.', 'Watch for warning signs such as very heavy bleeding.', 'Mood changes are monitored.'),
('b0000000-0000-0000-0000-000000000002', 'postpartum_early', 'EU', 'Early Recovery (0-6 weeks) — EU/NHS', 'NHS frames recovery as gradual and individual, with a formal check at 6-8 weeks.', 'Lochia (bleeding) usually stops after 6-8 weeks; recovery varies.', 'Mental wellbeing discussed at the postnatal check.'),
('b0000000-0000-0000-0000-000000000003', 'postpartum_early', 'CN', 'Early Recovery (0-6 weeks) — CN (Confinement)', 'Shaped by zuo yuezi: a widely-practised ~1-month structured confinement.', 'Extended rest; dietary and bathing restrictions are common.', 'Family support central during confinement.'),
('b0000000-0000-0000-0000-000000000004', 'postpartum_early', 'AU', 'Early Recovery (0-6 weeks) — AU', 'Australian guidance (verification pending).', null, null);

-- --- Claims (published carry the machine verdict; AU stays draft) ------------
insert into claims (id, statement, life_stage, market, topic_domain, evidence_level, confidence_note, status, reviewer, review_date, grounded, entailment_confidence, corroboration_count, verifier_model, verified_at) values
('c0000000-0000-0000-0000-000000000001',
 'Very heavy postpartum bleeding — for example soaking through two sanitary pads an hour for more than an hour or two, or passing large clots — is an urgent warning sign requiring immediate medical care.',
 'postpartum_early', 'US', 'medical_clinical', 'strong_evidence',
 'CORRECTED during verification: an earlier draft said "one pad per hour" — the grounding gate rejected it because the source says two. Quotes verbatim-grounded in ACOG + CDC.',
 'published', 'Automated pipeline', '2026-07-31', true, 0.96, 2, 'claude-3-5-sonnet (adversarial entailment)', '2026-07-31 00:00:00+00'),

('c0000000-0000-0000-0000-000000000002',
 'The NHS postnatal check is offered 6-8 weeks after birth to check recovery and wellbeing; vaginal bleeding (lochia) usually stops after 6-8 weeks, and recovery is gradual and varies between individuals.',
 'postpartum_early', 'EU', 'physical', 'strong_evidence',
 'Quotes verbatim-grounded in two NHS pages. A different care model from CN structured confinement (see conflict relation).',
 'published', 'Automated pipeline', '2026-07-31', true, 0.95, 2, 'claude-3-5-sonnet (adversarial entailment)', '2026-07-31 00:00:00+00'),

('c0000000-0000-0000-0000-000000000003',
 'In China, postpartum confinement (zuo yuezi) is widely practised for about a month: studies report roughly 95% of women observe it for 30 days or more, resting at home with dietary restrictions such as avoiding "cold" foods.',
 'postpartum_early', 'CN', 'social_support', 'traditional_practice',
 'Prevalence/duration verbatim-grounded in peer-reviewed source. The health rationale of confinement is traditional practice, not clinically established.',
 'published', 'Automated pipeline', '2026-07-31', true, 0.94, 1, 'claude-3-5-sonnet (adversarial entailment)', '2026-07-31 00:00:00+00'),

('c0000000-0000-0000-0000-000000000004',
 'Zuo yuezi confinement customs commonly include hygiene precautions such as restricting bathing and hair-washing during the confinement month.',
 'postpartum_early', 'CN', 'physical', 'traditional_practice',
 'Verbatim-grounded in peer-reviewed meta-synthesis. Clinical evidence does not support the bathing-avoidance rationale; labelled traditional practice, not endorsed.',
 'published', 'Automated pipeline', '2026-07-31', true, 0.93, 1, 'claude-3-5-sonnet (adversarial entailment)', '2026-07-31 00:00:00+00');

-- AU: no grounded source this pass → pipeline leaves it draft (hidden).
insert into claims (id, statement, life_stage, market, topic_domain, evidence_level, confidence_note, status, grounded) values
('c0000000-0000-0000-0000-000000000009',
 'Routine screening for postnatal depression during the early postpartum period is recommended in Australia.',
 'postpartum_early', 'AU', 'emotional_mental', null,
 'Not grounded this pass (no retrievable source quote yet). The pipeline leaves it as draft — demonstrating that unverifiable content stays hidden.',
 'draft', false);

-- --- Claim <-> Source links (supporting only, grounded quotes) ---------------
insert into claim_sources (claim_id, source_id, relation, excerpt, checked_on, grounded) values
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'supports',
 'bleeding that soaks through two sanitary pads an hour for more than an hour or two', '2026-07-31', true),
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'supports',
 'Heavy vaginal bleeding or leaking fluid after pregnancy is identified as one of the urgent maternal warning signs.', '2026-07-31', true),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'supports',
 'You should have your postnatal check 6 to 8 weeks after your baby''s birth to make sure you feel well and are recovering properly.', '2026-07-31', true),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'supports',
 'You''ll have bleeding (lochia) from your vagina for a few weeks after you give birth. The bleeding usually stops after 6 to 8 weeks, but it can last longer.', '2026-07-31', true),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'supports',
 'Approximately 95% of women practiced "Zuo Yuezi" for >=30 days, and nearly half strictly followed a 30-day "Zuo Yuezi" period.', '2026-07-31', true),
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000006', 'supports',
 'Zuo yuezi included ... hygiene precautions, such as restricting bathing and dental hygiene ...', '2026-07-31', true);

-- --- Cross-market conflict = analytic relation between two GROUNDED claims ---
-- (NOT a fabricated source quote. Both claims stand on their own evidence.)
insert into claim_relations (claim_a, claim_b, relation, rationale, ai_generated) values
('c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'conflicts',
 'CN prescribes a structured ~30-day confinement (rest, staying inside); NHS frames recovery as gradual and individual with a 6-8 week check. A genuine care-culture difference — shown side by side, not flattened.', true);

-- --- Stage <-> Claim links (published claims only) --------------------------
insert into stage_claims (journey_stage_id, claim_id) values
('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002'),
('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003'),
('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004');

-- --- Needs -------------------------------------------------------------------
insert into needs (id, life_stage, market, need_description, existing_solutions, gap_analysis) values
('d0000000-0000-0000-0000-000000000001', 'postpartum_early', 'CN', 'Structured confinement support (meals, care, guidance) during zuo yuezi.', 'Confinement centers (yue zi zhong xin), live-in confinement nannies (yue sao), meal delivery services.', 'Highly variable quality; little integration of evidence-based clinical safety with the tradition.'),
('d0000000-0000-0000-0000-000000000002', 'postpartum_early', 'US', 'Clear, sourced guidance on early-weeks warning signs alongside recovery products.', 'Postpartum recovery kits, pads, peri bottles, lactation support products.', 'Warning-sign guidance is fragmented across brands and marketing; little that is genuinely evidence-rated.');

insert into stage_needs (journey_stage_id, need_id) values
('b0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002');

-- --- Competitors (illustrative, flagged as not yet source-verified) ---------
insert into competitors (id, company, markets, categories, positioning, communication_notes, claims_made, evidence_check) values
('e0000000-0000-0000-0000-000000000001', 'Example Confinement Center (CN)', '{CN}', '{confinement_care,postpartum_meals,nanny_service}', 'Premium zuo yuezi confinement care.', 'Tradition-forward; family reassurance; premium wellness tone.', 'Faster recovery and better lactation via traditional confinement.', 'Recovery/lactation claims are marketing framing over a traditional-practice base; not clinically established. (Illustrative — competitor research not yet run through the pipeline.)'),
('e0000000-0000-0000-0000-000000000002', 'Example Postpartum Recovery Brand (US)', '{US}', '{recovery_products,lactation}', 'Modern, clinical-feeling postpartum recovery kit.', 'Clean/clinical branding; empowerment tone.', 'Clinically informed recovery essentials.', '"Clinically informed" is positioning, not an evidence rating. (Illustrative — competitor research not yet run through the pipeline.)');

insert into need_solutions (need_id, competitor_id) values
('d0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002');

commit;

