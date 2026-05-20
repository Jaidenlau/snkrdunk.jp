"use client";

import { useEffect, useState } from "react";
import CardGrid from "@/components/CardGrid";
import { api, formatDate, formatMoney, formatRelativeTime, getRegionalPreference } from "@/lib/api";
import type { DisplayCurrency } from "@/lib/api";
import type { Card } from "@/lib/types";

export default function HomePage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [isHongKong, setIsHongKong] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("JPY");
  const [, setClockTick] = useState(0);
  const lastUpdated = cards
    .map((card) => card.last_updated)
    .filter(Boolean)
    .sort()
    .at(-1);
  const featuredCards = cards.slice(0, 3);
  const spotlightCards = cards.slice(0, 4);

  // Honest counts: how many cards have at least one grade priced from real sold
  // data vs. cards that fall back to lowest-listing for every grade. This way the
  // hero stats can't accidentally claim "$X total" while mixing sold and listing.
  const cardsWithSoldData = cards.filter((card) =>
    (card.condition_prices ?? []).some((cp) => cp.price_source === "sold_avg")
  ).length;
  const totalGradeRows = cards.reduce(
    (sum, card) => sum + (card.condition_prices?.length ?? 0),
    0
  );
  const soldGradeRows = cards.reduce(
    (sum, card) =>
      sum + (card.condition_prices ?? []).filter((cp) => cp.price_source === "sold_avg").length,
    0
  );

  async function loadCards() {
    try {
      setCards(await api.listCards());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cards.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCards();
    const regional = getRegionalPreference();
    setIsHongKong(regional.isHongKong);
    setDisplayCurrency(regional.currency);
  }, []);

  const heroCopy = isHongKong
    ? {
        badge: "SNKRDUNK 即時市場數據",
        title: "用一個簡潔儀表板追蹤 Pokemon 卡價。",
        body: "睇 SNKRDUNK 市場價格、建立自己嘅收藏組合，留意突然跌價或升價嘅機會。",
        trackedCards: "追蹤卡",
        soldGrades: "已售價等級",
        updated: "更新",
        openSource: "打開 SNKRDUNK",
        marketPulse: "市場動態",
        feed: "SNKRDUNK 即時資料",
        source: "來源",
        lastSync: "上次同步"
      }
    : {
        badge: "Real-time data from SNKRDUNK",
        title: "Track Pokemon card prices from SNKRDUNK in one clean dashboard.",
        body: "Follow real-time SNKRDUNK market data, build your portfolio, and watch for sudden price drops or spikes before they move past you.",
        trackedCards: "Tracked cards",
        soldGrades: "Sold-priced grades",
        updated: "Updated",
        openSource: "Open SNKRDUNK",
        marketPulse: "Market pulse",
        feed: "Real-time SNKRDUNK feed",
        source: "Source",
        lastSync: "Last sync"
      };

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function syncLatestCards() {
    setSyncing(true);
    setSyncMessage("");
    setError("");
    try {
      const result = await api.syncCards();
      await loadCards();
      setSyncMessage(result.synced ? `${result.message}. Last sync timer updated.` : result.message);
    } catch (err) {
      setSyncMessage(
        err instanceof Error
          ? `${err.message}. Log in with the email configured as ADMIN_EMAIL to run manual sync.`
          : "Could not sync cards."
      );
    } finally {
      setSyncing(false);
    }
  }

  function toggleRegion() {
    const nextRegion = displayCurrency === "JPY" ? "HK" : "JP";
    window.localStorage.setItem("snkrdunk_region", nextRegion);
    window.location.href = `/?region=${nextRegion}`;
  }

  const nextCurrencyLabel = displayCurrency === "JPY" ? "Switch to HKD (HK$)" : "Switch to JPY (¥)";

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[2.75rem] border border-white/40 bg-[#070b19] px-6 py-10 text-white shadow-2xl shadow-slate-300/60 md:px-12 md:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_16%,rgba(250,204,21,0.34),transparent_24rem),radial-gradient(circle_at_74%_18%,rgba(20,184,166,0.32),transparent_26rem),radial-gradient(circle_at_62%_90%,rgba(99,102,241,0.22),transparent_24rem),linear-gradient(135deg,rgba(2,6,23,0),rgba(15,23,42,0.84))]" />
        <div className="absolute left-0 top-0 h-full w-full bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px] opacity-35" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10 bg-white/5 blur-sm" />
        <div className="absolute -bottom-32 left-1/2 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/30 bg-yellow-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-yellow-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {heroCopy.badge}
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">
              {heroCopy.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
              {heroCopy.body}
            </p>
            <div className="mt-7 grid max-w-2xl gap-3 sm:grid-cols-3">
              <MiniStat label={heroCopy.trackedCards} value={loading ? "..." : String(cards.length)} />
              <MiniStat
                label={heroCopy.soldGrades}
                value={
                  loading
                    ? "..."
                    : totalGradeRows
                    ? `${soldGradeRows} / ${totalGradeRows}`
                    : "0"
                }
                hint={
                  totalGradeRows
                    ? `${cardsWithSoldData} cards have real sold data`
                    : "Run a sync"
                }
              />
              <MiniStat label={heroCopy.updated} value={lastUpdated ? formatRelativeTime(lastUpdated) : "Never"} />
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                onClick={syncLatestCards}
                disabled={syncing}
                className="rounded-full bg-yellow-300 px-6 py-3 text-sm font-black text-slate-950 shadow-xl shadow-yellow-300/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncing ? "Syncing..." : "Sync latest cards"}
              </button>
              <a
                href="https://snkrdunk.com/en/brands/pokemon/trading-cards?categoryId=25"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-black text-white backdrop-blur transition hover:bg-white/20"
              >
                {heroCopy.openSource}
              </a>
              <button
                type="button"
                onClick={toggleRegion}
                className="rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-black text-white backdrop-blur transition hover:bg-white/20"
              >
                {nextCurrencyLabel}
              </button>
            </div>
            {syncMessage ? (
              <p className="mt-4 max-w-2xl rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-slate-100">
                {syncMessage}
              </p>
            ) : null}
          </div>
          <div className="rounded-[2.25rem] border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between px-1">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-300">{heroCopy.marketPulse}</p>
                <p className="mt-1 text-sm font-semibold text-white">{heroCopy.feed}</p>
              </div>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200 ring-1 ring-emerald-300/20">
                {lastUpdated ? formatRelativeTime(lastUpdated) : "idle"}
              </span>
            </div>
            <div className="space-y-3">
              {featuredCards.length ? (
                featuredCards.map((card) => <FeaturedCard key={card.id} card={card} />)
              ) : (
                <div className="rounded-3xl bg-white/10 p-5 text-sm font-semibold text-slate-300">Sync cards to see market leaders.</div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <HeroMetric label={heroCopy.source} value="SNKRDUNK" />
              <HeroMetric label={heroCopy.lastSync} value={lastUpdated ? formatDate(lastUpdated) : "Waiting"} />
            </div>
          </div>
        </div>
      </section>

      {spotlightCards.length ? (
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white bg-white/80 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70 backdrop-blur md:p-7">
          <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-yellow-300/20 blur-3xl" />
          <div className="absolute -right-20 bottom-0 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="relative mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-yellow-600">Spotlight</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Cards leading the market right now</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-600">
              These are the highest-ranked Pokemon cards from the SNKRDUNK market feed.
            </p>
          </div>
          <div className="relative grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {spotlightCards.map((card) => (
              <SpotlightCard key={card.id} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <TrustCard title="Real SNKRDUNK data" body="Each card keeps its SNKRDUNK product URL, product ID, grade prices, and recent sold-price source." />
        <TrustCard title="Portfolio ready" body="Add cards you own, track quantity, cost basis, current value, and profit/loss from one clean view." />
        <TrustCard title="Market alerts next" body="The app is structured for sudden drop/spike notifications when the scheduled sync sees large moves." />
      </section>

      <section>
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Market watch</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Top Pokemon Cards</h2>
            <p className="mt-2 text-sm text-slate-600">
              Updated from SNKRDUNK and shown with clear sold-price versus listing-fallback labels.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
              {cards.length ? `${cards.length} cards loaded` : "Ready to sync"}
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">
              Updated {lastUpdated ? formatRelativeTime(lastUpdated) : "never"}
            </div>
          </div>
        </div>

        {loading ? <StateCard title="Loading cards" body="Fetching stored card data from the backend." /> : null}
        {error ? <StateCard title="Could not load cards" body={error} tone="error" /> : null}
        {!loading && !error ? <CardGrid cards={cards} /> : null}
      </section>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-inner">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-300">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{hint}</p> : null}
    </div>
  );
}

function FeaturedCard({ card }: { card: Card }) {
  const psa10 = card.condition_prices?.find((cp) => cp.condition_name === "PSA 10");
  const isSold = psa10?.price_source === "sold_avg";
  return (
    <div className="group flex items-center gap-4 rounded-3xl border border-white/10 bg-white/10 p-3 transition hover:bg-white/15">
      <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/10">
        {card.image_url ? (
          <img src={card.image_url} alt={card.name} className="h-full w-full object-contain p-1.5 transition group-hover:scale-105" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-200">#{card.popularity_rank}</p>
        <p className="mt-1 line-clamp-2 text-sm font-black leading-snug text-white">{card.name}</p>
        <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
          {isSold ? `Avg of last ${psa10?.sales_count || 5} sold` : "Listing (no recent PSA 10 sold)"}
        </p>
      </div>
      <div
        className={`rounded-2xl px-3 py-2 text-sm font-black text-slate-950 ${
          isSold ? "bg-emerald-300" : "bg-amber-200"
        }`}
      >
        {formatMoney(card.current_price, card.currency)}
      </div>
    </div>
  );
}

function SpotlightCard({ card }: { card: Card }) {
  const psa10 = card.condition_prices?.find((cp) => cp.condition_name === "PSA 10");
  const isSold = psa10?.price_source === "sold_avg";
  return (
    <a
      href={`/cards/${card.id}`}
      className="group relative overflow-hidden rounded-[2rem] bg-slate-950 p-4 text-white shadow-xl shadow-slate-300/40 transition duration-300 hover:-translate-y-1 hover:shadow-2xl"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(250,204,21,0.24),transparent_14rem),radial-gradient(circle_at_70%_90%,rgba(16,185,129,0.24),transparent_14rem)]" />
      <div className="relative aspect-[4/3] rounded-[1.5rem] bg-white/10 p-3 ring-1 ring-white/10">
        {card.image_url ? (
          <img src={card.image_url} alt={card.name} className="h-full w-full object-contain transition duration-300 group-hover:scale-105" />
        ) : null}
        <span className="absolute left-3 top-3 rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-slate-950">
          #{card.popularity_rank}
        </span>
      </div>
      <div className="relative mt-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">SNKRDUNK #{card.snkrdunk_id}</p>
        <h3 className="mt-2 line-clamp-2 min-h-12 text-base font-black leading-snug">{card.name}</h3>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          PSA 10 · {isSold ? `avg of last ${psa10?.sales_count || 5} sold` : "no recent sold · listing"}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span
            className={`rounded-full px-3 py-2 text-sm font-black text-slate-950 ${
              isSold ? "bg-emerald-300" : "bg-amber-200"
            }`}
          >
            {formatMoney(card.current_price, card.currency)}
          </span>
          <span className="text-xs font-bold text-slate-300 transition group-hover:text-white">View card</span>
        </div>
      </div>
    </a>
  );
}

function TrustCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.75rem] border border-white bg-white/85 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 backdrop-blur">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-lg font-black text-emerald-700 ring-1 ring-emerald-100">
        OK
      </div>
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function StateCard({ title, body, tone = "default" }: { title: string; body: string; tone?: "default" | "error" }) {
  return (
    <div className={`rounded-3xl border p-8 ${tone === "error" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
      <h2 className={`text-lg font-bold ${tone === "error" ? "text-red-800" : "text-slate-950"}`}>{title}</h2>
      <p className={`mt-2 text-sm ${tone === "error" ? "text-red-700" : "text-slate-600"}`}>{body}</p>
    </div>
  );
}
