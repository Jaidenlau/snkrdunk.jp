"use client";

import Link from "next/link";
import { api, convertMoney, formatDate, formatMoney, getRegionalPreference, isLoggedIn, pickDefaultCondition } from "@/lib/api";
import type { Card } from "@/lib/types";

type Props = {
  card: Card;
  onMessage?: (message: string) => void;
};

export default function CardItem({ card, onMessage }: Props) {
  const defaultCondition = pickDefaultCondition(card);
  const displayPrice = defaultCondition?.min_price ?? card.current_price;
  const displayCurrency = defaultCondition?.currency ?? card.currency;

  async function addToPortfolio() {
    if (!isLoggedIn()) {
      onMessage?.("Please log in before adding cards to your portfolio.");
      return;
    }
    try {
      const userCurrency = getRegionalPreference().currency;
      const priceInUserCurrency = convertMoney(displayPrice ?? 0, displayCurrency, userCurrency);
      await api.addPortfolioItem(card.id, 1, priceInUserCurrency, userCurrency);
      onMessage?.(`${card.name} was added to your portfolio.`);
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "Could not add card to portfolio.");
    }
  }

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[1.9rem] border border-white bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-2 hover:shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-300 via-emerald-400 to-indigo-400 opacity-0 transition group-hover:opacity-100" />
      <Link
        href={`/cards/${card.id}`}
        className="relative block aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.95),rgba(226,232,240,0.9)_48%,rgba(219,234,254,0.65))]"
      >
        <div className="absolute left-4 top-4 h-16 w-16 rounded-full bg-yellow-300/20 blur-2xl" />
        <div className="absolute bottom-4 right-4 h-20 w-20 rounded-full bg-emerald-400/20 blur-2xl" />
        <div className="absolute inset-x-8 bottom-3 h-10 rounded-full bg-slate-900/10 blur-2xl transition group-hover:bg-emerald-500/20" />
        {card.image_url ? (
          // SNKRDUNK image hosts vary, so a plain image keeps local MVP config simple.
          <img
            src={card.image_url}
            alt={card.name}
            className="relative h-full w-full object-contain p-5 transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-slate-500">
            Image unavailable
          </div>
        )}
        <span className="absolute left-4 top-4 rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-slate-950 shadow-lg shadow-yellow-300/30">
          #{card.popularity_rank ?? "N/A"}
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <Link href={`/cards/${card.id}`} className="line-clamp-2 text-base font-black leading-snug text-slate-950 hover:text-emerald-700">
            {card.name}
          </Link>
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">SNKRDUNK #{card.snkrdunk_id}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Updated {formatDate(card.last_updated)}</p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span
              className={`rounded-full px-3 py-2 text-sm font-black ring-1 ${
                defaultCondition?.price_source === "sold_avg"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                  : "bg-amber-50 text-amber-800 ring-amber-100"
              }`}
            >
              {formatMoney(displayPrice, displayCurrency)}
            </span>
            <span className="mt-1 px-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
              {defaultCondition?.condition_name ?? "Lowest"}
              {" · "}
              {defaultCondition?.price_source === "sold_avg"
                ? `avg of last ${defaultCondition.sales_count || 5} sold`
                : "no recent sold · listing"}
            </span>
          </div>
          <button
            onClick={addToPortfolio}
            className="rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-600"
          >
            Add
          </button>
        </div>
      </div>
    </article>
  );
}
