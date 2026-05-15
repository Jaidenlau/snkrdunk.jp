"use client";

import { useMemo, useState } from "react";
import CardItem from "./CardItem";
import { getRegionalPreference } from "@/lib/api";
import type { Card } from "@/lib/types";

type GradeFilter = "ALL" | "A" | "B" | "C" | "D" | "PSA 10";
type SortKey = "rank" | "price_desc" | "price_asc" | "name";

const GRADE_OPTIONS: GradeFilter[] = ["ALL", "PSA 10", "A", "B", "C", "D"];

export default function CardGrid({ cards }: { cards: Card[] }) {
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState<GradeFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("rank");
  const [visibleCount, setVisibleCount] = useState(48);

  const isHongKong = typeof window !== "undefined" && getRegionalPreference().isHongKong;
  const copy = isHongKong
    ? {
        search: "搜尋卡名、組合、編號…",
        grade: "等級",
        sort: "排序",
        sortRank: "人氣",
        sortPriceDesc: "價格高至低",
        sortPriceAsc: "價格低至高",
        sortName: "名稱",
        showing: "顯示",
        of: "張，共",
        more: "再載入更多",
        none: "沒有符合嘅卡，試下其他關鍵字。"
      }
    : {
        search: "Search by name, set, card number…",
        grade: "Grade",
        sort: "Sort",
        sortRank: "Popularity",
        sortPriceDesc: "Price high → low",
        sortPriceAsc: "Price low → high",
        sortName: "Name",
        showing: "Showing",
        of: "of",
        more: "Load more",
        none: "No cards match your filters. Try a different search."
      };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = cards;
    if (q) {
      rows = rows.filter((card) =>
        card.name.toLowerCase().includes(q) ||
        (card.snkrdunk_id ?? "").toLowerCase().includes(q)
      );
    }
    if (grade !== "ALL") {
      rows = rows.filter((card) =>
        (card.condition_prices ?? []).some(
          (cp) => cp.condition_name === grade && cp.min_price !== null
        )
      );
    }
    const withPrice = (card: Card) => {
      if (grade !== "ALL") {
        const cp = (card.condition_prices ?? []).find((entry) => entry.condition_name === grade);
        return cp?.min_price ?? card.current_price ?? null;
      }
      return card.current_price;
    };
    const sorted = [...rows];
    if (sort === "price_desc") {
      sorted.sort((a, b) => (withPrice(b) ?? -Infinity) - (withPrice(a) ?? -Infinity));
    } else if (sort === "price_asc") {
      sorted.sort((a, b) => (withPrice(a) ?? Infinity) - (withPrice(b) ?? Infinity));
    } else if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => (a.popularity_rank ?? 9e9) - (b.popularity_rank ?? 9e9));
    }
    return sorted;
  }, [cards, query, grade, sort]);

  if (cards.length === 0) {
    return (
      <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">No cards synced yet</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          The app is ready, but no public SNKRDUNK card data has been stored yet. Run the backend manual sync endpoint and
          refresh this page.
        </p>
      </div>
    );
  }

  const visible = filtered.slice(0, visibleCount);

  return (
    <div>
      {message ? (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-sm">
          {message}
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 rounded-[1.75rem] border border-slate-200 bg-white/90 p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" />
            </svg>
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(48);
            }}
            placeholder={copy.search}
            className="w-full rounded-full border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
            <span className="uppercase tracking-wide text-slate-500">{copy.grade}</span>
            <select
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value as GradeFilter);
                setVisibleCount(48);
              }}
              className="bg-transparent text-sm font-black text-slate-900 focus:outline-none"
            >
              {GRADE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? (isHongKong ? "全部" : "All") : option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
            <span className="uppercase tracking-wide text-slate-500">{copy.sort}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-transparent text-sm font-black text-slate-900 focus:outline-none"
            >
              <option value="rank">{copy.sortRank}</option>
              <option value="price_desc">{copy.sortPriceDesc}</option>
              <option value="price_asc">{copy.sortPriceAsc}</option>
              <option value="name">{copy.sortName}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
        {copy.showing} {visible.length} {copy.of} {filtered.length}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm font-semibold text-slate-500">
          {copy.none}
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((card) => (
              <CardItem key={card.id} card={card} onMessage={setMessage} />
            ))}
          </div>
          {visibleCount < filtered.length ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + 48)}
                className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-900 shadow-sm transition hover:border-emerald-400 hover:text-emerald-700"
              >
                {copy.more}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
