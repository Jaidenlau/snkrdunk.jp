import Nav from "@/components/Nav";
import ClaimCard from "@/components/ClaimCard";
import MarketTag from "@/components/MarketTag";
import Link from "next/link";
import { getStage } from "@/lib/data";
import { stageLabel } from "@/lib/types";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function StagePage({ params }: { params: { id: string } }) {
  const data = await getStage(params.id);
  if (!data) notFound();
  const { stage, claims } = data;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Link href="/" className="text-sm text-muted hover:text-ink">← Journey</Link>
        <div className="mt-3 flex items-center gap-2 mb-1">
          <MarketTag code={stage.market} />
          <span className="text-xs uppercase tracking-wide text-muted">{stageLabel(stage.life_stage)}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{stage.title}</h1>
        {stage.overview && <p className="mt-2 text-muted max-w-2xl">{stage.overview}</p>}

        {(stage.physical || stage.emotional) && (
          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            {stage.physical && (
              <div className="card p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted mb-1">Physical</div>
                <p className="text-sm">{stage.physical}</p>
              </div>
            )}
            {stage.emotional && (
              <div className="card p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted mb-1">Emotional</div>
                <p className="text-sm">{stage.emotional}</p>
              </div>
            )}
          </div>
        )}

        <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight">Verified entries</h2>
        <div className="space-y-3">
          {claims.map((c) => (
            <ClaimCard key={c.id} claim={c} />
          ))}
          {claims.length === 0 && <p className="text-muted">No published entries yet for this stage.</p>}
        </div>
      </main>
    </>
  );
}
