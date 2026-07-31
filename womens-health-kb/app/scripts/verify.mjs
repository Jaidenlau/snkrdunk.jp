// Run the automated verification pipeline over the knowledge base.
// For every claim: retrieve each supporting source, verbatim-ground its quote,
// run adversarial entailment, and write the machine verdict + status back.
// Run: `npm run verify`. Requires DATABASE_URL (+ ANTHROPIC_API_KEY for entailment).

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { verifyClaim } from "../lib/verify.mjs";

// Tiny .env.local loader.
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

async function main() {
  const onlyId = process.argv[2]; // optional: verify a single claim id
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  const { rows: claims } = await pool.query(
    `select id, statement from claims ${onlyId ? "where id = $1" : ""}`,
    onlyId ? [onlyId] : []
  );

  for (const c of claims) {
    const { rows: sources } = await pool.query(
      `select cs.source_id, cs.relation, cs.excerpt, s.url
       from claim_sources cs join sources s on s.id = cs.source_id
       where cs.claim_id = $1`,
      [c.id]
    );
    const verdict = await verifyClaim({ statement: c.statement, sources });

    // Safety: if EVERY source was unreachable (e.g. the host blocks this IP),
    // don't overwrite a previously-good verdict — skip rather than falsely demote.
    const allUnreachable =
      verdict.perSource.length > 0 && verdict.perSource.every((p) => p.method === "unretrievable");
    if (allUnreachable) {
      console.log(`${c.id.slice(0, 8)}  sources unreachable — skipped (verdict preserved)`);
      continue;
    }

    // Persist per-source grounding.
    for (let i = 0; i < verdict.perSource.length; i++) {
      const ps = verdict.perSource[i];
      const supporting = sources.filter((s) => s.relation === "supports" && s.excerpt);
      const src = supporting[i];
      if (src) {
        await pool.query(`update claim_sources set grounded = $3 where claim_id = $1 and source_id = $2`,
          [c.id, src.source_id, ps.grounded]);
      }
    }

    // Persist claim verdict. Only auto-publish if the gates pass; otherwise the
    // pipeline demotes it — no human needed to keep bad data out.
    await pool.query(
      `update claims
         set grounded = $2, entailment_confidence = $3, corroboration_count = $4,
             verifier_model = $5, verified_at = now(), status = $6
       where id = $1`,
      [c.id, verdict.grounded, verdict.entailment_confidence, verdict.corroboration_count,
       verdict.verifier_model, verdict.recommendedStatus]
    );

    console.log(
      `${c.id.slice(0, 8)}  grounded=${verdict.grounded}  entail=${verdict.entailment_confidence ?? "—"}  ` +
      `corrob=${verdict.corroboration_count}  -> ${verdict.recommendedStatus}`
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
