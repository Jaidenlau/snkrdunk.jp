"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PortfolioTable from "@/components/PortfolioTable";
import { api, convertMoney, formatMoney, getRegionalPreference, isLoggedIn } from "@/lib/api";
import type { PortfolioItem } from "@/lib/types";

export default function PortfolioPage() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const totalCards = items.reduce((sum, item) => sum + item.quantity, 0);
  const displayCurrency = getRegionalPreference().currency;
  const currentValue = items.reduce(
    (sum, item) => sum + item.quantity * convertMoney(item.card.current_price ?? 0, item.card.currency ?? "JPY", displayCurrency),
    0
  );

  async function loadPortfolio() {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      setLoading(false);
      return;
    }
    setLoggedIn(true);
    try {
      setItems(await api.getPortfolio());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load portfolio.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPortfolio();
  }, []);

  if (loading) {
    return <State title="Loading portfolio" body="Fetching your collection from the backend." />;
  }

  if (!loggedIn) {
    return (
      <State
        title="Login required"
        body="Create an account or log in to build a portfolio."
        action={
          <Link href="/login" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">
            Go to login
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-8 text-white shadow-2xl shadow-slate-300/50 md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(250,204,21,0.22),transparent_22rem),radial-gradient(circle_at_84%_18%,rgba(16,185,129,0.22),transparent_22rem)]" />
        <div className="relative flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-yellow-200">snkrdunk.jp portfolio</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Your card collection</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              A clean view of your cards, quantities, purchase prices, current market value, and profit or loss.
            </p>
          </div>
          <div className="grid min-w-72 gap-3 sm:grid-cols-2">
            <HeroStat label="Cards owned" value={String(totalCards)} />
            <HeroStat label="Current value" value={formatMoney(currentValue, displayCurrency)} />
          </div>
        </div>
      </section>
      {error ? <State title="Could not load portfolio" body={error} tone="error" /> : <PortfolioTable items={items} onChanged={loadPortfolio} />}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function State({
  title,
  body,
  tone = "default",
  action
}: {
  title: string;
  body: string;
  tone?: "default" | "error";
  action?: React.ReactNode;
}) {
  return (
    <div className={`rounded-3xl border p-8 ${tone === "error" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
      <h1 className={`text-xl font-black ${tone === "error" ? "text-red-800" : "text-slate-950"}`}>{title}</h1>
      <p className={`mt-2 text-sm ${tone === "error" ? "text-red-700" : "text-slate-600"}`}>{body}</p>
      {action}
    </div>
  );
}
