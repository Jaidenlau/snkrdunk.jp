import { Claim } from "@/lib/types";
import EvidenceBadge from "./EvidenceBadge";
import MarketTag from "./MarketTag";

// Automated verification badge — reflects the pipeline verdict, no human step.
function VerifiedBadge({ claim }: { claim: Claim }) {
  if (!claim.grounded) return null;
  const conf = typeof claim.entailment_confidence === "number" ? Math.round(claim.entailment_confidence * 100) : null;
  const n = claim.corroboration_count ?? 0;
  return (
    <span
      className="pill bg-strong-bg text-strong-fg"
      title={`Grounded: every quote verbatim-verified in the source. Adversarial entailment ${conf ?? "—"}%. ${n} corroborating source${n === 1 ? "" : "s"}. Verified by ${claim.verifier_model || "pipeline"}.`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-strong-dot" />
      Verified{conf !== null ? ` · ${conf}%` : ""}{n ? ` · ${n} src` : ""}
    </span>
  );
}

export default function ClaimCard({ claim }: { claim: Claim }) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <MarketTag code={claim.market} />
        {claim.evidence_level && <EvidenceBadge level={claim.evidence_level} />}
        <VerifiedBadge claim={claim} />
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted">{claim.topic_domain?.replace("_", " ")}</span>
      </div>
      <p className="text-[15px] leading-relaxed text-ink">{claim.statement}</p>
      {claim.confidence_note && (
        <p className="mt-2 text-xs text-muted leading-relaxed border-l-2 border-line pl-2.5">{claim.confidence_note}</p>
      )}
      {claim.sources && claim.sources.length > 0 && (
        <div className="mt-3 space-y-2">
          {claim.sources.map((s, i) => (
            <div key={i} className="rounded-lg border border-line bg-canvas p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                {s.grounded && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-strong-bg text-strong-fg px-1 py-0.5" title="Quote found verbatim in the retrieved source.">
                    ✓ grounded
                  </span>
                )}
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-ink hover:text-plum-700 underline underline-offset-2">
                    {s.publisher}
                  </a>
                ) : (
                  <span className="text-ink">{s.publisher}</span>
                )}
                {s.checked_on && <span>· checked {new Date(s.checked_on).toISOString().slice(0, 10)}</span>}
              </div>
              {s.excerpt && <p className="mt-1 text-xs italic text-muted leading-relaxed">“{s.excerpt}”</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
