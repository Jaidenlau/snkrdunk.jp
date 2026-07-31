import { NextResponse } from "next/server";
import { q } from "@/lib/db";
// @ts-ignore - plain JS pipeline shared with the CLI runner
import { verifyClaim } from "@/lib/verify.mjs";

export const runtime = "nodejs";

// Re-run the automated pipeline for one claim and persist the verdict.
// If NO source is reachable (e.g. locked-down environment), we do NOT overwrite
// the stored verdict — verification runs for real on deploy.
export async function POST(req: Request) {
  const { claimId } = await req.json().catch(() => ({}));
  if (!claimId) return NextResponse.json({ ok: false, error: "Missing claimId" }, { status: 400 });

  const [claim] = await q<any>(`select id, statement from claims where id=$1`, [claimId]);
  if (!claim) return NextResponse.json({ ok: false, error: "Claim not found" }, { status: 404 });

  const sources = await q<any>(
    `select cs.source_id, cs.relation, cs.excerpt, s.url
     from claim_sources cs join sources s on s.id=cs.source_id where cs.claim_id=$1`,
    [claimId]
  );

  const verdict = await verifyClaim({ statement: claim.statement, sources });

  const allUnreachable =
    verdict.perSource.length > 0 && verdict.perSource.every((p: any) => p.method === "unretrievable");
  if (allUnreachable) {
    return NextResponse.json({
      ok: false,
      message: "Sources unreachable from this environment — the pipeline runs for real on deploy (Railway/Vercel).",
    });
  }

  const supporting = sources.filter((s: any) => s.relation === "supports" && s.excerpt);
  for (let i = 0; i < verdict.perSource.length; i++) {
    const src = supporting[i];
    if (src) await q(`update claim_sources set grounded=$3 where claim_id=$1 and source_id=$2`,
      [claimId, src.source_id, verdict.perSource[i].grounded]);
  }
  await q(
    `update claims set grounded=$2, entailment_confidence=$3, corroboration_count=$4,
       verifier_model=$5, verified_at=now(), status=$6 where id=$1`,
    [claimId, verdict.grounded, verdict.entailment_confidence, verdict.corroboration_count,
     verdict.verifier_model, verdict.recommendedStatus]
  );

  return NextResponse.json({ ok: true, message: `Re-verified → ${verdict.recommendedStatus}`, verdict });
}
