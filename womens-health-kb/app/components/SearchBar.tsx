"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchBar({ initial = "", autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
      className="relative"
    >
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">⌕</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="Semantic search across the knowledge base…"
        className="w-full rounded-xl border border-line bg-surface pl-10 pr-4 py-3 text-[15px] outline-none focus:border-plum-400"
      />
    </form>
  );
}
