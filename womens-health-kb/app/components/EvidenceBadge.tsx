import { EVIDENCE, EvidenceLevel } from "@/lib/types";

const TONE: Record<string, { bg: string; fg: string; dot: string }> = {
  strong: { bg: "bg-strong-bg", fg: "text-strong-fg", dot: "bg-strong-dot" },
  trad: { bg: "bg-trad-bg", fg: "text-trad-fg", dot: "bg-trad-dot" },
  anec: { bg: "bg-anec-bg", fg: "text-anec-fg", dot: "bg-anec-dot" },
};

export default function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  const e = EVIDENCE[level];
  const t = TONE[e.tone];
  return (
    <span className={`pill ${t.bg} ${t.fg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {e.label}
    </span>
  );
}
