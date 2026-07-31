import { q } from "./db";
import type { Claim, Competitor, JourneyStage, Market } from "./types";

export async function getStages(markets: Market[]): Promise<JourneyStage[]> {
  const filter = markets.length ? markets : null;
  return q<JourneyStage>(
    `select js.id, js.life_stage, js.market, js.title, js.overview, js.physical, js.emotional,
            (select count(*) from stage_claims sc where sc.journey_stage_id = js.id) as claim_count
     from journey_stages js
     where ($1::market[] is null or js.market = any($1::market[]))
     order by js.life_stage, js.market`,
    [filter]
  );
}

export async function getStage(id: string): Promise<{ stage: JourneyStage; claims: Claim[] } | null> {
  const [stage] = await q<JourneyStage>(`select * from journey_stages where id = $1`, [id]);
  if (!stage) return null;
  const claims = await getClaimsForStage(id);
  return { stage, claims };
}

export async function getClaimsForStage(stageId: string): Promise<Claim[]> {
  const claims = await q<Claim>(
    `select c.* from claims c
     join stage_claims sc on sc.claim_id = c.id
     where sc.journey_stage_id = $1 and c.status = 'published'
     order by array_position(array['strong_evidence','traditional_practice','anecdotal']::text[], c.evidence_level::text)`,
    [stageId]
  );
  return attachSources(claims);
}

export async function getEvidenceCounts(markets: Market[]): Promise<Record<string, number>> {
  const filter = markets.length ? markets : null;
  const rows = await q<{ evidence_level: string; n: string }>(
    `select evidence_level, count(*) as n from claims
     where status='published' and ($1::market[] is null or market = any($1::market[]))
     group by evidence_level`,
    [filter]
  );
  const out: Record<string, number> = { strong_evidence: 0, traditional_practice: 0, anecdotal: 0 };
  for (const r of rows) out[r.evidence_level] = Number(r.n);
  return out;
}

export async function getCompetitors(markets: Market[]): Promise<Competitor[]> {
  const filter = markets.length ? markets : null;
  // Cast the enum array to text[] so the pg driver returns a JS array
  // (custom enum arrays come back as a raw "{US,CN}" string otherwise).
  return q<Competitor>(
    `select id, company, markets::text[] as markets, categories,
            positioning, branding_notes, communication_notes, claims_made, evidence_check
     from competitors
     where ($1::market[] is null or markets && $1::market[])
     order by company`,
    [filter]
  );
}

// Claims involved in an analytic cross-market conflict relation (AI-derived,
// between two independently-grounded claims — not fabricated source quotes).
export async function getConflicts(): Promise<Claim[]> {
  const claims = await q<Claim>(
    `select distinct c.* from claims c
     join (
       select claim_a as id from claim_relations where relation='conflicts'
       union
       select claim_b as id from claim_relations where relation='conflicts'
     ) r on r.id = c.id
     where c.status='published'
     order by c.market`
  );
  return attachSources(claims);
}

// All claims, any status, for the reviewer cockpit — ordered draft → pending → confirmed.
export async function getReviewClaims(): Promise<Claim[]> {
  const claims = await q<Claim>(
    `select * from claims
     order by array_position(array['published','in_review','draft']::text[], status::text),
              grounded desc, market, life_stage`
  );
  return attachSources(claims);
}

async function attachSources(claims: Claim[]): Promise<Claim[]> {
  if (!claims.length) return claims;
  const ids = claims.map((c) => c.id);
  const srcs = await q<any>(
    `select cs.claim_id, s.publisher, s.title, s.url, cs.relation, s.published_date,
            cs.excerpt, cs.checked_on, cs.grounded
     from claim_sources cs join sources s on s.id = cs.source_id
     where cs.claim_id = any($1::uuid[])`,
    [ids]
  );
  const byClaim: Record<string, any[]> = {};
  for (const s of srcs) (byClaim[s.claim_id] ||= []).push(s);
  return claims.map((c) => ({ ...c, sources: byClaim[c.id] || [] }));
}
