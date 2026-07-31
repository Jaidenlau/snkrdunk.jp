import { MARKETS, Market } from "@/lib/types";

export default function MarketTag({ code }: { code: Market }) {
  const m = MARKETS.find((x) => x.code === code);
  return (
    <span className="pill bg-plum-50 text-plum-700">
      <span>{m?.flag}</span>
      {code}
    </span>
  );
}
