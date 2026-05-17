from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ConditionPriceOut(BaseModel):
    condition_id: int
    condition_name: str
    min_price: Optional[float]
    min_price_format: Optional[str]
    currency: str
    sort_order: int
    last_updated: datetime
    price_source: str = "listing_min"
    sales_count: int = 0

    class Config:
        from_attributes = True


class PriceHistoryOut(BaseModel):
    id: int
    price: Optional[float]
    currency: str
    captured_at: datetime
    condition_id: Optional[int] = None
    condition_name: Optional[str] = None

    class Config:
        from_attributes = True


class CardOut(BaseModel):
    id: int
    snkrdunk_id: Optional[str]
    name: str
    image_url: Optional[str]
    product_url: str
    current_price: Optional[float]
    currency: str
    popularity_rank: Optional[int]
    last_updated: Optional[datetime]
    created_at: datetime
    condition_prices: List[ConditionPriceOut] = []

    class Config:
        from_attributes = True


class SaleEventOut(BaseModel):
    id: int
    listing_id: int
    listing_uid: Optional[str] = None
    condition_name: str
    price: float
    currency: str
    price_format: Optional[str] = None
    thumbnail_url: Optional[str] = None
    captured_at: datetime

    class Config:
        from_attributes = True


class CardDetail(CardOut):
    price_history: List[PriceHistoryOut] = []
    recent_sales: List[SaleEventOut] = []


class CardImport(BaseModel):
    name: str
    product_url: str
    image_url: Optional[str] = None
    current_price: Optional[float] = Field(default=None, ge=0)
    currency: str = "USD"
    popularity_rank: Optional[int] = Field(default=None, ge=1)
    snkrdunk_id: Optional[str] = None


class PortfolioItemCreate(BaseModel):
    card_id: int
    quantity: int = Field(default=1, ge=1)
    purchase_price: float = Field(default=0, ge=0)
    purchase_price_currency: Optional[str] = None


class PortfolioItemUpdate(BaseModel):
    quantity: Optional[int] = Field(default=None, ge=1)
    purchase_price: Optional[float] = Field(default=None, ge=0)
    purchase_price_currency: Optional[str] = None


class PortfolioItemOut(BaseModel):
    id: int
    card_id: int
    quantity: int
    purchase_price: float
    purchase_price_currency: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    card: CardOut

    class Config:
        from_attributes = True


class SyncResult(BaseModel):
    ok: bool
    synced: int
    message: str
