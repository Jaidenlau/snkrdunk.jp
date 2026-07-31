import { q } from "./db";
import type { Claim, Market } from "./types";

const DISCLAIMER =
  "This is evidence-strength curation, not medical advice. Always verify with a qualified clinician.";

export interface Retrieved extends Claim {
  score?: number;
}

// --- Embedding (OpenAI) -----------------------------------------------------
async function embed(text: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  const r = await client.embeddings.create({ model, input: text });
  return r.data[0].embedding as number[];
}

function toVectorLiteral(v: number[]): string {
  return "[" + v.join(",") + "]";
}

// --- Retrieval --------------------------------------------------------------
// Vector search when embeddings + OpenAI key exist; keyword fallback otherwise.
export async function retrieve(query: string, markets: Market[], k = 6): Promise<Retrieved[]> {
  const vec = await embed(query);
  const marketFilter = markets.length ? markets : null;

  if (vec) {
    const rows = await q<Retrieved>(
      `select c.id, c.statement, c.life_stage, c.market, c.topic_domain,
              c.evidence_level, c.confidence_note, c.status,
              1 - (e.embedding <=> $1::vector) as score
       from embeddings e
       join claims c on c.id = e.entity_id
       where e.entity_type = 'claim' and c.status = 'published'
         and ($2::market[] is null or c.market = any($2::market[]))
       order by e.embedding <=> $1::vector
       limit $3`,
      [toVectorLiteral(vec), marketFilter, k]
    );
    if (rows.length) return attachSources(rows);
  }

  // Keyword fallback — keeps the chatbot usable before the vector layer is populated.
  const terms = query.split(/\s+/).filter((w) => w.length > 3).slice(0, 6);
  const like = terms.length ? terms.map((_, i) => `c.statement ilike $${i + 2}`).join(" or ") : "true";
  const rows = await q<Retrieved>(
    `select c.id, c.statement, c.life_stage, c.market, c.topic_domain,
            c.evidence_level, c.confidence_note, c.status
     from claims c
     where c.status = 'published'
       and ($1::market[] is null or c.market = any($1::market[]))
       and (${like})
     limit ${k}`,
    [marketFilter, ...terms.map((t) => `%${t}%`)]
  );
  return attachSources(rows);
}

async function attachSources(claims: Retrieved[]): Promise<Retrieved[]> {
  if (!claims.length) return claims;
  const ids = claims.map((c) => c.id);
  const srcs = await q<any>(
    `select cs.claim_id, s.publisher, s.title, s.url, cs.relation, s.published_date
     from claim_sources cs join sources s on s.id = cs.source_id
     where cs.claim_id = any($1::uuid[])`,
    [ids]
  );
  const byClaim: Record<string, any[]> = {};
  for (const s of srcs) (byClaim[s.claim_id] ||= []).push(s);
  return claims.map((c) => ({ ...c, sources: byClaim[c.id] || [] }));
}

// --- Answer generation ------------------------------------------------------
export interface ChatResult {
  answer: string;
  disclaimer: string;
  sources: Retrieved[];
  grounded: boolean;
}

export async function answer(query: string, markets: Market[]): Promise<ChatResult> {
  const retrieved = await retrieve(query, markets);

  if (!retrieved.length) {
    return {
      answer:
        "I don't have verified information on that in the knowledge base yet. As the base grows this will improve — for now I only answer from checked, sourced entries.",
      disclaimer: DISCLAIMER,
      sources: [],
      grounded: false,
    };
  }

  const context = retrieved
    .map(
      (c, i) =>
        `[${i + 1}] (market: ${c.market}, evidence: ${c.evidence_level}) ${c.statement}` +
        (c.sources?.length ? ` — source: ${c.sources.map((s) => s.publisher).join(", ")}` : "")
    )
    .join("\n");

  // Generate with Claude when a key is present; otherwise return an extractive
  // answer straight from the retrieved passages so the flow is fully demoable.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const model = process.env.CHAT_MODEL || "claude-3-5-sonnet-latest";
      const msg = await client.messages.create({
        model,
        max_tokens: 700,
        system:
          "You answer strictly from the provided verified passages. Never use outside knowledge. " +
          "Cite passages as [n]. When markets differ, present each market's guidance separately and " +
          "state the evidence level (strong evidence / traditional practice / anecdotal). Never give " +
          "medical advice — describe what the evidence says. Be concise.",
        messages: [
          { role: "user", content: `Question: ${query}\n\nVerified passages:\n${context}` },
        ],
      });
      const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
      return { answer: text, disclaimer: DISCLAIMER, sources: retrieved, grounded: true };
    } catch (e) {
      // fall through to extractive
    }
  }

  const extractive =
    "Based on the verified knowledge base:\n\n" +
    retrieved
      .map((c) => `• (${c.market}, ${c.evidence_level.replace("_", " ")}) ${c.statement}`)
      .join("\n");
  return { answer: extractive, disclaimer: DISCLAIMER, sources: retrieved, grounded: true };
}
