import Nav from "@/components/Nav";
import MarketFilter from "@/components/MarketFilter";
import MarketTag from "@/components/MarketTag";
import { getCompetitors } from "@/lib/data";
import { Market } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseMarkets(v?: string): Market[] {
  return (v || "").split(",").filter(Boolean) as Market[];
}

export default async function CompetitorsPage({ searchParams }: { searchParams: { markets?: string } }) {
  const markets = parseMarkets(searchParams.markets);
  const competitors = await getCompetitors(markets);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Competitor landscape</h1>
        <p className="text-muted mb-6 max-w-2xl">
          Structured profiles across markets — their positioning and claims, checked against the evidence.
        </p>
        <div className="card p-4 mb-6">
          <MarketFilter />
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {competitors.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold tracking-tight">{c.company}</h3>
                <div className="flex gap-1">
                  {c.markets.map((m) => (
                    <MarketTag key={m} code={m} />
                  ))}
                </div>
              </div>
              {c.categories?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {c.categories.map((cat) => (
                    <span key={cat} className="pill bg-canvas border border-line text-muted">{cat.replace(/_/g, " ")}</span>
                  ))}
                </div>
              )}
              {c.positioning && <p className="text-sm mb-3">{c.positioning}</p>}
              {c.claims_made && (
                <div className="rounded-lg bg-canvas border border-line p-3 mb-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted mb-1">They claim</div>
                  <p className="text-sm">{c.claims_made}</p>
                </div>
              )}
              {c.evidence_check && (
                <div className="rounded-lg bg-plum-50 border border-plum-100 p-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-plum-700 mb-1">Evidence check</div>
                  <p className="text-sm text-plum-700">{c.evidence_check}</p>
                </div>
              )}
            </div>
          ))}
          {competitors.length === 0 && <p className="text-muted">No competitors match this filter.</p>}
        </div>
      </main>
    </>
  );
}
