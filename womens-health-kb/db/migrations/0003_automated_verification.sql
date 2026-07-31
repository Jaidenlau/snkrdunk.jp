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
