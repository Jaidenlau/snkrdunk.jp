"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Claim } from "@/lib/types";
import EvidenceBadge from "./EvidenceBadge";
import MarketTag from "./MarketTag";

// Read-only audit of the automated verification pipeline. No human confirms
// anything — this shows the machine verdict and lets you re-run the pipeline.
export default function AuditView({ claims }: { claims: Claim[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string>("");

  async function reverify(claimId: string) {
    setBusy(claimId);
    setNote("");
    const r = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId }),
    });
    const data = await r.json();
    setBusy(null);
    setNote(data.message || (data.ok ? "Re-verified." : data.error || "Failed"));
    if (data.ok) router.refresh();
  }

  const published = claims.filter((c) => c.status === "published");
  const drafts = claims.filter((c) => c.status !== "published");
  const grounded = published.filter((c) => c.grounded).length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Verification audit</h1>
      <p className="mt-1 text-muted max-w-2xl text-sm">
        Accuracy is enforced by an automated pipeline, not a person. A claim is published only when every
        supporting quote is verbatim-grounded in its source and an adversarial verifier confirms it. This is
        the audit trail — inspect it, or re-run the pipeline.
      </p>

      <div className="grid grid-cols-3 gap-3 my-6">
        <Stat n={grounded} label="Grounded & published" tone="strong" />
        <Stat n={published.length - grounded} label="Published, ungrounded" tone="trad" />
        <Stat n={drafts.length} label="Held back (hidden)" tone="anec" />
      </div>

      {note && <div className="mb-4 rounded-lg border border-line bg-plum-50 px-4 py-2.5 text-sm text-plum-700">{note}</div>}

      <Section title="Published — passed all gates" hint="Grounded + entailment ≥ 0.7. Visible to users.">
        {published.map((c) => <AuditRow key={c.id} claim={c} busy={busy} onReverify={reverify} />)}
        {published.length === 0 && <p className="text-sm text-muted">None.</p>}
      </Section>

      <Section title="Held back — failed a gate, hidden from users" hint="Not grounded, or below the entailment threshold.">
        {drafts.map((c) => <AuditRow key={c.id} claim={c} busy={busy} onReverify={reverify} />)}
        {drafts.length === 0 && <p className="text-sm text-muted">None.</p>}
      </Section>
    </div>
  );
}

function AuditRow({ claim, busy, onReverify }: { claim: Claim; busy: string | null; onReverify: (id: string) => void }) {
  const supporting = (claim.sources || []).filter((s) => s.relation === "supports");
  const allGrounded = supporting.length > 0 && supporting.every((s) => s.grounded);
  const conf = typeof claim.entailment_confidence === "number" ? claim.entailment_confidence : null;
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <MarketTag code={claim.market} />
        {claim.evidence_level && <EvidenceBadge level={claim.evidence_level} />}
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted">{claim.status}</span>
      </div>
      <p className="text-[15px] leading-relaxed">{claim.statement}</p>

      {/* The four automated gates */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Gate ok={supporting.length > 0} label="Retrievable source" />
        <Gate ok={allGrounded} label="Grounded (verbatim)" />
        <Gate ok={conf !== null && conf >= 0.7} label={`Entailed${conf !== null ? ` ${Math.round(conf * 100)}%` : ""}`} />
        <Gate ok={(claim.corroboration_count ?? 0) >= 1} label={`Corroborated ×${claim.corroboration_count ?? 0}`} />
      </div>

      {supporting.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {supporting.map((s, i) => (
            <div key={i} className="text-xs">
              <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 mr-1 ${s.grounded ? "bg-strong-bg text-strong-fg" : "bg-anec-bg text-anec-fg"}`}>
                {s.grounded ? "✓" : "✕"}
              </span>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-plum-700 hover:underline">{s.publisher} ↗</a> : s.publisher}
              {s.excerpt && <span className="text-muted italic"> — “{s.excerpt.slice(0, 90)}{s.excerpt.length > 90 ? "…" : ""}”</span>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => onReverify(claim.id)}
          disabled={busy !== null}
          className="rounded-xl border border-line px-3 py-1.5 text-xs text-muted hover:text-ink hover:border-plum-400 transition-colors disabled:opacity-50"
        >
          {busy === claim.id ? "Re-verifying…" : "↻ Re-verify"}
        </button>
        {claim.verifier_model && <span className="text-[11px] text-muted">by {claim.verifier_model}</span>}
      </div>
    </div>
  );
}

function Gate({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`pill ${ok ? "bg-strong-bg text-strong-fg" : "bg-anec-bg text-anec-fg"}`}>
      {ok ? "✓" : "✕"} {label}
    </span>
  );
}
function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="text-xs text-muted mb-3">{hint}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  const dot: Record<string, string> = { strong: "bg-strong-dot", trad: "bg-trad-dot", anec: "bg-anec-dot" };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 mb-1"><span className={`h-2 w-2 rounded-full ${dot[tone]}`} /><span className="text-xs text-muted">{label}</span></div>
      <div className="text-2xl font-semibold">{n}</div>
    </div>
  );
}
