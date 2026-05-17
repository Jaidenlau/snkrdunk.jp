export type PriceSource = "sold_avg" | "listing_min";

export type ConditionPrice = {
  condition_id: number;
  condition_name: string;
  min_price: number | null;
  min_price_format: string | null;
  currency: string;
  sort_order: number;
  last_updated: string;
  price_source: PriceSource;
  sales_count: number;
};

export type Card = {
  id: number;
  snkrdunk_id: string | null;
  name: string;
  image_url: string | null;
  product_url: string;
  current_price: number | null;
  currency: string;
  popularity_rank: number | null;
  last_updated: string | null;
  created_at: string;
  condition_prices: ConditionPrice[];
};

export type PriceHistory = {
  id: number;
  price: number | null;
  currency: string;
  captured_at: string;
  condition_id: number | null;
  condition_name: string | null;
};

export type SaleEvent = {
  id: number;
  listing_id: number;
  listing_uid: string | null;
  condition_name: string;
  price: number;
  currency: string;
  price_format: string | null;
  thumbnail_url: string | null;
  captured_at: string;
};

export type CardDetail = Card & {
  price_history: PriceHistory[];
  recent_sales: SaleEvent[];
};

export type PortfolioItem = {
  id: number;
  card_id: number;
  quantity: number;
  purchase_price: number;
  purchase_price_currency: string | null;
  created_at: string;
  updated_at: string;
  card: Card;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
};
