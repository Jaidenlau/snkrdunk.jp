from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    portfolio_items = relationship("PortfolioItem", back_populates="user", cascade="all, delete-orphan")


class Card(Base):
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, index=True)
    snkrdunk_id = Column(String, unique=True, nullable=True, index=True)
    name = Column(String, nullable=False, index=True)
    image_url = Column(String, nullable=True)
    product_url = Column(String, unique=True, nullable=False, index=True)
    current_price = Column(Float, nullable=True)
    currency = Column(String, default="JPY", nullable=False)
    popularity_rank = Column(Integer, nullable=True, index=True)
    last_updated = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    price_history = relationship("PriceHistory", back_populates="card", cascade="all, delete-orphan")
    portfolio_items = relationship("PortfolioItem", back_populates="card", cascade="all, delete-orphan")
    condition_prices = relationship(
        "CardConditionPrice",
        back_populates="card",
        cascade="all, delete-orphan",
        order_by="CardConditionPrice.sort_order",
    )
    sale_events = relationship(
        "CardSaleEvent",
        back_populates="card",
        cascade="all, delete-orphan",
        order_by="CardSaleEvent.listing_id.desc()",
    )


class CardConditionPrice(Base):
    __tablename__ = "card_condition_prices"
    __table_args__ = (
        UniqueConstraint("card_id", "condition_id", name="uq_card_condition"),
    )

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("cards.id"), nullable=False, index=True)
    condition_id = Column(Integer, nullable=False)
    condition_name = Column(String, nullable=False)
    min_price = Column(Float, nullable=True)
    min_price_format = Column(String, nullable=True)
    currency = Column(String, default="USD", nullable=False)
    # Lower number = higher priority on UI tabs (PSA 10 first).
    sort_order = Column(Integer, default=100, nullable=False)
    last_updated = Column(DateTime, default=datetime.utcnow, nullable=False)
    # "sold_avg" when the price reflects an average of recent sold listings (auth required),
    # "listing_min" when it falls back to the lowest active listing.
    price_source = Column(String, default="listing_min", nullable=False)
    sales_count = Column(Integer, default=0, nullable=False)

    card = relationship("Card", back_populates="condition_prices")


class PriceHistory(Base):
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("cards.id"), nullable=False, index=True)
    price = Column(Float, nullable=True)
    currency = Column(String, default="JPY", nullable=False)
    captured_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    # Grade context for the snapshot. Older rows captured before per-condition tracking
    # have NULL values and are pruned by the lifespan migration so the chart stays consistent.
    condition_id = Column(Integer, nullable=True, index=True)
    condition_name = Column(String, nullable=True, index=True)

    card = relationship("Card", back_populates="price_history")


class CardSaleEvent(Base):
    """A single sold listing pulled from SNKRDUNK's public used-listings feed.

    SNKRDUNK does not expose a sold-at timestamp on this public endpoint, so the
    canonical ordering field is `listing_id` (assigned at listing creation time and
    monotonically increasing). The most recently listed sold rows are surfaced as the
    Trading History panel on the card detail page.
    """

    __tablename__ = "card_sale_events"
    __table_args__ = (
        UniqueConstraint("card_id", "listing_id", name="uq_sale_card_listing"),
    )

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("cards.id"), nullable=False, index=True)
    listing_id = Column(Integer, nullable=False, index=True)
    listing_uid = Column(String, nullable=True)
    condition_name = Column(String, nullable=False, index=True)
    price = Column(Float, nullable=False)
    currency = Column(String, default="USD", nullable=False)
    price_format = Column(String, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    captured_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    card = relationship("Card", back_populates="sale_events")


class PortfolioItem(Base):
    __tablename__ = "portfolio_items"
    __table_args__ = (UniqueConstraint("user_id", "card_id", name="uq_portfolio_user_card"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    card_id = Column(Integer, ForeignKey("cards.id"), nullable=False, index=True)
    quantity = Column(Integer, default=1, nullable=False)
    purchase_price = Column(Float, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Currency in which purchase_price is stored. NULL means legacy rows whose
    # currency was implicitly the card's currency at the time of saving.
    purchase_price_currency = Column(String, nullable=True)

    user = relationship("User", back_populates="portfolio_items")
    card = relationship("Card", back_populates="portfolio_items")
