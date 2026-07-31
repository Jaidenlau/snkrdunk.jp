import { Claim } from "@/lib/types";
import EvidenceBadge from "./EvidenceBadge";
import MarketTag from "./MarketTag";

function VerificationBadge({ confirmed }: { confirmed?: boolean }) {
  if (confirmed) {
    return (
      <span className="pill bg-strong-bg text-strong-fg" title="A person opened the live source and confirmed this claim.">
        <span className="h-1.5 w-1.5 rounded-full bg-strong-dot" /> Human-confirmed
      </span>
    );
  }
  return (
    <span
      className="pill bg-canvas border border-line text-muted"
      title="Checked against its source and quote recorded — awaiting final human confirmation on the live page."
    >
      ◔ Source-checked · pending confirmation
    </span>
  );
}

export default function ClaimCard({ claim }: { claim: Claim }) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <MarketTag code={claim.market} />
        <EvidenceBadge level={claim.evidence_level} />
        <VerificationBadge confirmed={claim.human_confirmed} />
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted">{claim.topic_domain.replace("_", " ")}</span>
      </div>
      <p className="text-[15px] leading-relaxed text-ink">{claim.statement}</p>
      {claim.confidence_note && (
        <p className="mt-2 text-xs text-muted leading-relaxed border-l-2 border-line pl-2.5">{claim.confidence_note}</p>
      )}
      {claim.sources && claim.sources.length > 0 && (
        <div className="mt-3 space-y-2">
          {claim.sources.map((s, i) => (
            <div
              key={i}
              className={`rounded-lg border p-2.5 ${
                s.relation === "contradicts" ? "border-anec-dot/40 bg-anec-bg/40" : "border-line bg-canvas"
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <span>{s.relation === "contradicts" ? "⚡" : "📄"}</span>
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
