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
