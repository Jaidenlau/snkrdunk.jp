import Nav from "@/components/Nav";
import MarketFilter from "@/components/MarketFilter";
import SearchBar from "@/components/SearchBar";
import EvidenceBadge from "@/components/EvidenceBadge";
import MarketTag from "@/components/MarketTag";
import ClaimCard from "@/components/ClaimCard";
import Link from "next/link";
import { getStages, getEvidenceCounts, getConflicts } from "@/lib/data";
import { Market, stageLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseMarkets(v?: string): Market[] {
  return (v || "").split(",").filter(Boolean) as Market[];
}

export default async function Dashboard({ searchParams }: { searchParams: { markets?: string } }) {
  const markets = parseMarkets(searchParams.markets);
  const [stages, counts, conflicts] = await Promise.all([
    getStages(markets),
    getEvidenceCounts(markets),
    getConflicts(),
  ]);

  // Group stages by life_stage.
  const byStage: Record<string, typeof stages> = {};
  for (const s of stages) (byStage[s.life_stage] ||= []).push(s);
  const total = counts.strong_evidence + counts.traditional_practice + counts.anecdotal;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Hero */}
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-widest text-plum-600 mb-2">The verified foundation</p>
          <h1 className="text-3xl font-semibold tracking-tight max-w-2xl leading-tight">
            The pregnancy &amp; postpartum journey, sourced, dated, and rated by evidence strength.
          </h1>
          <p className="mt-3 text-muted max-w-2xl">
            Browse the journey stage by stage across four markets. Every entry is checked against its source
            before it goes in — and where markets genuinely disagree, both sides are shown side by side.
          </p>
          <div className="mt-5 max-w-2xl">
            <SearchBar />
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatTile label="Verified entries" value={total} accent="plum" />
          <StatTile label="Strong evidence" value={counts.strong_evidence} accent="strong" />
          <StatTile label="Traditional practice" value={counts.traditional_practice} accent="trad" />
          <StatTile label="Anecdotal" value={counts.anecdotal} accent="anec" />
        </div>

        {/* Filter */}
        <div className="card p-4 mb-8">
          <MarketFilter />
        </div>

        {/* Cross-market divergence */}
        {conflicts.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">⚡</span>
              <h2 className="text-lg font-semibold tracking-tight">Where the markets disagree</h2>
            </div>
            <p className="text-sm text-muted mb-4 max-w-2xl">
              The hardest and most valuable part: guidance that genuinely conflicts across markets. We don&apos;t
              flatten it into one global answer — we show each market on its own terms.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {conflicts.slice(0, 4).map((c) => (
                <ClaimCard key={c.id} claim={c} />
              ))}
            </div>
          </section>
        )}

        {/* Journey */}
        <section>
          <h2 className="text-lg font-semibold tracking-tight mb-4">The journey</h2>
          {Object.keys(byStage).length === 0 && (
            <p className="text-muted">No stages match this filter.</p>
          )}
          <div className="space-y-6">
            {Object.entries(byStage).map(([lifeStage, group]) => (
              <div key={lifeStage}>
                <div className="text-xs font-medium uppercase tracking-wide text-muted mb-2">{stageLabel(lifeStage)}</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {group.map((s) => (
                    <Link key={s.id} href={`/stage/${s.id}`} className="card p-4 hover:border-plum-400 transition-colors group">
                      <div className="flex items-center justify-between mb-2">
                        <MarketTag code={s.market} />
                        <span className="text-xs text-muted">{s.claim_count} entries</span>
                      </div>
                      <div className="text-sm font-medium leading-snug group-hover:text-plum-700">{s.title}</div>
                      {s.overview && <p className="mt-1.5 text-xs text-muted line-clamp-3">{s.overview}</p>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-14 border-t border-line pt-6 text-[11px] text-muted">
          Evidence-strength curation, not medical advice. Verify with a qualified clinician.
        </footer>
      </main>
    </>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  const dot: Record<string, string> = {
    plum: "bg-plum-600",
    strong: "bg-strong-dot",
    trad: "bg-trad-dot",
    anec: "bg-anec-dot",
  };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`h-2 w-2 rounded-full ${dot[accent]}`} />
        <span className="text-xs text-muted">{label}</span>
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
