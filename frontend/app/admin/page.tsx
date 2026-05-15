"use client";

import Link from "next/link";
import { useState } from "react";
import { api, isLoggedIn } from "@/lib/api";

const SAMPLE_IMPORT = `[
  {
    "name": "Sample Pikachu",
    "product_url": "https://snkrdunk.com/en/trading-cards/sample",
    "image_url": "https://example.com/pikachu.png",
    "current_price": 25,
    "currency": "USD",
    "popularity_rank": 1,
    "snkrdunk_id": "sample"
  }
]`;

export default function AdminPage() {
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [importJson, setImportJson] = useState(SAMPLE_IMPORT);

  if (!isLoggedIn()) {
    return (
      <StateCard
        title="Admin login required"
        body="Log in using the email configured as ADMIN_EMAIL in backend/.env to access admin controls."
        action={
          <Link href="/login" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">
            Go to login
          </Link>
        }
      />
    );
  }

  async function runSync() {
    setSyncing(true);
    setMessage("");
    try {
      const result = await api.syncCards();
      setMessage(`${result.message}. The site now serves the latest stored result.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not run sync. Make sure this account matches ADMIN_EMAIL.");
    } finally {
      setSyncing(false);
    }
  }

  async function importFallback() {
    setImporting(true);
    setMessage("");
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) {
        throw new Error("Import JSON must be an array of card objects.");
      }
      const result = await api.importCards(parsed);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import cards.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-8 text-white shadow-2xl shadow-slate-300/50 md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(250,204,21,0.22),transparent_22rem),radial-gradient(circle_at_84%_18%,rgba(16,185,129,0.22),transparent_22rem)]" />
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-yellow-200">Admin controls</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Manage snkrdunk.jp</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Run the protected SNKRDUNK sync, import fallback card data, and manage publish-ready configuration from one place.
          </p>
        </div>
      </section>

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {message}
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Live data</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Sync up to 500 cards</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Pulls the top SNKRDUNK Pokemon cards, grade prices, sold averages, and trading-history rows. This can take time and
            should be run when SNKRDUNK is not rate-limiting.
          </p>
          <button
            onClick={runSync}
            disabled={syncing}
            className="mt-5 rounded-full bg-yellow-300 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-yellow-300/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? "Running sync..." : "Run 500-card sync"}
          </button>
        </div>

        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Fallback control</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Import card JSON</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            If SNKRDUNK blocks live extraction, paste a JSON array of cards here and import it without editing the database manually.
          </p>
          <textarea
            value={importJson}
            onChange={(event) => setImportJson(event.target.value)}
            className="mt-4 h-52 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800 outline-none focus:border-emerald-400"
          />
          <button
            onClick={importFallback}
            disabled={importing}
            className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing ? "Importing..." : "Import JSON"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard title="Admin account" body="Only the user whose email matches ADMIN_EMAIL can call /admin/* endpoints." />
        <InfoCard title="Publish access" body="The whole monorepo can be deployed later; no private SNKRDUNK API key is required." />
        <InfoCard title="Configurable limit" body="MAX_TRACKED_CARDS is set to 500 and can be adjusted later if syncs need to be smaller or broader." />
      </section>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.75rem] border border-white bg-white/85 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function StateCard({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8">
      <h1 className="text-xl font-black text-slate-950">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
      {action}
    </div>
  );
}
