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
