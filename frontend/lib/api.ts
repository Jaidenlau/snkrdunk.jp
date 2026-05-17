import type { Card, CardDetail, ConditionPrice, PortfolioItem, TokenResponse } from "./types";

export const DEFAULT_CONDITION = "PSA 10";

export type ConditionGroup = "Raw" | "PSA" | "BGS" | "ARS" | "Other";

export type KnownCondition = {
  conditionId: number;
  name: string;
  group: ConditionGroup;
  sortOrder: number;
};

// Per client request: only A/B/C/D/PSA 10 are shown. PSA 10 is the default.
export const KNOWN_CONDITIONS: KnownCondition[] = [
  { conditionId: 18, name: "A", group: "Raw", sortOrder: 10 },
  { conditionId: 19, name: "B", group: "Raw", sortOrder: 20 },
  { conditionId: 20, name: "C", group: "Raw", sortOrder: 30 },
  { conditionId: 21, name: "D", group: "Raw", sortOrder: 40 },
  { conditionId: 22, name: "PSA 10", group: "PSA", sortOrder: 100 }
];

export function pickDefaultCondition(card: Pick<Card, "condition_prices" | "current_price" | "currency">): ConditionPrice | null {
  const prices = card.condition_prices ?? [];
  if (!prices.length) return null;
  const psa10 = prices.find((entry) => entry.condition_name === DEFAULT_CONDITION && entry.min_price !== null);
  if (psa10) return psa10;
  const priced = prices.filter((entry) => entry.min_price !== null);
  if (!priced.length) return prices[0] ?? null;
  return priced.reduce((best, entry) => {
    if (entry.sort_order < best.sort_order) return entry;
    return best;
  }, priced[0]);
}

type SyncResult = {
  ok: boolean;
  synced: number;
  message: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "pokemon_price_tracker_token";

export type DisplayCurrency = "HKD" | "JPY" | "USD";

type RegionalPreference = {
  locale: string;
  currency: DisplayCurrency;
  regionLabel: string;
  isHongKong: boolean;
};

// Cross-rates relative to JPY. Updated periodically (rough mid-market values).
const FX_TO_JPY: Record<string, number> = {
  JPY: 1,
  HKD: 19.2,
  USD: 150,
};

const REGION_KEY = "snkrdunk_region";

function detectHongKong(): boolean {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const normalized = languages.map((language) => language.toLowerCase());
  if (normalized.some((lang) => lang.includes("zh-hk") || lang.includes("en-hk") || lang.includes("zh-cn") || lang === "zh")) {
    return true;
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZone === "Asia/Hong_Kong" || timeZone === "Asia/Shanghai" || timeZone === "Asia/Macau";
}

export function getRegionalPreference(): RegionalPreference {
  if (typeof window === "undefined") {
    return { locale: "ja-JP", currency: "JPY", regionLabel: "Global", isHongKong: false };
  }

  const regionOverride =
    new URLSearchParams(window.location.search).get("region")?.toUpperCase() ||
    window.localStorage.getItem(REGION_KEY)?.toUpperCase();

  // Explicit user choice always wins over geo detection.
  if (regionOverride === "HK" || regionOverride === "HKD") {
    return { locale: "zh-HK", currency: "HKD", regionLabel: "Hong Kong", isHongKong: true };
  }
  if (regionOverride === "JP" || regionOverride === "GLOBAL") {
    return { locale: "ja-JP", currency: "JPY", regionLabel: "Global", isHongKong: false };
  }
  if (regionOverride === "US" || regionOverride === "USD") {
    return { locale: "en-US", currency: "USD", regionLabel: "United States", isHongKong: false };
  }

  // No override: default to HKD for HK/China, JPY everywhere else.
  if (detectHongKong()) {
    return { locale: "zh-HK", currency: "HKD", regionLabel: "Hong Kong", isHongKong: true };
  }
  return { locale: "ja-JP", currency: "JPY", regionLabel: "Global", isHongKong: false };
}

export function convertMoney(value: number | null | undefined, fromCurrency: string, targetCurrency: string) {
  if (value === null || value === undefined) return 0;
  const from = (fromCurrency || "JPY").toUpperCase();
  const target = (targetCurrency || "JPY").toUpperCase();
  if (from === target) return value;
  // First convert source -> JPY, then JPY -> target.
  const inJpy = value * (FX_TO_JPY[from] ?? 1);
  if (target === "JPY") return inJpy;
  return inJpy / (FX_TO_JPY[target] ?? 1);
}

export function roundMoneyInput(value: number, currency: DisplayCurrency) {
  return currency === "JPY" ? Math.round(value) : Number(value.toFixed(2));
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch {
      // Keep the status message if the backend did not return JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  listCards: () => request<Card[]>("/cards"),
  getCard: (id: string | number) => request<CardDetail>(`/cards/${id}`),
  syncCards: () =>
    request<SyncResult>("/admin/sync-cards", {
      method: "POST"
    }),
  importCards: (cards: unknown[]) =>
    request<SyncResult>("/admin/import-cards", {
      method: "POST",
      body: JSON.stringify(cards)
    }),
  register: (email: string, password: string) =>
    request<TokenResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  getPortfolio: () => request<PortfolioItem[]>("/portfolio"),
  addPortfolioItem: (cardId: number, quantity: number, purchasePrice: number, purchasePriceCurrency = "USD") =>
    request<PortfolioItem>("/portfolio/items", {
      method: "POST",
      body: JSON.stringify({ card_id: cardId, quantity, purchase_price: purchasePrice, purchase_price_currency: purchasePriceCurrency })
    }),
  updatePortfolioItem: (itemId: number, quantity: number, purchasePrice: number, purchasePriceCurrency = "USD") =>
    request<PortfolioItem>(`/portfolio/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity, purchase_price: purchasePrice, purchase_price_currency: purchasePriceCurrency })
    }),
  deletePortfolioItem: (itemId: number) =>
    request<void>(`/portfolio/items/${itemId}`, {
      method: "DELETE"
    })
};

export function formatMoney(value: number | null | undefined, currency = "JPY") {
  if (value === null || value === undefined) return "Price unavailable";
  const regional = getRegionalPreference();
  const displayCurrency = regional.currency;
  const displayValue = convertMoney(value, currency, displayCurrency);
  return new Intl.NumberFormat(regional.locale, {
    style: "currency",
    currency: displayCurrency,
    maximumFractionDigits: displayCurrency === "JPY" ? 0 : 2,
  }).format(displayValue);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Not synced yet";
  const regional = getRegionalPreference();
  return new Intl.DateTimeFormat(regional.locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "not synced yet";
  const regional = getRegionalPreference();
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return regional.isHongKong ? `${seconds} 秒前` : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return regional.isHongKong ? `${minutes} 分鐘前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return regional.isHongKong ? `${hours} 小時前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return regional.isHongKong ? `${days} 日前` : `${days}d ago`;
}
