"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CONDITION,
  KNOWN_CONDITIONS,
  api,
  convertMoney,
  formatDate,
  formatMoney,
  formatRelativeTime,
  getRegionalPreference,
  isLoggedIn,
  pickDefaultCondition,
  roundMoneyInput
} from "@/lib/api";
import type { ConditionGroup } from "@/lib/api";
import type { CardDetail, ConditionPrice, PriceHistory, SaleEvent } from "@/lib/types";

export default function CardDetailPage() {
  const params = useParams<{ id: string }>();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [selectedConditionId, setSelectedConditionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectedDisplayCurrency = getRegionalPreference().currency;

  useEffect(() => {
    async function loadCard() {
      try {
        const data = await api.getCard(params.id);
        setCard(data);
        const initial = pickDefaultCondition(data);
        if (initial) {
          setSelectedConditionId(initial.condition_id);
          const sourcePrice = initial.min_price ?? data.current_price ?? 0;
          const sourceCurrency = initial.currency ?? data.currency ?? "JPY";
          const regionalCurrency = getRegionalPreference().currency;
          setPurchasePrice(roundMoneyInput(convertMoney(sourcePrice, sourceCurrency, regionalCurrency), regionalCurrency));
        } else {
          const regionalCurrency = getRegionalPreference().currency;
          setPurchasePrice(roundMoneyInput(convertMoney(data.current_price ?? 0, data.currency ?? "JPY", regionalCurrency), regionalCurrency));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load card.");
      } finally {
        setLoading(false);
      }
    }
    loadCard();
  }, [params.id]);

  const selectedCondition: ConditionPrice | null = useMemo(() => {
    if (!card) return null;
    if (selectedConditionId !== null) {
      const found = card.condition_prices.find((entry) => entry.condition_id === selectedConditionId);
      if (found) return found;
    }
    return pickDefaultCondition(card);
  }, [card, selectedConditionId]);

  const displayPrice = selectedCondition?.min_price ?? card?.current_price ?? null;
  const displayCurrency = selectedCondition?.currency ?? card?.currency ?? "USD";

  function handleSelectCondition(condition: ConditionPrice) {
    setSelectedConditionId(condition.condition_id);
    const price = convertMoney(condition.min_price ?? 0, condition.currency ?? displayCurrency, selectedDisplayCurrency);
    setPurchasePrice(roundMoneyInput(price, selectedDisplayCurrency));
  }

  async function addToPortfolio() {
    if (!card) return;
    if (!isLoggedIn()) {
      setMessage("Please log in before adding cards to your portfolio.");
      return;
    }
    try {
      const storedPurchasePrice = convertMoney(purchasePrice, selectedDisplayCurrency, displayCurrency);
      await api.addPortfolioItem(card.id, quantity, storedPurchasePrice);
      setMessage("Card added to your portfolio.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add card to portfolio.");
    }
  }

  const history = useMemo(() => {
    if (!card || !selectedCondition) return [];
    return card.price_history
      .filter((point) => point.price !== null)
      .filter(
        (point) =>
          point.condition_id === selectedCondition.condition_id ||
          point.condition_name === selectedCondition.condition_name
      );
  }, [card, selectedCondition]);

  const displayHistory = useMemo(() => {
    if (!card || !selectedCondition) return [];
    if (history.length) return history;
    if (selectedCondition.min_price === null) return [];
    return [
      {
        id: -1,
        price: selectedCondition.min_price,
        currency: selectedCondition.currency,
        captured_at: selectedCondition.last_updated ?? card.last_updated ?? card.created_at,
        condition_id: selectedCondition.condition_id,
        condition_name: selectedCondition.condition_name
      }
    ];
  }, [card, history, selectedCondition]);

  if (loading) return <State title="Loading card" body="Fetching card detail and price history." />;
  if (error) return <State title="Could not load card" body={error} tone="error" />;
  if (!card) return <State title="Card not found" body="The requested card does not exist in the local database." />;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
        <div className="relative aspect-square overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.95),rgba(226,232,240,0.9)_48%,rgba(219,234,254,0.65))]">
          <div className="absolute left-8 top-8 h-24 w-24 rounded-full bg-yellow-300/20 blur-3xl" />
          <div className="absolute bottom-8 right-8 h-28 w-28 rounded-full bg-emerald-300/20 blur-3xl" />
          {card.image_url ? (
            <img src={card.image_url} alt={card.name} className="relative h-full w-full object-contain p-8" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">Image unavailable</div>
          )}
        </div>
      </section>

      <section className="space-y-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-2xl shadow-slate-300/50">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(250,204,21,0.22),transparent_20rem),radial-gradient(circle_at_85%_20%,rgba(16,185,129,0.2),transparent_20rem)]" />
          <div className="relative">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-yellow-300">Rank #{card.popularity_rank ?? "N/A"}</p>
          <h1 className="mt-4 text-3xl font-black leading-tight md:text-5xl">{card.name}</h1>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">SNKRDUNK #{card.snkrdunk_id}</p>
          <div className="mt-6 flex flex-wrap items-end gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-300">
                {selectedCondition?.condition_name ?? DEFAULT_CONDITION} {priceSourceShortLabel(selectedCondition)}
              </p>
              <span className="mt-2 inline-flex rounded-full bg-emerald-400 px-5 py-2 text-2xl font-black text-slate-950">
                {formatMoney(displayPrice, displayCurrency)}
              </span>
              <p className="mt-2 text-xs font-semibold text-slate-300">
                {priceSourceDescription(selectedCondition)}
              </p>
            </div>
            <span className="text-sm text-slate-300">Updated {formatDate(card.last_updated)}</span>
          </div>
          <a
            href={card.product_url}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300"
          >
            View on SNKRDUNK
          </a>
          </div>
        </div>

        <ConditionTabs
          conditions={card.condition_prices}
          selectedConditionId={selectedCondition?.condition_id ?? null}
          onSelect={handleSelectCondition}
        />

        <TradingHistoryPanel
          sales={card.recent_sales ?? []}
          selectedConditionName={selectedCondition?.condition_name ?? null}
        />

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-950">Add to portfolio</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-bold text-slate-700">
              Quantity
              <input
                min={1}
                type="number"
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
              />
            </label>
            <label className="text-sm font-bold text-slate-700">
              Purchase price ({selectedDisplayCurrency})
              <input
                min={0}
                step="0.01"
                type="number"
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(Math.max(0, Number(event.target.value)))}
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3"
              />
            </label>
            <button
              onClick={addToPortfolio}
              className="self-end rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
            >
              Add card
            </button>
          </div>
          {message ? <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p> : null}
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                Price history{selectedCondition ? ` · ${selectedCondition.condition_name}` : ""}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Snapshots captured by the sync job for the grade selected above. Each grade is tracked independently, so
                switching tabs reloads its history.
              </p>
            </div>
            {history.length ? (
              <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
                {history.length} observations
              </span>
            ) : null}
          </div>
          {displayHistory.length ? (
            <PriceChart history={displayHistory} currency={card.currency} />
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Not enough price history is available yet. The backend records history during successful syncs.
            </p>
          )}
        </div>

        <Link href="/" className="inline-flex text-sm font-bold text-slate-700 hover:text-slate-950">
          Back to cards
        </Link>
      </section>
    </div>
  );
}

