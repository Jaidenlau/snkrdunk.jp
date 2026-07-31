export type Market = "US" | "EU" | "CN" | "AU";
export type EvidenceLevel = "strong_evidence" | "traditional_practice" | "anecdotal";

export const MARKETS: { code: Market; label: string; flag: string }[] = [
  { code: "US", label: "United States", flag: "🇺🇸" },
  { code: "EU", label: "Europe", flag: "🇪🇺" },
  { code: "CN", label: "China", flag: "🇨🇳" },
  { code: "AU", label: "Australia", flag: "🇦🇺" },
];

export const EVIDENCE: Record<EvidenceLevel, { label: string; tone: "strong" | "trad" | "anec" }> = {
  strong_evidence: { label: "Strong evidence", tone: "strong" },
  traditional_practice: { label: "Traditional practice", tone: "trad" },
  anecdotal: { label: "Anecdotal", tone: "anec" },
};

export const LIFE_STAGES: { code: string; label: string; group: "Pregnancy" | "Postpartum" }[] = [
  { code: "pregnancy_t1", label: "First trimester", group: "Pregnancy" },
  { code: "pregnancy_t2", label: "Second trimester", group: "Pregnancy" },
  { code: "pregnancy_t3", label: "Third trimester", group: "Pregnancy" },
  { code: "postpartum_early", label: "Early recovery (0–6 wks)", group: "Postpartum" },
  { code: "postpartum_months_1_3", label: "Months 1–3", group: "Postpartum" },
  { code: "postpartum_months_4_12", label: "Months 4–12", group: "Postpartum" },
];

export function stageLabel(code: string): string {
  return LIFE_STAGES.find((s) => s.code === code)?.label ?? code;
}

export interface Claim {
  id: string;
  statement: string;
  life_stage: string;
  market: Market;
  topic_domain: string;
  evidence_level: EvidenceLevel;
  confidence_note: string | null;
  status: string;
  reviewer: string | null;
  review_date: string | null;
  human_confirmed?: boolean;
  sources?: SourceRef[];
}

export interface SourceRef {
  publisher: string | null;
  title: string;
  url: string | null;
  relation: string;
  published_date: string | null;
  excerpt?: string | null;
  checked_on?: string | null;
}

export interface JourneyStage {
  id: string;
  life_stage: string;
  market: Market;
  title: string;
  overview: string | null;
  physical: string | null;
  emotional: string | null;
  claim_count?: number;
}

export interface Competitor {
  id: string;
  company: string;
  markets: Market[];
  categories: string[];
  positioning: string | null;
  claims_made: string | null;
  evidence_check: string | null;
}
