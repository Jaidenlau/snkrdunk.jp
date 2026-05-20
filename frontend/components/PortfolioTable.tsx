"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, convertMoney, formatMoney, getRegionalPreference, roundMoneyInput } from "@/lib/api";
import type { DisplayCurrency } from "@/lib/api";
import type { PortfolioItem } from "@/lib/types";

export default function PortfolioTable({
  items,
  onChanged
}: {
  items: PortfolioItem[];
  onChanged: () => Promise<void>;
}) {
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const displayCurrency = getRegionalPreference().currency;

  const totals = items.reduce(
    (acc, item) => {
      const cardCurrency = item.card.currency ?? "JPY";
      const priceCurrency = item.purchase_price_currency ?? cardCurrency;
      const totalCost = item.quantity * convertMoney(item.purchase_price, priceCurrency, displayCurrency);
      const currentValue = item.quantity * convertMoney(item.card.current_price ?? 0, cardCurrency, displayCurrency);
      acc.totalCost += totalCost;
      acc.currentValue += currentValue;
      return acc;
    },
    { totalCost: 0, currentValue: 0 }
  );
  const profitLoss = totals.currentValue - totals.totalCost;
  const profitLossPercent = totals.totalCost > 0 ? (profitLoss / totals.totalCost) * 100 : 0;

  async function updateItem(item: PortfolioItem, quantity: number, purchasePrice: number, purchasePriceCurrency = "JPY") {
    setSavingId(item.id);
    setError("");
    try {
      await api.updatePortfolioItem(item.id, quantity, purchasePrice, purchasePriceCurrency);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update portfolio item.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteItem(itemId: number) {
    setSavingId(itemId);
    setError("");
    try {
      await api.deletePortfolioItem(itemId);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete portfolio item.");
    } finally {
      setSavingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-[2rem] border border-dashed border-slate-300 bg-white/85 p-10 text-center shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <div className="absolute inset-x-16 -top-20 h-40 rounded-full bg-yellow-300/20 blur-3xl" />
        <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 text-lg font-black text-yellow-300">
          P
        </div>
        <h2 className="relative mt-5 text-2xl font-black text-slate-950">Your portfolio is empty</h2>
        <p className="relative mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
          Add cards from the homepage or a card detail page to start tracking your collection value.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Summary label="Total cost" value={formatMoney(totals.totalCost, displayCurrency)} />
        <Summary label="Current value" value={formatMoney(totals.currentValue, displayCurrency)} />
        <Summary label="Profit / loss" value={formatMoney(profitLoss, displayCurrency)} tone={profitLoss >= 0 ? "good" : "bad"} />
        <Summary label="Profit / loss %" value={`${profitLossPercent.toFixed(2)}%`} tone={profitLoss >= 0 ? "good" : "bad"} />
      </div>

      {error ? <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const cardCurrency = item.card.currency ?? "JPY";
          const priceCurrency = item.purchase_price_currency ?? cardCurrency;
          const totalCost = item.quantity * convertMoney(item.purchase_price, priceCurrency, displayCurrency);
          const currentValue = item.quantity * convertMoney(item.card.current_price ?? 0, cardCurrency, displayCurrency);
          const rowProfitLoss = currentValue - totalCost;
          const rowPercent = totalCost > 0 ? (rowProfitLoss / totalCost) * 100 : 0;
          return (
            <PortfolioCard
              key={item.id}
              item={item}
              totalCost={totalCost}
              currentValue={currentValue}
              profitLoss={rowProfitLoss}
              profitLossPercent={rowPercent}
              displayCurrency={displayCurrency}
              saving={savingId === item.id}
              onUpdate={updateItem}
              onDelete={deleteItem}
            />
          );
        })}
      </div>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-950";
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-white bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
      <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-emerald-300/10 blur-2xl" />
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function PortfolioCard({
  item,
  totalCost,
  currentValue,
  profitLoss,
  profitLossPercent,
  displayCurrency,
  saving,
  onUpdate,
  onDelete
}: {
  item: PortfolioItem;
  totalCost: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercent: number;
  displayCurrency: DisplayCurrency;
  saving: boolean;
  onUpdate: (item: PortfolioItem, quantity: number, purchasePrice: number, purchasePriceCurrency?: string) => Promise<void>;
  onDelete: (itemId: number) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(item.quantity);
  const cardCurrency = item.card.currency ?? "JPY";
  // Use the stored purchase_price_currency when available (new rows store the user's display currency).
  // Legacy rows (null) fall back to cardCurrency for backward compatibility.
  const storedCurrency = item.purchase_price_currency ?? cardCurrency;
  const [purchasePrice, setPurchasePrice] = useState(
    roundMoneyInput(convertMoney(item.purchase_price, storedCurrency, displayCurrency), displayCurrency)
  );
  const priceSource = item.card.condition_prices?.find((price) => price.condition_name === "PSA 10")?.price_source;

  useEffect(() => {
    setQuantity(item.quantity);
    setPurchasePrice(roundMoneyInput(convertMoney(item.purchase_price, storedCurrency, displayCurrency), displayCurrency));
  }, [storedCurrency, displayCurrency, item.purchase_price, item.quantity]);

  const currentPrice = convertMoney(item.card.current_price, cardCurrency, displayCurrency);
  // purchasePrice is already in displayCurrency — store as-is with an explicit currency tag
  // so it stays stable even if card.currency changes between syncs.
  const storedPurchasePrice = purchasePrice;

  return (
    <article className="group relative overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 transition hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(15,23,42,0.14)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-300 via-emerald-400 to-indigo-400" />
      <div className="grid gap-4 p-5 sm:grid-cols-[128px_1fr]">
        <Link
          href={`/cards/${item.card.id}`}
          className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.95),rgba(226,232,240,0.9)_52%,rgba(219,234,254,0.65))]"
        >
          {item.card.image_url ? (
            <img
              src={item.card.image_url}
              alt={item.card.name}
              className="h-full w-full object-contain p-4 transition group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-slate-500">
              Image unavailable
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-yellow-300 px-2.5 py-1 text-[11px] font-black text-slate-950">
            Qty {item.quantity}
          </span>
        </Link>

        <div className="flex min-w-0 flex-col">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">
            SNKRDUNK #{item.card.snkrdunk_id ?? "N/A"}
          </p>
          <Link href={`/cards/${item.card.id}`} className="mt-1 line-clamp-2 text-lg font-black leading-snug text-slate-950 hover:text-emerald-700">
            {item.card.name}
          </Link>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            PSA 10 · {priceSource === "sold_avg" ? "avg sold price" : "listing fallback"}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <MiniMetric label="Current" value={formatMoney(currentPrice, displayCurrency)} />
            <MiniMetric label="Value" value={formatMoney(currentValue, displayCurrency)} />
            <MiniMetric label="Cost" value={formatMoney(totalCost, displayCurrency)} />
            <MiniMetric
              label="P/L"
              value={`${formatMoney(profitLoss, displayCurrency)} (${profitLossPercent.toFixed(1)}%)`}
              tone={profitLoss >= 0 ? "good" : "bad"}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 p-5 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <label className="text-xs font-black uppercase tracking-wide text-slate-500">
          Quantity
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-emerald-400"
            min={1}
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
          />
        </label>
        <label className="text-xs font-black uppercase tracking-wide text-slate-500">
          Purchase price ({displayCurrency})
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-emerald-400"
            min={0}
            step="0.01"
            type="number"
            value={purchasePrice}
            onChange={(event) => setPurchasePrice(Math.max(0, Number(event.target.value)))}
          />
        </label>
        <button
          disabled={saving}
          onClick={() => onUpdate(item, quantity, storedPurchasePrice, displayCurrency)}
          className="rounded-full bg-slate-950 px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-600 disabled:opacity-50"
        >
          Save
        </button>
        <button
          disabled={saving}
          onClick={() => onDelete(item.id)}
          className="rounded-full border border-red-200 bg-white px-4 py-2.5 text-xs font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </article>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-950";
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-black ${toneClass}`}>{value}</p>
    </div>
  );
}
