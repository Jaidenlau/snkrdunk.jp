// Embed-on-publish pipeline.
// Reads published claims that have no embedding yet, embeds them with OpenAI,
// and upserts into the `embeddings` table (denormalizing market / life_stage /
// evidence_level for filtered retrieval). Run: `npm run embed`.
//
// Requires DATABASE_URL and OPENAI_API_KEY in the environment (or .env.local).

import pg from "pg";
import fs from "node:fs";
import path from "node:path";

// Tiny .env.local loader (no dependency).
try {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const { Pool } = pg;
const MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

async function embedText(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set. Add it to .env.local, then re-run.");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  const { rows } = await pool.query(`
    select c.id, c.statement, c.market, c.life_stage, c.evidence_level
    from claims c
    where c.status = 'published'
      and not exists (
        select 1 from embeddings e where e.entity_type = 'claim' and e.entity_id = c.id
      )
  `);

  console.log(`Found ${rows.length} published claim(s) needing embeddings.`);
  let n = 0;
  for (const r of rows) {
    const vec = await embedText(r.statement);
    await pool.query(
      `insert into embeddings (entity_type, entity_id, chunk_text, embedding, market, life_stage, evidence_level)
       values ('claim', $1, $2, $3::vector, $4, $5, $6)`,
      [r.id, r.statement, "[" + vec.join(",") + "]", r.market, r.life_stage, r.evidence_level]
    );
    n++;
    process.stdout.write(`\rEmbedded ${n}/${rows.length}`);
  }
  console.log(`\nDone. Embedded ${n} claim(s).`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
