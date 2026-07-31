"use client";
import { MARKETS, Market } from "@/lib/types";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function MarketFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = (params.get("markets") || "").split(",").filter(Boolean) as Market[];

  function toggle(code: Market) {
    const set = new Set(active);
    set.has(code) ? set.delete(code) : set.add(code);
    const next = new URLSearchParams(params.toString());
    const val = Array.from(set).join(",");
    val ? next.set("markets", val) : next.delete("markets");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted mr-1">Market</span>
      {MARKETS.map((m) => {
        const on = active.length === 0 || active.includes(m.code);
        return (
          <button
            key={m.code}
            onClick={() => toggle(m.code)}
            className={`chip ${active.includes(m.code) ? "chip-active" : ""} ${
              active.length && !active.includes(m.code) ? "opacity-45" : ""
            }`}
          >
            <span>{m.flag}</span>
            {m.code}
          </button>
        );
      })}
      {active.length > 0 && (
        <button
          onClick={() => router.push(pathname)}
          className="text-xs text-muted underline underline-offset-2 hover:text-ink ml-1"
        >
          clear
        </button>
      )}
    </div>
  );
}