function PriceChart({ history, currency }: { history: PriceHistory[]; currency: string }) {
  const prices = history.map((point) => point.price ?? 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const isFlat = max === min;
  const isSinglePoint = history.length <= 1;
  const range = Math.max(max - min, 1);
  const chartPoints = history.map((point, index) => {
      const x = history.length === 1 ? 50 : (index / (history.length - 1)) * 100;
      const y = isFlat ? 54 : 100 - (((point.price ?? min) - min) / range) * 78 - 12;
      return { x, y, point };
    });
  const points = chartPoints
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");
  const first = history[0];
  const latest = history[history.length - 1];
  const change = (latest.price ?? 0) - (first.price ?? 0);

  return (
    <div className="mt-5 space-y-5">
      {isSinglePoint ? (
        <div className="grid gap-3 md:grid-cols-3">
          <HistoryStat label="Captured" value={formatMoney(latest.price, currency)} sub={formatDate(latest.captured_at)} />
          <HistoryStat label="Snapshots so far" value="1" sub="The timeline builds from the next sync" />
          <HistoryStat label="Change" value="—" sub="Need at least two snapshots" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <HistoryStat label="First captured" value={formatMoney(first.price, currency)} sub={formatDate(first.captured_at)} />
          <HistoryStat label="Latest captured" value={formatMoney(latest.price, currency)} sub={formatDate(latest.captured_at)} />
          <HistoryStat label="Change" value={formatMoney(change, currency)} sub={isFlat ? "No price movement yet" : "Price moved"} />
        </div>
      )}

      {isSinglePoint ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          Only one snapshot has been captured for this grade so far. Each scheduled sync (every 3 hours) and every manual
          "Sync latest top 500" run will append another point, so a real timeline will build over time.
        </div>
      ) : isFlat ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-900">
          Price snapshots exist, but all captured prices for this grade are currently the same. The chart will show movement once SNKRDUNK's public price changes between syncs.
        </div>
      ) : null}

      <svg viewBox="0 0 100 110" className="h-72 w-full overflow-visible rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-100">
        <line x1="0" x2="100" y1="54" y2="54" stroke="#cbd5e1" strokeDasharray="2 2" strokeWidth="0.6" />
        <polyline fill="none" stroke="#10b981" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" points={points} />
        {chartPoints.map(({ x, y, point }) => (
          <circle key={point.id} cx={x} cy={y} r="2.2" fill="#0f172a" stroke="#10b981" strokeWidth="1" />
        ))}
      </svg>
      <div className="mt-4 flex justify-between text-xs font-semibold text-slate-500">
        <span>{formatDate(first?.captured_at)}</span>
        <span>{formatMoney(latest?.price, currency)}</span>
        {isSinglePoint ? (
          <span className="text-slate-400">awaiting next sync</span>
        ) : (
          <span>{formatDate(latest?.captured_at)}</span>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-2 bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-300">
          <span>Captured at</span>
          <span className="text-right">Price</span>
        </div>
        {history.slice(-6).reverse().map((point) => (
          <div key={point.id} className="grid grid-cols-2 border-t border-slate-100 bg-white px-4 py-3 text-sm">
            <span className="font-semibold text-slate-600">{formatDate(point.captured_at)}</span>
            <span className="text-right font-black text-slate-950">{formatMoney(point.price, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function priceSourceShortLabel(condition: ConditionPrice | null | undefined): string {
  if (!condition) return "price";
  return condition.price_source === "sold_avg"
    ? `(avg of last ${condition.sales_count || 3} sold)`
    : "(no recent sales · lowest listing)";
}

function priceSourceDescription(condition: ConditionPrice | null | undefined): string {
  if (!condition) return "";
  if (condition.price_source === "sold_avg") {
    const n = condition.sales_count || 3;
    return `Average of the last ${n} sold ${n === 1 ? "listing" : "listings"} on SNKRDUNK for this grade.`;
  }
  return "No public sold listings for this grade in the recent feed — showing the lowest active SNKRDUNK listing for reference.";
}

type ConditionRow = {
  conditionId: number;
  name: string;
  group: ConditionGroup;
  sortOrder: number;
  price: ConditionPrice | null;
  available: boolean;
};

const GROUP_LABELS: Record<ConditionGroup, string> = {
  Raw: "Raw / ungraded",
  PSA: "PSA",
  BGS: "BGS",
  ARS: "ARS",
  Other: "Other graded"
};

function buildConditionRows(conditions: ConditionPrice[]): ConditionRow[] {
  const byId = new Map<number, ConditionPrice>();
  const byName = new Map<string, ConditionPrice>();
  conditions.forEach((entry) => {
    byId.set(entry.condition_id, entry);
    byName.set(entry.condition_name, entry);
  });

  const rows: ConditionRow[] = KNOWN_CONDITIONS.map((known) => {
    const price = byId.get(known.conditionId) ?? byName.get(known.name) ?? null;
    return {
      conditionId: known.conditionId,
      name: known.name,
      group: known.group,
      sortOrder: known.sortOrder,
      price,
      available: Boolean(price && price.min_price !== null)
    };
  });

  conditions.forEach((entry) => {
    if (!rows.find((row) => row.conditionId === entry.condition_id || row.name === entry.condition_name)) {
      rows.push({
        conditionId: entry.condition_id,
        name: entry.condition_name,
        group: "Other",
        sortOrder: 950 + entry.condition_id,
        price: entry,
        available: entry.min_price !== null
      });
    }
  });

  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

function ConditionTabs({
  conditions,
  selectedConditionId,
  onSelect
}: {
  conditions: ConditionPrice[];
  selectedConditionId: number | null;
  onSelect: (condition: ConditionPrice) => void;
}) {
  const rows = buildConditionRows(conditions);
  const availableCount = rows.filter((row) => row.available).length;

  const grouped = rows.reduce<Record<ConditionGroup, ConditionRow[]>>(
    (acc, row) => {
      acc[row.group] = acc[row.group] ?? [];
      acc[row.group].push(row);
      return acc;
    },
    { Raw: [], PSA: [], BGS: [], ARS: [], Other: [] }
  );
  const groupOrder: ConditionGroup[] = ["Raw", "PSA", "BGS", "ARS", "Other"];

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">Grade prices</h2>
          <p className="mt-1 text-sm text-slate-600">
            Tracking PSA 10 and raw grades A/B/C/D. PSA 10 is selected by default; grades without active SNKRDUNK listings show
            as unavailable.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
          {availableCount} of {rows.length} grades priced
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {rows.map((row) => {
          const isActive = row.available && row.conditionId === selectedConditionId;
          const baseClasses = "rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide transition";
          if (!row.available) {
            return (
              <span
                key={`tab-${row.conditionId}`}
                className={`${baseClasses} cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-slate-400`}
                title="No SNKRDUNK listings for this grade right now"
              >
                {row.name}
              </span>
            );
          }
          return (
            <button
              key={`tab-${row.conditionId}`}
              type="button"
              onClick={() => row.price && onSelect(row.price)}
              className={`${baseClasses} ${
                isActive
                  ? "border-slate-950 bg-slate-950 text-white shadow-md"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              {row.name}
            </button>
          );
        })}
      </div>

      <div className="mt-7 space-y-6">
        {groupOrder.map((group) => {
          const groupRows = grouped[group];
          if (!groupRows || groupRows.length === 0) return null;
          return (
            <div key={group}>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                {GROUP_LABELS[group]}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupRows.map((row) => {
                  const isActive = row.available && row.conditionId === selectedConditionId;
                  const priceLabel = row.available
                    ? formatMoney(row.price!.min_price, row.price!.currency)
                    : "—";
                  const baseClasses = "flex flex-col items-start rounded-2xl border px-4 py-4 text-left transition";
                  if (!row.available) {
                    return (
                      <div
                        key={`tile-${row.conditionId}`}
                        className={`${baseClasses} cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-slate-400`}
                      >
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">{row.name}</span>
                        <span className="mt-2 text-xl font-black text-slate-400">{priceLabel}</span>
                        <span className="mt-1 text-[11px] font-semibold text-slate-400">No active listings</span>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={`tile-${row.conditionId}`}
                      type="button"
                      onClick={() => row.price && onSelect(row.price)}
                      className={`${baseClasses} ${
                        isActive
                          ? "border-emerald-500 bg-emerald-50 shadow-md"
                          : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"
                      }`}
                    >
                      <span className="text-xs font-black uppercase tracking-wide text-slate-500">{row.name}</span>
                      <span className={`mt-2 text-xl font-black ${isActive ? "text-emerald-700" : "text-slate-950"}`}>
                        {priceLabel}
                      </span>
                      <span className="mt-1 text-[11px] font-semibold text-slate-500">
                        {row.price?.price_source === "sold_avg"
                          ? `Avg of last ${row.price.sales_count || 3} sold`
                          : `No recent sales · listing ${row.price?.min_price_format || "—"}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p>
    </div>
  );
}

function TradingHistoryPanel({
  sales,
  selectedConditionName
}: {
  sales: SaleEvent[];
  selectedConditionName: string | null;
}) {
  const [filterAll, setFilterAll] = useState(false);

  const sortedAll = useMemo(() => {
    return [...sales].sort((a, b) => {
      // Prefer real sold-at timestamp when present (auth mode); fall back to
      // SNKRDUNK listing id (public mode).
      const ta = new Date(a.captured_at).getTime();
      const tb = new Date(b.captured_at).getTime();
      if (ta !== tb) return tb - ta;
      return b.listing_id - a.listing_id;
    });
  }, [sales]);

  const matchingForGrade = useMemo(
    () =>
      selectedConditionName
        ? sortedAll.filter((row) => row.condition_name === selectedConditionName)
        : [],
    [sortedAll, selectedConditionName]
  );

  // When the user has a grade selected and there ARE sales for that grade, show
  // them. When there are none, show all grades implicitly (no scary banner).
  const filtered = useMemo(() => {
    if (filterAll || !selectedConditionName) return sortedAll;
    return matchingForGrade.length ? matchingForGrade : sortedAll;
  }, [sortedAll, filterAll, selectedConditionName, matchingForGrade]);

  const visible = filtered.slice(0, 12);
  const fellBackToAllGrades =
    !filterAll && Boolean(selectedConditionName) && matchingForGrade.length === 0;

  if (sales.length === 0) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">Trading history</h2>
        <p className="mt-1 text-sm text-slate-600">
          Recent sold transactions pulled from SNKRDUNK&apos;s public used-listings feed will appear here after the next sync.
        </p>
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          No sold listings are currently exposed publicly for this card.
        </p>
      </div>
    );
  }

  const prices = visible.map((row) => row.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(max - min, 1);
  const sparkPoints = [...visible]
    .reverse()
    .map((row, index, arr) => {
      const x = arr.length === 1 ? 50 : (index / (arr.length - 1)) * 100;
      const y = 100 - ((row.price - min) / range) * 80 - 10;
      return `${x},${y}`;
    })
    .join(" ");
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const currency = visible[0]?.currency ?? "USD";

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">Trading history</h2>
          <p className="mt-1 text-sm text-slate-600">
            Most recent sold listings from SNKRDUNK&apos;s public feed
            {selectedConditionName && !filterAll && !fellBackToAllGrades ? (
              <> · filtered to <strong>{selectedConditionName}</strong></>
            ) : null}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedConditionName ? (
            <button
              type="button"
              onClick={() => setFilterAll(false)}
              className={`rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
                !filterAll
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {selectedConditionName}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setFilterAll(true)}
            className={`rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
              filterAll || !selectedConditionName
                ? "bg-slate-950 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            All grades
          </button>
        </div>
      </div>

      {fellBackToAllGrades ? (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          No public sold listings for {selectedConditionName} in the recent feed — showing all grades for context. Configure
          <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono text-amber-900">SNKRDUNK_BROWSER_CURL</code>
          in <code className="font-mono">backend/.env</code> to fetch the full authenticated history.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[2fr_3fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            Avg of {visible.length} sold rows
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(avg, currency)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Range {formatMoney(min, currency)} – {formatMoney(max, currency)}
          </p>
          <svg viewBox="0 0 100 100" className="mt-4 h-24 w-full">
            <polyline
              fill="none"
              stroke="#10b981"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              points={sparkPoints}
            />
          </svg>
          <p className="text-[11px] font-semibold text-slate-400">
            Older listings on the left, newer listings on the right (ordered by SNKRDUNK listing id)
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[1.25fr_0.75fr_1fr] bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-300">
            <span>Date</span>
            <span>Grade</span>
            <span className="text-right">Price</span>
          </div>
          {visible.map((row, idx) => (
            <div
              key={row.id}
              className={`grid grid-cols-[1.25fr_0.75fr_1fr] border-t border-slate-100 px-4 py-3 text-sm ${
                idx % 2 === 0 ? "bg-white" : "bg-slate-50"
              }`}
            >
              <span className="font-semibold text-slate-500">{formatSaleTime(row.captured_at)}</span>
              <span className="font-bold text-slate-700">{row.condition_name}</span>
              <span className="text-right font-black text-slate-950">{formatMoney(row.price, row.currency)}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-[11px] font-semibold text-slate-400">
        Note: SNKRDUNK&apos;s public feed exposes sold prices and grades, but not exact sold timestamps. Rows are ordered by
        SNKRDUNK listing id (creation order) which closely tracks recency. Captured during the latest sync at{" "}
        {visible[0] ? formatDate(visible[0].captured_at) : "—"}.
      </p>
    </div>
  );
}

function formatSaleTime(value: string) {
  const ageMs = Date.now() - new Date(value).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return ageMs >= 0 && ageMs < oneDayMs ? formatRelativeTime(value) : formatDate(value);
}

function State({ title, body, tone = "default" }: { title: string; body: string; tone?: "default" | "error" }) {
  return (
    <div className={`rounded-3xl border p-8 ${tone === "error" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
      <h1 className={`text-xl font-black ${tone === "error" ? "text-red-800" : "text-slate-950"}`}>{title}</h1>
      <p className={`mt-2 text-sm ${tone === "error" ? "text-red-700" : "text-slate-600"}`}>{body}</p>
    </div>
  );
}
