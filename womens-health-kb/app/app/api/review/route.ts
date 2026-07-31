import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";

// Reviewer cockpit actions. All mutations enforce the DB provenance rule:
// publishing/confirming a claim with no recorded verifying quote is rejected
// by the database trigger, and we surface that message.
export async function POST(req: Request) {
  const { action, claimId, reviewer } = await req.json().catch(() => ({}));
  if (!action || !claimId) {
    return NextResponse.json({ ok: false, error: "Missing action or claimId" }, { status: 400 });
  }

  try {
    switch (action) {
      case "confirm":
        // A human opened the live source and confirmed it. Promote to published
        // + human_confirmed and stamp who/when. (Trigger requires an excerpt.)
        await q(
          `update claims
             set status='published', human_confirmed=true,
                 reviewer=$2, review_date=current_date
           where id=$1`,
          [claimId, (reviewer || "Reviewer").slice(0, 120)]
        );
        break;
      case "publish":
        // Promote a draft to source-checked (published, not yet human-confirmed).
        await q(`update claims set status='published' where id=$1`, [claimId]);
        break;
      case "unconfirm":
        await q(`update claims set human_confirmed=false where id=$1`, [claimId]);
        break;
      case "reject":
        // Pull it from what users see, back to draft for fixing.
        await q(`update claims set status='draft', human_confirmed=false where id=$1`, [claimId]);
        break;
      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Surface the DB integrity message (e.g. "must have ... a recorded excerpt").
    const msg = String(e?.message || e).replace(/^error:\s*/i, "");
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
