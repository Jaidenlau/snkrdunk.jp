import { Claim } from "@/lib/types";
import EvidenceBadge from "./EvidenceBadge";
import MarketTag from "./MarketTag";

export default function ClaimCard({ claim }: { claim: Claim }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <MarketTag code={claim.market} />
        <EvidenceBadge level={claim.evidence_level} />
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted">{claim.topic_domain.replace("_", " ")}</span>
      </div>
      <p className="text-[15px] leading-relaxed text-ink">{claim.statement}</p>
      {claim.confidence_note && (
        <p className="mt-2 text-xs text-muted leading-relaxed border-l-2 border-line pl-2.5">{claim.confidence_note}</p>
      )}
      {claim.sources && claim.sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {claim.sources.map((s, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${
                s.relation === "contradicts"
                  ? "border-anec-dot/40 text-anec-fg bg-anec-bg/50"
                  : "border-line text-muted bg-canvas"
              }`}
              title={s.title}
            >
              {s.relation === "contradicts" ? "⚡" : "📄"} {s.publisher}
              {s.published_date ? ` · ${new Date(s.published_date).getFullYear()}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
