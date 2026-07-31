import Nav from "@/components/Nav";
import SearchBar from "@/components/SearchBar";
import ClaimCard from "@/components/ClaimCard";
import { retrieve } from "@/lib/rag";
import { Market } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string; markets?: string } }) {
  const q = (searchParams.q || "").trim();
  const markets = (searchParams.markets || "").split(",").filter(Boolean) as Market[];
  const results = q ? await retrieve(q, markets, 12) : [];

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Search</h1>
        <p className="text-sm text-muted mb-4">
          Semantic search over verified entries (vector search when embeddings are populated; keyword fallback otherwise).
        </p>
        <SearchBar initial={q} autoFocus />

        {q && (
          <p className="mt-6 mb-3 text-sm text-muted">
            {results.length} result{results.length === 1 ? "" : "s"} for “{q}”
          </p>
        )}
        <div className="space-y-3">
          {results.map((c) => (
            <ClaimCard key={c.id} claim={c} />
          ))}
          {q && results.length === 0 && (
            <p className="text-muted">No verified entries match that yet.</p>
          )}
        </div>
      </main>
    </>
  );
}
